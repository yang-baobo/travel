import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const home = read('src/screens/explore/HomeScreen.tsx');
const workbench = read('src/components/home/PlanningWorkbench.tsx');
const realtime = read('src/hooks/useRealtimeVoice.ts');
const fullPanel = read('src/components/assistant/FullPanelChat.tsx');

test('home submits a structured PlanningRequest and never opens FullPanelChat', () => {
  assert.match(home, /buildPlanningRequest\(/);
  assert.match(home, /runPlanningSession\(/);
  assert.doesNotMatch(home, /openAssistantWithPrompt|openAssistant\(/);
  assert.match(home, /<PlanningWorkbench/);
});

test('home ASR only fills editable input while realtime reuses Planning Session', () => {
  assert.match(home, /plannerVoice\.setOnFinalText/);
  assert.match(home, /setInput\(current =>/);
  assert.match(home, /inputMethod: method/);
  assert.match(home, /runPlanningSession\(createRequest\('realtime', mergedInput\), true\)/);
  assert.match(realtime, /planning_session:/);
  assert.match(realtime, /inputMethod: 'realtime'/);
});

test('workbench exposes real progress, draft controls and uncertainty', () => {
  for (const label of ['正在理解', 'AI 需要确认', '正在查询真实地点', '正在计算交通', '路线草稿', '警告和不确定性', '换一个', '重试', '确认路线']) {
    assert.ok(workbench.includes(label), `missing ${label}`);
  }
  assert.doesNotMatch(workbench, /setTimeout/);
});

test('legacy full panel cannot generate static routes or navigate CustomTab', () => {
  assert.doesNotMatch(fullPanel, /routeGenerator|generateRoute\(/);
  assert.doesNotMatch(fullPanel, /CustomTab/);
});
