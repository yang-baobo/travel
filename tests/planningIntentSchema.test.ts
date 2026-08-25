import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildLocalPlanIntent, validatePlanIntent } from '../src/utils/planIntentSchema';
import { intent, planningRequest } from './planningFixtures';

describe('PlanIntent Schema', () => {
  test('accepts a valid remote GLM result and preserves provider/model', () => {
    const value = validatePlanIntent(intent());
    assert.equal(value.provider, 'remote_glm');
    assert.equal(value.model, 'glm-test');
  });

  test('rejects forged fact fields in requestPatch', () => {
    assert.throws(() => validatePlanIntent({
      ...intent(),
      requestPatch: { hotelPrice: 299, latitude: 39.9 },
    }), /不允许修改的事实字段/);
  });

  test('local fallback is explicit and never claims a model', () => {
    const value = buildLocalPlanIntent(planningRequest(), 'network failed');
    assert.equal(value.provider, 'local_fallback');
    assert.equal(value.model, null);
    assert.match(value.explanation, /不会生成地点或价格/);
  });
});
