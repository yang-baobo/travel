import './setupNode';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPlanningRequest, toPlanningCandidate } from '../src/services/planningRequestBuilder';
import { createPlanningOrchestrator, planningOrchestrator } from '../src/services/planningOrchestrator';
import { addPlanningDays, localTodayISO } from '../src/services/planningDateValidation';
import { applyPlanningAnswer, PLANNING_REQUIREMENTS, missingRequiredRequirements } from '../src/services/planningCollection';
import { usePlanningSessionStore } from '../src/store/usePlanningSessionStore';
import { useTripStore } from '../src/store/useTripStore';
import { answerPlanningCollection, generatePlanningDraft } from '../src/services/planningSessionService';
import { emptyPlanningPatch } from '../src/services/planningPatch';
import { place, draft, intent, planningRequest } from './planningFixtures';
import type { RouteOptimizationRequest } from '../src/services/routeOptimizationService';
import { itineraryLegTiming } from '../src/utils/itineraryTiming';

function formRequest() {
  const base = planningRequest();
  return planningRequest({
    userInput: '', inputSource: 'form', mode: 'self', days: 1, pace: 'standard',
    candidates: [place('manual-a'), place('manual-b')].map(toPlanningCandidate),
    hardConstraints: { ...base.hardConstraints, mobilityLimitations: [] },
    preferenceSnapshot: { ...base.preferenceSnapshot, elderlyMode: false, travelReturnDate: base.preferenceSnapshot.travelStartDate },
  });
}

test('transport arrival and solver waiting are shown separately', () => {
  assert.deepEqual(itineraryLegTiming('14:00', '14:44', 16), { departAt: '14:00', arriveAt: '14:16', waitMinutes: 28 });
  assert.deepEqual(itineraryLegTiming('14:00', '14:44', 16, 20), { departAt: '14:20', arriveAt: '14:36', waitMinutes: 8 });
  assert.deepEqual(itineraryLegTiming('14:00', '14:44', null), { departAt: '14:00', arriveAt: '待核实', waitMinutes: 0 });
});

test('ordinary home selections enter the same planning flow without a canned route', () => {
  const date = addPlanningDays(localTodayISO(), 2);
  const request = buildPlanningRequest({ userInput: '', inputMethod: 'text', mode: 'self',
    params: { startDate: date, endDate: date, days: '1天', people: '2人', budget: '¥3000', pace: '标准游' },
    candidates: [place('chosen-one'), place('chosen-two')] });
  assert.equal(request.inputSource, 'form');
  assert.equal(request.days, 1);
  assert.deepEqual(request.candidates.map(p => p.sourceId), ['chosen-one', 'chosen-two']);
  assert.equal(request.preferenceSnapshot.travelReturnDate, date);
});

test('click-only answers confirm requirements without calling GLM; typed edits keep AI interpretation', () => {
  const request = formRequest();
  request.preferenceSnapshot.hasSetPreferences = false;
  usePlanningSessionStore.getState().beginSession(request, { entryMode: 'selected_places', confirmedRequirements: ['travel_time', 'people', 'budget', 'pace'] });
  for (const answer of ['历史建筑和北京美食', '打车为主', '不住酒店，安排两餐', '没有特殊限制']) {
    answerPlanningCollection(answer, 'text', true, true);
  }
  const session = usePlanningSessionStore.getState().session!;
  assert.equal(missingRequiredRequirements(session).length, 0);
  assert.equal(session.request.inputSource, 'form');
  assert.equal(session.request.preferenceSnapshot.needHotel, false);
  assert.equal(session.request.preferenceSnapshot.needLunch, true);
  assert.equal(session.request.preferenceSnapshot.needDinner, true);
  assert.equal(session.request.preferenceSnapshot.transportPreference, 'driving');
  const edit = applyPlanningAnswer(session.request, 'budget', '预算改成6000元');
  assert.equal(edit.request.inputSource, 'conversation');
  assert.equal(edit.request.totalBudget, 6000);
  assert.equal(edit.request.preferenceSnapshot.travelReturnDate, edit.request.preferenceSnapshot.travelStartDate);
});

test('meal quick answers handle both switching off and switching back on', () => {
  const off = applyPlanningAnswer(formRequest(), 'stay_meals', '不住酒店，午餐晚餐自理').request;
  assert.equal(off.preferenceSnapshot.needLunch, false);
  assert.equal(off.preferenceSnapshot.needDinner, false);
  const on = applyPlanningAnswer(off, 'stay_meals', '不住酒店，安排两餐').request;
  assert.equal(on.preferenceSnapshot.needLunch, true);
  assert.equal(on.preferenceSnapshot.needDinner, true);
});

