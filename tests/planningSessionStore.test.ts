import './setupNode';
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { usePlanningSessionStore } from '../src/store/usePlanningSessionStore';
import { planningRequest } from './planningFixtures';

beforeEach(() => usePlanningSessionStore.getState().reset());

describe('Planning Session Store', () => {
  test('retains structured request and complete real candidate identity', () => {
    const request = planningRequest();
    const id = usePlanningSessionStore.getState().beginSession(request);
    const session = usePlanningSessionStore.getState().session!;
    assert.equal(session.id, id);
    assert.equal(session.request.days, 2);
    assert.equal(session.request.people, 2);
    assert.equal(session.request.totalBudget, 5000);
    assert.equal(session.request.candidates[0].sourceId, 'amap:selected');
    assert.equal(session.request.candidates[0].latitude, request.candidates[0].originalPlace.location.latitude);
    assert.equal(session.request.candidates[0].originalPlace.id, 'amap:selected');
  });

  test('text, ASR and Realtime messages stay in one session', () => {
    const id = usePlanningSessionStore.getState().beginSession(planningRequest());
    usePlanningSessionStore.getState().addMessage({ role: 'user', text: '少走路', inputMethod: 'asr' });
    usePlanningSessionStore.getState().addMessage({ role: 'user', text: '不要夜间活动', inputMethod: 'realtime' });
    const session = usePlanningSessionStore.getState().session!;
    assert.equal(session.id, id);
    assert.deepEqual(session.messages.filter(message => message.role === 'user').map(message => message.inputMethod), ['text', 'asr', 'realtime']);
  });
});
