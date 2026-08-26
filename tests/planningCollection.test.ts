import './setupNode';
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import {
  applyPlanningAnswer,
  buildPlanningRequirements,
  missingRequiredRequirements,
} from '../src/services/planningCollection';
import { generatePlanningDraft } from '../src/services/planningSessionService';
import { usePlanningSessionStore } from '../src/store/usePlanningSessionStore';
import { planningRequest } from './planningFixtures';

beforeEach(() => usePlanningSessionStore.getState().reset());

describe('Planning information collection', () => {
  test('keeps required fields separate from optional attractions', () => {
    const base = planningRequest();
    const request = planningRequest({
      userInput: '',
      candidates: [],
      preferenceSnapshot: { ...base.preferenceSnapshot, hasSetPreferences: false },
    });
    const requirements = buildPlanningRequirements(request, 'chat');
    assert.equal(requirements.find(item => item.key === 'city')?.status, 'confirmed');
    assert.equal(requirements.find(item => item.key === 'travel_time')?.status, 'missing');
    assert.equal(requirements.find(item => item.key === 'attractions')?.required, false);
  });

  test('one conversational answer migrates every recognized fact into the structured request', () => {
    const base = planningRequest();
    const request = planningRequest({
      userInput: '',
      candidates: [],
      preferenceSnapshot: { ...base.preferenceSnapshot, hasSetPreferences: false },
    });
    const answer = applyPlanningAnswer(
      request,
      'travel_time',
      '2026-09-20出发3天，家庭4人，总预算¥8000，轻松游，公交地铁为主，需要酒店和午餐晚餐，喜欢历史建筑，没有特殊限制',
    );
    assert.equal(answer.request.days, 3);
    assert.equal(answer.request.people, 4);
    assert.equal(answer.request.totalBudget, 8000);
    assert.equal(answer.request.pace, 'relaxed');
    assert.equal(answer.request.preferenceSnapshot.transportPreference, 'transit');
    assert.equal(answer.request.preferenceSnapshot.needHotel, true);
    assert.ok(answer.request.preferenceSnapshot.selectedCategories.includes('cat03'));
    for (const key of ['travel_time', 'people', 'budget', 'pace', 'preferences', 'transport', 'stay_meals', 'constraints']) {
      assert.ok(answer.confirmedKeys.includes(key as any), `missing confirmation for ${key}`);
    }
  });

  test('a generic hotel answer cannot silently stand in for attraction and experience preferences', () => {
    const base = planningRequest();
    const request = planningRequest({ userInput: '', preferenceSnapshot: { ...base.preferenceSnapshot, hasSetPreferences: false } });
    const answer = applyPlanningAnswer(request, 'stay_meals', '需要酒店，也安排午餐晚餐');
    assert.ok(answer.confirmedKeys.includes('stay_meals'));
    assert.equal(answer.confirmedKeys.includes('preferences'), false);
  });

  test('selected-place, chat and realtime entries retain one shared Planning Session shape', () => {
    const request = planningRequest();
    for (const entryMode of ['selected_places', 'chat', 'realtime'] as const) {
      usePlanningSessionStore.getState().beginSession(request, { entryMode });
      const session = usePlanningSessionStore.getState().session!;
      assert.equal(session.entryMode, entryMode);
      assert.equal(session.request.candidates[0].sourceId, request.candidates[0].sourceId);
      assert.ok(session.requirements.length >= 10);
    }
  });

  test('does not call the orchestrator while required information is missing', async () => {
    const base = planningRequest();
    const request = planningRequest({
      userInput: '',
      candidates: [],
      preferenceSnapshot: { ...base.preferenceSnapshot, hasSetPreferences: false },
    });
    usePlanningSessionStore.getState().beginSession(request, { entryMode: 'chat' });
    await generatePlanningDraft();
    const session = usePlanningSessionStore.getState().session!;
    assert.equal(session.status, 'collecting');
    assert.equal(session.draft, null);
    assert.ok(missingRequiredRequirements(session).length > 0);
    assert.match(session.messages.at(-1)?.text || '', /还需要确认/);
  });
});
