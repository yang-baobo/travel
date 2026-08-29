import './setupNode';
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { assessPlaceAccessibility, isMobilityConflict } from '../src/services/mobilityPolicy';
import { place, planningRequest } from './planningFixtures';

describe('mobility-aware candidate screening', () => {
  test('flags a likely high-effort attraction when mobility limits are active', () => {
    const wall = { ...place('amap:badaling'), name: '八达岭长城', typeName: '风景名胜' };
    const assessment = assessPlaceAccessibility(wall);
    assert.equal(assessment.status, 'limited');
    assert.equal(assessment.walkingEvidence, 'high');
    assert.equal(isMobilityConflict(wall, planningRequest()), true);
  });

  test('does not invent accessibility evidence for an ordinary place', () => {
    const generic = { ...place('amap:generic'), name: '东城区文化馆', typeName: '文化场馆' };
    const assessment = assessPlaceAccessibility(generic);
    assert.equal(assessment.status, 'unknown');
    assert.equal(assessment.walkingEvidence, 'unknown');
    assert.equal(isMobilityConflict(generic, planningRequest()), false);
  });

  test('accepts explicit public accessibility clues without treating them as a guarantee', () => {
    const accessible = {
      ...place('amap:accessible'),
      name: '故宫博物院无障碍入口',
      tags: ['无障碍入口', '接驳车'],
    };
    const assessment = assessPlaceAccessibility(accessible);
    assert.equal(assessment.status, 'verified');
    assert.equal(assessment.walkingEvidence, 'low');
    assert.equal(isMobilityConflict(accessible, planningRequest()), false);
  });
});
