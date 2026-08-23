# FlyAI Phase 4：真实酒店 UI 与 Trip / 路线闭环

完成日期：2026-08-22（Asia/Shanghai）  
范围：酒店 UI、筛选与状态、当前 Trip 酒店选择、路线页读取、飞猪跳转、回归测试。未进入 Phase 5。

## 结论

Phase 4 已完成。正式酒店入口现在使用：

```text
HotelListScreen
  → TravelHotelService
  → BackendHotelProvider
  → POST /api/travel/hotels/search
  → FastAPI
  → @fly-ai/flyai-cli 1.0.16
  → FlyAI
  → TravelHotel[]
```

用户选择酒店后只调用 `useRouteStore.selectHotel`。酒店页、路线输入和行程摘要均通过稳定 `TravelHotel.id` 读取同一个 `selectedHotel`。FlyAI 失败或返回空数组时不会回退深圳静态酒店；真实酒店也不会进入旧模拟房型流程。

## A. 修改文件

| 文件 | 修改 | 原因 |
|---|---|---|
| `src/screens/explore/HotelListScreen.tsx` | 静态列表改为真实查询；增加 loading/empty/error/retry、筛选、选中态、飞猪跳转和无障碍标签 | 正式展示 FlyAI `TravelHotel` |
| `src/services/travelData/hotel/hotelUiModel.ts` | 新增请求参数、卡片字段、参考价和错误状态的纯函数模型 | 集中保证字段语义与可测试性 |
| `src/screens/explore/HomeScreen.tsx` | “酒店”正式入口改为 `HotelList`；更新数据源说明 | 防止用户仍进入高德普通酒店 POI 列表 |
| `src/navigation/CustomStack.tsx` | 在自定义路线栈注册 `HotelList` | 路线页可以进入同一真实酒店页 |
| `src/types/index.ts` | 为 `CustomStackParamList` 增加 `HotelList` | 保持导航类型安全 |
| `src/screens/custom/RoutePlanScreen.tsx` | 增加当前 Trip 真实酒店卡片；从同一 Store 读取；参考价不计入结算；旧静态酒店/模拟房型只允许显式开发 fixture | 打通选择 → Trip → 路线，并阻断房型误导 |
| `src/store/usePreferenceStore.ts` | 新行程默认日期从过期固定日期改为动态未来日期 | 避免真实供应商拒绝过期演示日期；不覆盖用户已选日期 |
| `tests/hotelPhase4Ui.test.ts` | 新增 16 项 Phase 4 UI/状态/一致性测试 | 覆盖 UI-H01～H18、筛选和 mock 阻断 |
| `package.json` | 新增 `test:phase4:ui` | 提供独立回归命令 |
| `FLIGGY_PHASE4_REPORT.md` | 本报告 | 记录实现、测试与限制 |

没有修改高德、GLM、StepAudio、正式航班业务、火车、支付或生产部署。

## B. 酒店 UI 数据源

Phase 4 前：

```text
HotelListScreen → src/data/hotels.ts（深圳静态演示酒店）
```

Phase 4 后：

```text
HotelListScreen
→ src/services/travelData/hotel/TravelHotelService.ts
→ src/services/travelData/hotel/HotelProvider.ts
→ FastAPI /api/travel/hotels/search
→ FlyAI
```

React Native 不直接执行 FlyAI CLI，也不持有 `FLYAI_API_KEY`。

## C. 请求参数

| API 参数 | UI 来源 | 处理 |
|---|---|---|
| `destination` | `usePreferenceStore.selectedCity` | 不写死深圳或北京 |
| `checkInDate` | `usePreferenceStore.travelStartDate` | 当前 Trip 入住日期 |
| `checkOutDate` | `usePreferenceStore.travelReturnDate` | 当前 Trip 退房日期 |
| `maxReferencePrice` | `usePreferenceStore.hotelPriceRange.max` 的初始值，或用户在酒店页明确选择 | 只表示每晚参考价上限，不使用总旅行预算 |
| `stars` | 酒店页明确选择的 3、4、4～5、5 星 | 分别映射为 `[3]`、`[4]`、`[4,5]`、`[5]`；卡片仍只展示 FlyAI 实际返回的 `star/starLabel` |
| `keyword` | 酒店页搜索框 | 350ms 防抖后传入 |
| `sortBy` | 综合、价格升序、价格降序 | 不提供评分排序 |

