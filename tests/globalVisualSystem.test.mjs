import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = relative => readFileSync(join(root, relative), 'utf8');
const collect = directory => readdirSync(directory).flatMap(name => {
  const target = join(directory, name);
  return statSync(target).isDirectory() ? collect(target) : target.endsWith('.tsx') ? [target] : [];
});

test('all screens consume the shared Beijing Flow visual system', () => {
  const screens = collect(join(root, 'src/screens'));
  assert.ok(screens.length >= 30);
  for (const screen of screens) {
    const source = readFileSync(screen, 'utf8');
    if (screen.endsWith('/HomeScreen.tsx')) {
      assert.match(source, /teal: '#10A99A'/, screen);
      assert.match(source, /ink: '#102B27'/, screen);
      continue;
    }
    assert.match(source, /theme\/colors/, screen);
  }
});

test('global palette matches the home screen visual language', () => {
  const colors = read('src/theme/colors.ts');
  const spacing = read('src/theme/spacing.ts');
  assert.match(colors, /primary: '#0E9F93'/);
  assert.match(colors, /background: '#F3F7F5'/);
  assert.match(colors, /textPrimary: '#0F2B27'/);
  assert.match(colors, /gradient: \['#17BCAA', '#08766D'\]/);
  assert.match(spacing, /lg: 22/);
  assert.match(spacing, /xl: 30/);
});

test('all navigators use the shared stack or floating tab treatment', () => {
  const stackNames = ['ExploreStack', 'CustomStack', 'OrderStack', 'ProfileStack'];
  for (const name of stackNames) assert.match(read(`src/navigation/${name}.tsx`), /flowStackScreenOptions/);
  const tabNames = ['UserTabNavigator', 'AdminTabNavigator', 'GuideTabNavigator'];
  for (const name of tabNames) assert.match(read(`src/navigation/${name}.tsx`), /flowTabScreenOptions/);
  const theme = read('src/theme/navigationTheme.ts');
  assert.match(theme, /position: 'absolute'/);
  assert.match(theme, /borderRadius: 24/);
  assert.match(theme, /animation: 'slide_from_right'/);
});

test('assistant surfaces share the teal travel companion identity', () => {
  const orchestrator = read('src/components/assistant/VoiceAssistantOrchestrator.tsx');
  const mini = read('src/components/assistant/FloatingMiniChat.tsx');
  const full = read('src/components/assistant/FullPanelChat.tsx');
  const realtime = read('src/components/assistant/RealtimeCallPanel.tsx');
  assert.match(orchestrator, /LinearGradient/);
  assert.match(orchestrator, /北京 AI 旅伴/);
  assert.match(mini, /北京 AI 旅伴/);
  assert.match(full, /北京 AI 旅伴/);
  assert.match(realtime, /AI 旅伴正在回答/);
  for (const source of [orchestrator, mini, full, realtime]) assert.match(source, /#0E9F93|#08766D|#082F2B/);
});
