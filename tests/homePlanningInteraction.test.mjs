import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const home = read('src/screens/explore/HomeScreen.tsx');
const planningScreen = read('src/screens/explore/AIPlanningScreen.tsx');
const workbench = read('src/components/home/PlanningWorkbench.tsx');
const realtime = read('src/hooks/useRealtimeVoice.ts');
const fullPanel = read('src/components/assistant/FullPanelChat.tsx');

test('home creates a structured session and navigates to the dedicated planning screen', () => {
  assert.match(home, /buildPlanningRequest\(/);
  assert.match(home, /beginSession\(/);
  assert.match(home, /navigate\('AIPlanning'/);
  assert.doesNotMatch(home, /openAssistantWithPrompt|openAssistant\(/);
  assert.doesNotMatch(home, /<PlanningWorkbench/);
  assert.match(planningScreen, /<PlanningWorkbench/);
});

test('text, ASR and realtime are three inputs into the same Planning Session', () => {
  assert.match(home, /plannerVoice\.setOnFinalText/);
  assert.match(home, /setInput\(current =>/);
  for (const label of ['选景点规划', 'AI 对话定制', '电话实时规划']) assert.ok(home.includes(label));
  assert.match(planningScreen, /answerPlanningCollection\(spoken, 'realtime', false\)/);
  assert.match(realtime, /planning_session:/);
  assert.match(realtime, /inputMethod: 'realtime'/);
});

test('dedicated planning screen exposes preferences, required framework and a hard generation gate', () => {
  for (const label of ['偏好设置', '路线生成信息单', '红点为必填 · 景点可选', '生成真实路线']) {
    assert.ok(planningScreen.includes(label), `missing ${label}`);
  }
  assert.match(planningScreen, /missing\.length > 0/);
  assert.match(planningScreen, /generatePlanningDraft/);
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