请求使用递增 request ID 与 cancelled 标记；旧请求晚返回时不会覆盖新条件的结果。

## D. 酒店卡片字段

| UI | `TravelHotel` 字段 | 规则 |
|---|---|---|
| 酒店名称 | `name` | 必显 |
| 酒店图片 | `imageUrl` | 缺失显示统一 placeholder，不借用其他酒店图片 |
| 酒店地址 | `address` | 非 null 才显示 |
| 星级/档次 | `star` / `starLabel` | 只显示供应商实际值，不冒充评分 |
| 评分 | `rating` | 非 null 才显示；当前真实结果全部为空，因此隐藏 |
| 距离 | `distanceMeters` | 非 null 才显示；当前无可靠值，因此隐藏 |
| 参考价 | `referencePrice` / `priceText` | 显示“¥X 起 / 飞猪参考价” |
| 标签 | `tags` | 最多展示前三个真实标签 |
| 预订入口 | `bookingUrl` | 存在才展示“去飞猪预订” |

没有生成默认 4.x 评分、假距离、假图片、假设施或假库存。

## E. 价格展示

有可解析参考价：

```text
¥468 起
飞猪参考价
```

没有可解析价格或价格被遮罩：

```text
查看实时价格
前往飞猪查看
```

页面底部明确提示：

```text
价格为飞猪搜索参考价，实际价格与房型库存以飞猪预订页面为准。
```

路线页也使用同一参考价语义。FlyAI 搜索参考价没有计入路线页可结算总价，底栏会提示“未含酒店实时房价”。

## F. Rating

评分只在 `rating !== null` 时渲染。2026-08-22 的真实深圳与北京查询中，`ratingAvailable=false`，结果评分为 null；UI 没有显示默认评分，也没有提供评分排序。

## G. Distance

距离只在 `distanceMeters !== null` 时渲染。当前 FlyAI 酒店搜索没有可靠数值距离，所以 UI 不显示距离，也不把 `nearbyText` 冒充实际米数。附近与交通仍应在后续由高德坐标/矩阵补全。

## H. selectedHotel 单一状态源

唯一 owner：

```text
src/store/useRouteStore.ts
  selectedHotel: TravelHotel | null
  selectedHotelContext: TripHotelContext | null
```

读取关系：

```text
HotelListScreen
  → selectedHotel.id 判断“已选择”

RoutePlanScreen
  → selectedHotel + selectedHotelContext 显示同一家真实酒店

selectedHotelRouteBridge
  → buildSelectedHotelRouteInput()
  → buildSelectedHotelItinerarySummary()
```

更换筛选只改变候选列表，不清除 Trip 酒店。选择 B 会由 `selectHotel` 原子替换 A。目的地或日期变化仍按 Phase 3 Trip 生命周期规则清理过期选择。

## I. 完整闭环测试

### 真实 API

2026-08-22 使用服务端正式 Key，通过本地 FastAPI 实测：

```text
深圳
2026-09-15 → 2026-09-17
maxReferencePrice=800
stars=[4,5]
sortBy=price_asc
```

结果：HTTP 200，约 4.39 秒，返回 8 家 FlyAI 酒店；8 个 ID 全部唯一。结果有名称、地址、图片、参考价和飞猪跳转；8 家 `rating=null`、`distanceMeters=null`，UI 按规则隐藏。

### 真实网页交互

本地 Web + FastAPI 实测：

```text
进入酒店页
→ 北京未来日期返回 9 家 FlyAI 酒店
→ 选择“桔子北京牛街地铁站酒店”
→ 页面立即显示“已选择”
→ 搜索其他关键词，原酒店离开候选列表
→ selectedHotel 未被清除
→ 用稳定 ID 再次找到原酒店，仍显示“已选择”
→ 返回首页并重新进入酒店页
→ 再次找到原酒店，仍显示“已选择”
```

自动化一致性测试另验证：

```text
Hotel UI ID = useRouteStore.selectedHotel.id
            = selectedHotelRouteBridge.hotelId
            = itinerary summary.hotelId
```

## J. Static Data

- `src/data/hotels.ts` 等深圳静态酒店文件仍存在，供旧 demo/dev/test 使用。
- 正式 `HotelListScreen` 已不导入、不读取静态酒店。
- `RoutePlanScreen` 中旧按晚酒店、静态搜索和房型演示只在以下显式条件下可见：

```text
__DEV__ && EXPO_PUBLIC_ENABLE_STATIC_HOTEL_FIXTURES === "true"
```