test('normal form plan queries meals and real route interfaces; lunch/dinner get separate windows', async () => {
  let payload: RouteOptimizationRequest | undefined;
  let modelCalls = 0;
  let matrixCalls = 0;
  const request = formRequest();
  const orchestrator = createPlanningOrchestrator({
    getIntent: async () => { modelCalls++; throw new Error('unavailable subscription'); },
    searchPlaces: async category => ({ city: { name: '北京', adcode: '110000', citycode: '010' }, category, source: 'amap', page: 1, pageSize: 2, total: 2, hasMore: false,
      items: [place('lunch-poi', 'restaurant'), place('dinner-poi', 'restaurant')] }),
    searchHotels: async () => { throw new Error('no hotel requested'); },
    buildMatrix: async nodes => {
      matrixCalls++;
      return { node_ids: nodes.map(n => n.id), durations: nodes.map((_, i) => nodes.map((__, j) => i === j ? 0 : 12)), segments: [] };
    },
    optimize: async input => {
      payload = input;
      return { solver: 'google-or-tools', status: 'optimized',
        days: [{ day: 1, attraction_ids: input.attractions.map(p => p.id), travel_minutes: 36,
          stops: input.attractions.map(p => ({ attraction_id: p.id, arrival_minute: p.opening_windows[0][0], end_minute: p.opening_windows[0][0] + p.duration_minutes })) }],
        unassigned_attraction_ids: [], total_travel_minutes: 36, solve_time_ms: 1 };
    },
  });
  const result = await orchestrator.plan({ sessionId: 'normal-form-test', request, messages: [] });
  assert.equal(modelCalls, 0);
  assert.equal(matrixCalls, 1);
  assert.equal(result.intent.provider, 'confirmed_fields');
  assert.equal(result.draft?.days[0].stops.length, 4);
  assert.deepEqual(payload?.attractions.find(p => p.id === 'lunch-poi')?.opening_windows, [[690, 840]]);
  assert.deepEqual(payload?.attractions.find(p => p.id === 'dinner-poi')?.opening_windows, [[1020, 1200]]);
  assert.ok(payload?.attractions.every(p => p.required));
  assert.deepEqual(result.draft?.blockingIssues, []);
});

test('unknown price and other uncertainties survive commit and subsequent patch', () => {
  const input = draft({ warnings: ['provider warning'], uncertainties: ['门票未知'], knownCostTotal: 0, costCoverage: 'partial' });
  const store = useTripStore.getState();
  const trip = store.commitFromDraft(input);
  assert.deepEqual(trip.warnings, ['provider warning', '门票未知']);
  assert.equal(trip.costCoverage, 'partial');
  assert.deepEqual(store.applyDraftPatch(input).warnings, trip.warnings);
});

test('late conversational GLM refinement cannot invalidate an in-flight generation', async () => {
  const store = usePlanningSessionStore.getState();
  store.beginSession(formRequest(), { confirmedRequirements: PLANNING_REQUIREMENTS.map(r => r.key) });
  store.setStatus('collecting');
  const oldFetch = globalThis.fetch;
  const oldPlan = planningOrchestrator.plan;
  const oldBase = process.env.EXPO_PUBLIC_API_BASE_URL;
  let finishRefinement!: (response: Response) => void;
  let finishGeneration!: (outcome: Awaited<ReturnType<typeof oldPlan>>) => void;
  const refinement = new Promise<Response>(resolve => { finishRefinement = resolve; });
  const generation = new Promise<Awaited<ReturnType<typeof oldPlan>>>(resolve => { finishGeneration = resolve; });
  try {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://test.invalid';
    globalThis.fetch = async () => refinement;
    planningOrchestrator.plan = async input => {
      input.onProgress?.({ status: 'understanding', message: 'test generation' });
      return generation;
    };
    answerPlanningCollection('预算改成6000元');
    const accepted = usePlanningSessionStore.getState().session!.request;
    const pending = generatePlanningDraft();
    assert.equal(usePlanningSessionStore.getState().session!.status, 'understanding');
    const patch = emptyPlanningPatch('text');
    patch.set.totalBudget = 9000;
    patch.confirmedRequirements = ['budget'];
    finishRefinement(new Response(JSON.stringify({ ...intent(accepted), planningPatch: patch })));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(usePlanningSessionStore.getState().session!.request.revision, accepted.revision);
    assert.equal(usePlanningSessionStore.getState().session!.request.totalBudget, 6000);
    finishGeneration({ intent: intent(accepted), request: accepted, draft: draft({ request: accepted }) });
    await pending;
    assert.equal(usePlanningSessionStore.getState().session!.status, 'draft_ready');
  } finally {
    globalThis.fetch = oldFetch;
    planningOrchestrator.plan = oldPlan;
    if (oldBase === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
    else process.env.EXPO_PUBLIC_API_BASE_URL = oldBase;
  }
});
