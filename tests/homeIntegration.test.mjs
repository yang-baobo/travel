import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const home = read('src/screens/explore/HomeScreen.tsx');
const discovery = read('src/components/home/BeijingDiscoverySection.tsx');
const tripCard = read('src/components/home/CurrentTripCard.tsx');
const modeSelector = read('src/components/home/PlannerModeSelector.tsx');
const store = read('src/store/useAssistantStore.ts');
const fullPanel = read('src/components/assistant/FullPanelChat.tsx');

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

test('home planning prompt is handed to the real assistant pipeline', () => {
  assert.match(home, /openAssistantWithPrompt\(prompt\)/);
  assert.match(store, /openAssistantWithPrompt: \(prompt: string\) => void/);
  assert.match(store, /consumePendingPrompt: \(\) => string \| null/);
  assert.match(fullPanel, /const prompt = consumePendingPrompt\(\)/);
  assert.match(fullPanel, /handleSendMessage\(prompt\)/);
  assert.match(fullPanel, /chatService\.sendMessage\(text\.trim\(\), phase\)/);
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
  assert.match(discovery, /left: -index \* panelWidth/);
  assert.match(discovery, /width: frameWidth/);
  assert.doesNotMatch(discovery, /width: 560|left: \x60\$\{-index \* 25\}%\x60/);
});