- 正常模式不会在 FlyAI 错误或空结果时显示静态 fallback。

## K. Room Mock

FlyAI 当前没有可靠房型和库存。真实酒店流程不显示模拟房型：

- 真实酒店只在正式酒店页选择；房型和实时价格通过飞猪跳转查看。
- 路线页旧 `showHotelDetail` 和 `showHotelSearch` modal 均被显式开发 fixture 开关阻断。
- 真实酒店参考价不会调用 `getRoomTypesForHotel`，也不会生成模拟 room price。

因此不存在“真实 FlyAI 酒店 + 静态模拟房型”被包装成一套真实数据的情况。

## L. Loading / Empty / Error

- Loading：查询期间显示“正在查询实时酒店…”，不先展示静态酒店。
- Empty：HTTP 200 且 `hotels=[]` 时显示“暂时没有找到符合条件的酒店”。
- Error：显示安全错误文案和“重新加载”；断网、超时、无效行程参数有独立文案。
- Retry：递增 retry nonce，重新请求真实 API。

自动化测试覆盖三种状态；浏览器回归中也实际观察到过期日期产生的错误页与重试按钮。发现旧默认日期已经过期后，已将新行程默认值修正为动态未来日期。

## M. Regression

| 检查 | 结果 |
|---|---|
| Phase 4 UI/状态测试 | PASS，16/16 |
| Phase 3 Store 一致性测试 | PASS，6/6 |
| Python 全量测试（AI、盲盒、FlyAI、路线、高德 provider） | PASS，33/33 |
| TypeScript `npx tsc --noEmit` | PASS |
| Web export | PASS |
| 首页 → 酒店正式入口 | PASS，进入 FlyAI 酒店页 |
| 真实 FlyAI HTTP 查询 | PASS |
| 选择、筛选、重新进入选中态 | PASS |
| Web bundle Key 扫描 | PASS，真实 `FLYAI_API_KEY` 字节不存在 |
| 最终 Web API Base | PASS，恢复 `.env` 中 `http://localhost:8000`；测试用 127 地址未残留 |

命令：

```bash
npm run test:phase4:ui
npm run test:phase3:store
.venv/bin/python -m unittest discover -s tests -v
npx tsc --noEmit
npx expo export --platform web --clear
```

## N. Known Limitations

1. FlyAI 酒店 `poiName` 附近召回不稳定，只适合候选召回。
2. 当前没有可靠距离，`distanceMeters` 通常为 null。
3. 当前真实响应 `rating=null`，不能展示评分或支持评分排序。
4. `referencePrice` 不是最终成交价；房型、库存、税费和会员权益可能导致飞猪页面价格变化。
5. 当前 Vercel Python runtime 不会自动包含 FlyAI Node CLI。
6. 正式部署前仍需解决 Node CLI runtime、冷启动、并发、超时与监控。
7. 当前没有真实房型/库存 API；用户需要前往飞猪确认。
8. 路线页读取同一真实酒店，但精确交通仍等待后续高德地理补全；本阶段没有估算假距离。
9. FlyAI 查询通常需要数秒；本阶段通过 loading 和请求竞争保护处理，没有静态回退或持久价格缓存。
10. 搜索结果集合可能在相同条件下变化；已选酒店不一定每次都出现在候选列表，但 Trip 选择不会因此被清除。
11. 首页服务状态卡仍保留旧合作方状态字段；本阶段没有扩展 provider-status API。

## Phase 4 完成清单

- [x] 酒店页调用真实 FastAPI
- [x] 正常酒店页不读取深圳静态酒店
- [x] 使用统一 `TravelHotel`
- [x] loading / empty / error / retry
- [x] 真实名称、图片、地址与星级标签
- [x] 参考价语义正确；无价格不显示 ¥0
- [x] 不显示假评分、假距离或假设施
- [x] `bookingUrl` 安全校验后打开；不表示已预订
- [x] `selectedHotel` 只写 `useRouteStore`
- [x] 重新进入页面按稳定 ID 恢复“已选择”
- [x] Route / Summary 读取相同酒店 ID
- [x] 选择 B 替换 A；筛选不清除 A
- [x] 真实酒店不进入模拟房型
- [x] `FLYAI_API_KEY` 未进入客户端或 Web bundle
- [x] 高德、GLM、StepAudio、航班、火车、支付未修改
- [x] 未部署 production

Phase 4 到此停止，没有自动进入 Phase 5。
