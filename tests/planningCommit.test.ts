import './setupNode';
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { commitDraft, validateDraftForCommit } from '../src/services/planningSessionService';
import { usePlanningSessionStore } from '../src/store/usePlanningSessionStore';
import { useTripStore } from '../src/store/useTripStore';
import { draft, planningRequest } from './planningFixtures';

beforeEach(() => {
  usePlanningSessionStore.getState().reset();
  useTripStore.setState({ currentTrip: null });
});

describe('Planning draft commit', () => {
  test('draft does not change formal Trip before explicit commit', () => {
    usePlanningSessionStore.getState().beginSession(planningRequest());
    usePlanningSessionStore.getState().setDraft(draft());
    assert.equal(useTripStore.getState().currentTrip, null);
    const tripId = commitDraft();
    assert.equal(useTripStore.getState().currentTrip?.id, tripId);
    assert.equal(usePlanningSessionStore.getState().session?.committedTripId, tripId);
  });

  test('blocking issues prevent commit', () => {
    assert.deepEqual(validateDraftForCommit(draft({ blockingIssues: ['酒店未核验'] })), ['酒店未核验']);
  });

  test('patch preview only updates the same formal Trip after confirmation', () => {
    usePlanningSessionStore.getState().beginSession(planningRequest());
    usePlanningSessionStore.getState().setDraft(draft());
    const tripId = commitDraft();
    const proposed = draft({ id: 'draft-patch', title: '调整后的北京路线' });
    usePlanningSessionStore.getState().setDraft(proposed);
    usePlanningSessionStore.getState().setPatchPreview({ id: 'patch-1', baseTripId: tripId, explanation: '少走路', proposedDraft: proposed, createdAt: new Date().toISOString() });
    assert.notEqual(useTripStore.getState().currentTrip?.title, '调整后的北京路线');
    const patchedId = commitDraft();
    assert.equal(patchedId, tripId);
    assert.equal(useTripStore.getState().currentTrip?.title, '调整后的北京路线');
  });
});
