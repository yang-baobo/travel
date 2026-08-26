import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const home = read('src/screens/explore/HomeScreen.tsx');
const discovery = read('src/components/home/BeijingDiscoverySection.tsx');
const editorialAssets = read('src/data/beijingEditorialAssets.ts');
const tripCard = read('src/components/home/CurrentTripCard.tsx');
const modeSelector = read('src/components/home/PlannerModeSelector.tsx');
const planningStore = read('src/store/usePlanningSessionStore.ts');
const planningService = read('src/services/planningSessionService.ts');
const planningBuilder = read('src/services/planningRequestBuilder.ts');
const workbench = read('src/components/home/PlanningWorkbench.tsx');
const planningScreen = read('src/screens/explore/AIPlanningScreen.tsx');

test('home contains no empty press handlers or old mock planning', () => {
  assert.doesNotMatch(home, /onPress=\{\(\) => \{\}\}/);
  assert.doesNotMatch(home, /setTimeout\s*\(\s*[^,]+,\s*1600/);
  assert.doesNotMatch(home, /beijingHomeMock|BEIJING_TRIP_MOCK/);
});

test('home requests Beijing attractions exactly once', () => {
  const calls = `${home}\n${discovery}`.match(/searchTravelPlaces\('attraction'/g) ?? [];
  assert.equal(calls.length, 1);
  assert.doesNotMatch(discovery, /searchTravelPlaces/);
});

test('quick services and real place details are navigable', () => {
  assert.match(home, /navigate\('HotelList'\)/);
  assert.match(home, /navigate\('LivePlaces', \{ category: 'restaurant' \}\)/);
  assert.match(home, /navigate\('BlindBox'\)/);
  assert.match(home, /navigate\('LivePlaces', \{ category: 'attraction' \}\)/);
  assert.match(home, /navigate\('LivePlaceDetail', \{ placeId: place\.id \}\)/);
});

test('home planning input is handed to the structured Planning Session pipeline', () => {
  assert.match(home, /buildPlanningRequest\(/);
  assert.match(home, /beginSession\(/);
  assert.match(home, /navigate\('AIPlanning'/);
  assert.doesNotMatch(home, /runPlanningSession\(/);
  assert.match(planningBuilder, /candidates: input\.candidates\.map\(toPlanningCandidate\)/);
  assert.match(planningStore, /beginSession: \(request: PlanningRequest, options\?/);
  assert.match(planningScreen, /generatePlanningDraft/);
  assert.match(planningScreen, /missing\.length > 0/);
  assert.match(planningService, /planningOrchestrator\.plan\(/);
  assert.match(planningService, /export function commitDraft\(\): string/);
  assert.match(workbench, /testID="home-planning-workbench"/);
  assert.doesNotMatch(home, /openAssistantWithPrompt|openAssistant\(/);
});

test('planner mode selector is controlled and not permanently visible', () => {
  assert.match(modeSelector, /visible: boolean/);
  assert.match(modeSelector, /<Modal visible=\{visible\}/);
  assert.doesNotMatch(modeSelector, /<Modal visible transparent/);
});

test('discovery has explicit loading, error, empty and retry states', () => {
  assert.match(discovery, /loading \?/);
  assert.match(discovery, /: error \?/);
  assert.match(discovery, /onRetry/);
  assert.match(discovery, /暂时没有名称精确匹配的景点图片/);
  assert.ok(discovery.includes('samePlaceName(item.name, place.name)'));
  assert.match(discovery, /每张图片均来自对应的 FlyAI 景点条目/);
  assert.doesNotMatch(discovery, /beijing-hero-cinematic|beijing-hutong-cafe|beijing-summer-palace|unsplash/);
});


test('empty trip card is a real animated planning entry', () => {
  assert.match(tripCard, /START A NEW JOURNEY/);
  assert.match(tripCard, /Animated\.loop/);
  assert.match(tripCard, /openAssistant|onPress/);
  assert.doesNotMatch(tripCard, />还没有行程</);
});

test('five-frame image uses one responsive source crop', () => {
  assert.match(discovery, /const panelCount = 5/);
  assert.match(discovery, /const floatRanges =/);
  assert.match(discovery, /left: -panelLeft/);
  assert.match(discovery, /width: frameWidth/);
  assert.match(discovery, /Animated\.add\(scrollStagger, floatY\)/);
  assert.doesNotMatch(discovery, /width: 560|left: \x60\$\{-index \* 25\}%\x60/);
});


test('hero paints a verified Beijing image immediately without a green loading flash', () => {
  assert.match(editorialAssets, /FLYAI_WUMEN_EDITORIAL/);
  assert.match(editorialAssets, /name: '午门'/);
  assert.match(editorialAssets, /img\.alicdn\.com/);
  assert.match(home, /new Animated\.Value\(1\)/);
  assert.match(home, /\[FLYAI_WUMEN_EDITORIAL\.imageUrl, \.\.\.fliggyImages, \.\.\.amapImages\]/);
  assert.match(home, /duration: showImmediately \? 0 : 900/);
  assert.doesNotMatch(home, /hero: \{[^\n]*backgroundColor: '#062E2A'/);
});

test('floating five-frame composition uses the user-selected local image and focus', () => {
  assert.match(editorialAssets, /FIVE_FRAMES_EDITORIAL/);
  assert.match(editorialAssets, /beijing-five-frames\.jpg/);
  assert.match(editorialAssets, /sourceLabel: 'USER SELECTED · BEIJING'/);
  assert.match(discovery, /image=\{FIVE_FRAMES_EDITORIAL\.image\}/);
  assert.match(discovery, /focus=\{FIVE_FRAMES_EDITORIAL\.focus\}/);
  assert.match(discovery, /sourceLabel=\{FIVE_FRAMES_EDITORIAL\.sourceLabel\}/);
  // 焦点通过手动计算裁切偏移实现（RN 的 ImageStyle 不支持 objectPosition）
  assert.match(discovery, /rawPieceTop = panelHeight \/ 2 - focus\.y \* pieceHeight/);
  assert.match(discovery, /sourceWidth=\{FIVE_FRAMES_EDITORIAL\.sourceWidth\}/);
});
