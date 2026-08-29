import './setupNode';
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { applyPlanningAnswer } from '../src/services/planningCollection';
import { applyPlanningPatch, buildLocalPlanningPatch, validatePlanningPatch } from '../src/services/planningPatch';
import { planningRequest } from './planningFixtures';

describe('PlanningPatch', () => {
  test('understands colloquial budget and keeps it confirmed', () => {
    const request = planningRequest({ userInput: '' });
    const patch = buildLocalPlanningPatch('6000吧', request);
    const next = applyPlanningPatch(request, patch, '6000吧');
    assert.equal(next.totalBudget, 6000);
    assert.ok(patch.confirmedRequirements.includes('budget'));
  });

  test('understands multiple fields, hybrid transport, and place intent in one utterance', () => {
    const request = planningRequest({ userInput: '' });
    const patch = buildLocalPlanningPatch('9月20日出发三天，一家四口，预算8000，故宫一定去，天安门广场不用去，地铁为主，太远就打车', request);
    const next = applyPlanningPatch(request, patch, 'multi');
    assert.equal(next.days, 3);
    assert.equal(next.people, 4);
    assert.equal(next.totalBudget, 8000);
    assert.equal(next.preferenceSnapshot.transportPreference, 'any');
    assert.equal(next.transportPlan?.primary, 'transit');
    assert.equal(next.transportPlan?.fallback, 'driving');
    assert.equal(next.unresolvedPlaceMentions?.find(item => item.name === '故宫')?.intent, 'must_visit');
    assert.equal(next.unresolvedPlaceMentions?.find(item => item.name === '天安门广场')?.intent, 'avoid');
  });

  test('hard constraints tighten and cannot be relaxed by an ordinary patch', () => {
    const request = planningRequest();
    const patch = validatePlanningPatch({ set: { maxWalkingMinutesPerDay: 60, noNightActivity: true }, addDietaryAllergies: ['花生'], dayConstraints: [{ day: 2, maxWalkingMinutes: 30 }], reply: 'ok' });
    const next = applyPlanningPatch(request, patch);
    assert.equal(next.hardConstraints.maxWalkingMinutesPerDay, 60);
    assert.equal(next.hardConstraints.noNightActivity, true);
    assert.ok(next.hardConstraints.dietaryAllergies.includes('花生'));
    assert.equal(next.dayConstraints?.find(item => item.day === 2)?.maxWalkingMinutes, 30);
  });

  test('rejects protocol fields that could smuggle provider facts', () => {
    assert.throws(() => validatePlanningPatch({ set: { sourceId: 'amap:forged' } }), /协议外字段/);
  });

  test('interprets a bare number only when the active requirement is budget', () => {
    const request = planningRequest({ userInput: '', totalBudget: 5000 });
    const budgetAnswer = applyPlanningAnswer(request, 'budget', '10000', 'text');
    assert.equal(budgetAnswer.request.totalBudget, 10000);
    assert.ok(budgetAnswer.confirmedKeys.includes('budget'));

    const unrelatedAnswer = applyPlanningAnswer(request, 'preferences', '10000', 'text');
    assert.equal(unrelatedAnswer.request.totalBudget, 5000);
    assert.equal(unrelatedAnswer.confirmedKeys.includes('budget'), false);
  });

  test('derives a conservative mobility policy from a parent-care statement', () => {
    const request = planningRequest({
      userInput: '',
      people: 2,
      hardConstraints: {
        ...planningRequest().hardConstraints,
        maxWalkingMinutesPerDay: 90,
        maxWalkingMinutesPerSegment: 20,
        mobilityLimitations: [],
      },
      preferenceSnapshot: {
        ...planningRequest().preferenceSnapshot,
        elderlyMode: false,
      },
    });
    const answer = applyPlanningAnswer(request, 'people', '我想和父母一起，他们两个腿脚不太好', 'text');
    const next = answer.request;
    assert.equal(next.people, 3);
    assert.equal(next.preferenceSnapshot.elderlyMode, true);
    assert.equal(next.pace, 'relaxed');
    assert.equal(next.transportPlan?.primary, 'driving');
    assert.equal(next.transportPlan?.fallback, 'transit');
    assert.equal(next.hardConstraints.maxWalkingMinutesPerDay, 60);
    assert.equal(next.hardConstraints.maxWalkingMinutesPerSegment, 10);
    assert.ok(next.hardConstraints.mobilityLimitations.some(item => /腿脚|父母/.test(item)));
    assert.ok(next.derivedConstraints?.some(item => item.type === 'limited_mobility' && item.severity === 'hard'));
    assert.ok(next.derivedConstraints?.some(item => item.type === 'door_to_door_transport'));
    assert.ok(answer.confirmedKeys.includes('people'));
    assert.ok(answer.confirmedKeys.includes('constraints'));
  });

  test('never relaxes an existing stricter walking limit', () => {
    const request = planningRequest({
      userInput: '',
      hardConstraints: {
        ...planningRequest().hardConstraints,
        maxWalkingMinutesPerDay: 30,
        maxWalkingMinutesPerSegment: 5,
        mobilityLimitations: [],
      },
    });
    const answer = applyPlanningAnswer(request, 'constraints', '我和父母一起，腿脚不太好', 'text');
    assert.equal(answer.request.hardConstraints.maxWalkingMinutesPerDay, 30);
    assert.equal(answer.request.hardConstraints.maxWalkingMinutesPerSegment, 5);
  });
});
