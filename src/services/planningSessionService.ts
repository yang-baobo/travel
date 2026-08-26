import { usePlanningSessionStore } from '../store/usePlanningSessionStore';
import { useTripStore } from '../store/useTripStore';
import type { PlanningInputMethod, PlanningRequest, TripPlanDraft } from '../types/planning';
import {
  applyPlanningAnswer,
  missingRequiredRequirements,
  nextRequirement,
  planningQuestion,
  requirementSummary,
} from './planningCollection';
import { refreshPlanningRequestPreferences } from './planningRequestBuilder';
import { planningOrchestrator } from './planningOrchestrator';

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/invalid_request_error|request_id|request is invalid|check the request body/i.test(message)) {
    return 'AI 理解服务暂时不可用，已保留你填写的条件。请稍后重试。';
  }
  return message || '规划服务暂时不可用';
}

export function ensurePlanningCollectionPrompt(): void {
  const store = usePlanningSessionStore.getState();
  const session = store.session;
  if (!session) return;
  if (!session.messages.some(message => message.role === 'assistant')) {
    const first = nextRequirement(session);
    store.addMessage({
      role: 'assistant',
      text: first
        ? `我会先把制定路线必须的信息逐项记下来，收齐后再查询真实数据。${planningQuestion(first.key, session.request)}`
        : '制定路线所需的信息已经齐全。你可以先核对偏好与必填项，再开始生成真实路线。',
    });
  }
  store.setStatus('collecting');
}

export function answerPlanningCollection(
  text: string,
  inputMethod: PlanningInputMethod = 'text',
  recordMessage = true,
): void {
  const store = usePlanningSessionStore.getState();
  const session = store.session;
  if (!session || !text.trim()) return;
  const active = nextRequirement(session);
  if (!active) return;
  if (recordMessage) store.addMessage({ role: 'user', text: text.trim(), inputMethod });
  const applied = applyPlanningAnswer(session.request, active.key, text);
  store.updateRequest(applied.request);
  applied.confirmedKeys.forEach(key => {
    store.updateRequirement(key, requirementSummary(key, applied.request), inputMethod);
  });
  const updated = usePlanningSessionStore.getState().session;
  if (!updated) return;
  const next = nextRequirement(updated);
  if (next) {
    const understood = applied.confirmedKeys.length
      ? `好的，已经记下：${applied.confirmedKeys.map(key => requirementSummary(key, applied.request)).join('；')}。`
      : '这条信息我已经保留，但还不能确认当前必填项。';
    store.addMessage({ role: 'assistant', text: `${understood}${planningQuestion(next.key, updated.request)}` });
    store.setStatus('collecting');
  } else {
    store.addMessage({ role: 'assistant', text: '必填信息已经收齐。请核对上方记录；确认无误后，我再去查询真实景点、酒店、餐厅和交通。' });
    store.setStatus('collecting');
  }
}

export function syncPlanningPreferences(): void {
  const store = usePlanningSessionStore.getState();
  const session = store.session;
  if (!session) return;
  const request = refreshPlanningRequestPreferences(session.request);
  store.updateRequest(request);
  (['preferences', 'transport', 'stay_meals', 'constraints'] as const).forEach(key => {
    store.updateRequirement(key, requirementSummary(key, request), 'preference_settings');
  });
}

export async function generatePlanningDraft(): Promise<void> {
  const store = usePlanningSessionStore.getState();
  const session = store.session;
  if (!session) throw new Error('规划会话不存在，请从首页重新开始。');
  const missing = missingRequiredRequirements(session);
  if (missing.length) {
    store.setStatus('collecting');
    store.addMessage({ role: 'assistant', text: `还需要确认：${missing.map(item => item.label).join('、')}。${planningQuestion(missing[0].key, session.request)}` });
    return;
  }
  await runPlanningSession(session.request, true);
}

export async function runPlanningSession(request: PlanningRequest, reuseCurrentSession = false): Promise<void> {
  const store = usePlanningSessionStore.getState();
  const current = store.session;
  const sessionId = reuseCurrentSession && current
    ? current.id
    : store.beginSession(request);
  if (reuseCurrentSession && current) store.updateRequest(request);
  const active = usePlanningSessionStore.getState().session;
  if (!active) return;
  const missing = missingRequiredRequirements(active);
  if (missing.length) {
    store.setStatus('collecting');
    store.addMessage({ role: 'assistant', text: `生成前还需要确认：${missing.map(item => item.label).join('、')}。${planningQuestion(missing[0].key, request)}` });
    return;
  }
  store.setError(null);
  try {
    const outcome = await planningOrchestrator.plan({
      sessionId,
      request,
      messages: active.messages,
      onProgress: ({ status, message }) => {
        const live = usePlanningSessionStore.getState();
        live.setStatus(status);
        live.addMessage({ role: 'system', text: message });
      },
    });
    const live = usePlanningSessionStore.getState();
    live.updateRequest(outcome.request);
    live.setPlanIntent(outcome.intent);
    live.addMessage({ role: 'assistant', text: outcome.intent.explanation });
    if (outcome.intent.needsClarification) {
      live.setStatus('needs_clarification');
      outcome.intent.clarificationQuestions.forEach(question => live.addMessage({ role: 'assistant', text: question }));
      return;
    }
    live.setDraft(outcome.draft);
    live.setStatus('draft_ready');
  } catch (error) {
    usePlanningSessionStore.getState().setError(errorMessage(error));
  }
}

