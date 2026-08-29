import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const planningScreen = read('src/screens/explore/AIPlanningScreen.tsx');
const confirmation = read('src/components/home/PlanningConfirmationCard.tsx');
const itinerary = read('src/screens/explore/LiveItineraryScreen.tsx');
const stack = read('src/navigation/ExploreStack.tsx');

test('planning page confirms requirements before generating and leaves route details off this page', () => {
  assert.match(confirmation, /请确认这份路线需求/);
  assert.match(confirmation, /确认并生成完整路线/);
  assert.match(confirmation, /真实景点、酒店、餐厅和交通/);
  assert.match(planningScreen, /await generatePlanningDraft\(\)/);
  assert.match(planningScreen, /commitDraft\(\)/);
  assert.match(planningScreen, /navigation\.replace\('LiveItinerary'\)/);
  assert.match(planningScreen, /showDraftDetails=\{false\}/);
});

test('complete itinerary is a separate full-screen daily timeline', () => {
  assert.match(stack, /name="LiveItinerary"[\s\S]*?headerShown: false/);
  assert.match(itinerary, /YOUR COMPLETE BEIJING JOURNEY/);
  assert.match(itinerary, /dayTimeWindows/);
  assert.match(itinerary, /originName=\{node\.endpoint\.name\}/);
  assert.match(itinerary, /destinationName=\{nextEntry\.node\.endpoint\.name\}/);
  assert.match(itinerary, /departAt=\{entry\.endTime\}/);
  assert.match(itinerary, /arriveAt=\{nextEntry\.startTime\}/);
  assert.match(itinerary, /高德 · 非估算/);
  assert.match(itinerary, /每天路线锚点/);
});
