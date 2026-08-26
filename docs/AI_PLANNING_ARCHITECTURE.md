# 北京 AI 规划架构

## 正式链路

首页的三种规划方式共用一份 `PlanningSession`：

- `selected_places`：用户先选择高德真实景点，AI 按偏好补齐酒店、餐厅和交通。
- `chat`：AI 通过文字/ASR 对话逐项收集必填条件，景点可指定，也可让 AI 推荐。
- `realtime`：StepAudio 电话式对话复用同一信息框架和会话，结束后回到规划页继续核对。

1. 首页把输入方式、规划模式、北京、天数、人数、总预算、节奏、真实候选地点、偏好快照和硬性限制写入结构化 `PlanningRequest`。
2. 首页只创建会话并跳转 `AIPlanningScreen`，不会立即查询供应商或生成半成品草稿。
3. 规划页把目的地、日期/天数、人数、总预算、节奏、旅行偏好、交通、住宿/用餐和硬性限制列为必填框架；景点为可选项。每次回答都会同时写入 `messages` 和结构化 `PlanningRequest`。
4. 必填项全部确认后才允许调用 GLM。GLM 仅返回经过前后端 Schema 校验的 `PlanIntent`，不能生成地点 ID、坐标、酒店价格、营业时间或交通耗时。
5. `planningOrchestrator` 根据偏好关键字使用高德查询景点、餐厅、地点坐标与交通矩阵，使用 FlyAI 查询酒店，再用高德核验酒店坐标。
6. 路线排序调用 `/api/travel/optimize-route`。无法满足营业时间、预算、步行、行动能力、夜间、过敏或危险项目限制的地点会保留明确原因。
7. 结果先进入 `PlanningSession.draft`。用户在独立规划页确认后，`commitDraft()` 才写入持久化的唯一正式 `Trip`。
8. 首页当前行程卡、行程 Tab 和 `LiveItineraryScreen` 优先读取同一份正式 `Trip`。

正式链路不会调用 `src/utils/routeGenerator.ts`，也不会使用 `src/data/attractions.ts`、`src/data/restaurants.ts` 或 `src/data/hotels.ts` 补位。

## 响应来源与失败策略

- `remote_glm`：远端 GLM 返回并通过 PlanIntent Schema 校验。
- `local_fallback`：GLM 不可用，本地规则只规范化用户已有输入，不生成事实；首页和旧通用助手都会明确标识降级。
- `unavailable`：协议保留的完全不可用状态，不能冒充远端响应。

高德、FlyAI 或路线优化失败时，工作台显示警告和阻塞项。缺失真实事实会使“确认路线”不可用，不会通过静态数据、估算时间或假价格补齐。

## 语音边界

- ASR 只把 StepAudio 转写结果放回首页或规划页输入框，用户可以编辑后提交。
- Realtime 电话界面读取当前必填进度，把用户和助手消息写入当前 `PlanningSession`；结束后回到同一规划页核对，不直接生成另一份路线。
- StepAudio、GLM、高德和 FlyAI 凭证只由服务端环境变量读取，客户端不包含真实 Key。

## 正式行程修改

已提交行程的 AI 修改先生成 `DraftPatchPreview`。只有 base Trip ID 仍一致且用户再次确认时，才应用到原 Trip；过期预览会被拒绝。

## Legacy 隔离

旧 `RoutePlanScreen`、静态深圳数据及其辅助工具仍可能被历史业务引用，因此没有盲目删除。首页新规划、`commitDraft()` 和 `LiveItineraryScreen` 的正式读取路径均与它们隔离。旧 `FullPanelChat` 遇到路线生成动作时只引导回首页工作台，不再直接生成或导航到 `CustomTab`。

## 验证命令

```bash
npx tsc --noEmit
npm run build
npm run test:planning
npm run test:phase3:store
npm run test:phase4:ui
npm run test:phase5:route
node --test tests/flyaiVercelHandler.test.mjs
.venv/bin/python -m unittest discover -s tests -p "test_*.py" -v
git diff --check
```