export async function answerPlanningClarification(text: string): Promise<void> {
  const store = usePlanningSessionStore.getState();
  const session = store.session;
  if (!session || !text.trim()) return;
  store.addMessage({ role: 'user', text: text.trim(), inputMethod: 'text' });
  const request = { ...session.request, userInput: `${session.request.userInput}\n补充：${text.trim()}`.trim() };
  if (session.committedTripId) {
    await previewCommittedTripPatch(request, text.trim());
    return;
  }
  await runPlanningSession(request, true);
}

export async function previewCommittedTripPatch(request: PlanningRequest, explanation: string): Promise<void> {
  const store = usePlanningSessionStore.getState();
  const session = store.session;
  const trip = useTripStore.getState().currentTrip;
  if (!session || !trip || session.committedTripId !== trip.id) throw new Error('正式行程上下文已变化，请重新打开当前行程。');
  store.setError(null);
  try {
    const outcome = await planningOrchestrator.plan({
      sessionId: session.id,
      request,
      messages: usePlanningSessionStore.getState().session?.messages || [],
      onProgress: ({ status, message }) => {
        const live = usePlanningSessionStore.getState();
        live.setStatus(status);
        live.addMessage({ role: 'system', text: message });
      },
    });
    if (!outcome.draft) {
      store.setPlanIntent(outcome.intent);
      store.setStatus('needs_clarification');
      return;
    }
    store.updateRequest(outcome.request);
    store.setPlanIntent(outcome.intent);
    store.setDraft(outcome.draft);
    store.setPatchPreview({
      id: `patch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      baseTripId: trip.id,
      explanation,
      proposedDraft: outcome.draft,
      createdAt: new Date().toISOString(),
    });
    store.setStatus('draft_ready');
  } catch (error) {
    store.setError(errorMessage(error));
  }
}

export async function retryPlanningSession(): Promise<void> {
  const session = usePlanningSessionStore.getState().session;
  if (session) await runPlanningSession(session.request, true);
}

export async function replacePlanningDraft(): Promise<void> {
  const store = usePlanningSessionStore.getState();
  const session = store.session;
  if (!session) return;
  store.addMessage({ role: 'user', text: '请换一个满足同样条件的真实路线。', inputMethod: 'text' });
  await runPlanningSession({ ...session.request, userInput: `${session.request.userInput}\n换一个真实方案` }, true);
}

export function validateDraftForCommit(draft: TripPlanDraft): string[] {
  const errors = [...draft.blockingIssues];
  if (draft.days.every(day => day.stops.length === 0)) errors.push('路线草稿没有可提交的地点。');
  draft.days.flatMap(day => day.stops).forEach(stop => {
    if (stop.place.source !== 'amap') errors.push(`${stop.place.name} 不是高德真实地点。`);
    if (!Number.isFinite(stop.place.location.latitude) || !Number.isFinite(stop.place.location.longitude)) {
      errors.push(`${stop.place.name} 缺少有效坐标。`);
    }
  });
  if (draft.request.preferenceSnapshot.needHotel && (!draft.hotel || !draft.hotel.coordinateVerified || draft.hotel.coordinateSource !== 'amap')) {
    errors.push('需要住宿，但酒店尚未同时通过 FlyAI 查询与高德坐标核验。');
  }
  return [...new Set(errors)];
}

export function commitDraft(): string {
  const planning = usePlanningSessionStore.getState();
  const draft = planning.session?.draft;
  if (!draft) throw new Error('当前没有可确认的路线草稿。');
  const errors = validateDraftForCommit(draft);
  if (errors.length > 0) throw new Error(errors.join('\n'));
  planning.setStatus('committing');
  const patchPreview = planning.session?.patchPreview;
  const tripStore = useTripStore.getState();
  const trip = patchPreview
    ? (() => {
        if (tripStore.currentTrip?.id !== patchPreview.baseTripId) throw new Error('正式行程已变化，不能应用过期的修改预览。');
        return tripStore.applyDraftPatch(patchPreview.proposedDraft);
      })()
    : tripStore.commitFromDraft(draft);
  planning.setPatchPreview(null);
  planning.setCommittedTripId(trip.id);
  return trip.id;
}
