# FlyAI Phase 3：统一酒店数据层与当前 Trip 酒店状态

完成日期：2026-08-22  
范围：仅酒店 Domain、FlyAI Adapter/Provider/Service、FastAPI 本地接口、当前 Trip 单一状态源、路线读取边界与测试。未进入 Phase 4。

## 结论

Phase 3 已完成。当前项目具备以下链路：

```text
React Native TravelHotelService
  → POST /api/travel/hotels/search
  → FastAPI TravelHotelService
  → FliggyCliProvider
  → @fly-ai/flyai-cli 1.0.16
  → FliggyHotelAdapter
  → TravelHotel[]
  → useRouteStore.selectedHotel
  → selectedHotelRouteBridge
```

2026-08-22 使用正式服务端环境变量完成真实冒烟测试：深圳、2026-09-15 至 2026-09-17、最高参考价 500 元，HTTP 返回 `200 OK`、11 个标准化酒店，未输出或下发 API Key。返回价格统一标记为 `search_reference`。

## A. TravelHotel 最终结构

前端定义：`src/types/hotel.ts`  
后端定义：`api/hotels/models.py`

两端使用相同 camelCase JSON 语义。表中“必需”表示标准化输出必须具有有效值；“nullable”字段会显式返回 `null`，不会补造数据。

| 字段 | 类型 | 必需 | 来源 | 语义 |
|---|---|---:|---|---|
| `id` | string | 是 | Adapter | 稳定领域 ID：`fliggy:${shId}` |
| `source` | `fliggy \| static` | 是 | Adapter/静态数据 | 数据来源，不混淆供应商与演示数据 |
| `sourceHotelId` | string | 是 | `shId` | 供应商原始酒店 ID |
| `name` | string | 是 | `name` | 酒店名称；没有名称的损坏条目会被安全跳过 |
| `city` | string/null | 否 | FlyAI 同名字段 | Phase 2/3 实际响应通常没有，保持 null |
| `district` | string/null | 否 | FlyAI 同名字段 | 实际响应没有时保持 null |
| `address` | string/null | 否 | `address` | 地址缺失不影响单条转换 |
| `latitude` | number/null | 否 | `latitude` | 仅接受可解析且在合法范围内的真实值 |
| `longitude` | number/null | 否 | `longitude` | 仅接受可解析且在合法范围内的真实值 |
| `star` | number/null | 否 | `starLevel`（若存在） | 数值星级；不把文字档次或评分冒充星级 |
| `starLabel` | string/null | 否 | `star` | 飞猪返回的“经济型/高档型”等原始标签 |
| `rating` | number/null | 否 | `rate` | 当前真实响应为空时保持 null |
| `reviewCount` | number/null | 否 | 暂无可靠字段 | 当前固定 null，不估算 |
| `referencePrice` | number/null | 否 | 从 `price` 安全解析 | 飞猪搜索参考价，不是最终成交价 |
| `priceText` | string/null | 否 | `price` | 保存供应商可见价格文本，如 `¥499` |
| `priceCurrency` | `CNY`/null | 否 | `price` 的人民币符号 | 只在价格文本明确使用 `¥/￥` 时标记 CNY |
| `priceType` | `search_reference` | 是 | Domain 常量 | 明确价格语义，禁止当作锁价或成交价 |
| `priceDisclaimer` | string | 是 | Domain 常量 | 最终价格以飞猪预订页为准 |
| `originalPrice` | number/null | 否 | `originalPrice`（若存在） | 当前实际响应未确认时保持 null |
| `roomInformation` | object[]/null | 否 | 暂无可靠字段 | 不使用现有模拟房型填充 |
| `roomAvailability` | boolean/null | 否 | 暂无可靠字段 | 不声称有房或已确认库存 |
| `imageUrl` | string/null | 否 | `mainPic` | 酒店主图 |
| `tags` | string[] | 是 | `brandName`、`star` | 只保存实际存在的标签，默认空数组 |
| `facilities` | string[]/null | 否 | 暂无可靠字段 | 当前保持 null，不从描述推断设施 |
| `distanceMeters` | number/null | 否 | 暂无可靠字段 | 当前保持 null，不根据 `interestsPoi` 估算距离 |
| `nearbyText` | string/null | 否 | `interestsPoi` | 供应商附近描述，仅作说明，不是精确距离 |
| `bookingUrl` | string/null | 否 | `detailUrl/jumpUrl/bookingUrl` | 仅保留 HTTPS 且属于飞猪/Fliggy/Alitrip 域名的跳转链接 |
| `checkInDate` | ISO date | 是 | 搜索请求 | 本次价格查询的入住日期 |
| `checkOutDate` | ISO date | 是 | 搜索请求 | 本次价格查询的退房日期 |

`bookingUrl` 只表示可跳转飞猪详情/预订页面，不表示已预订、已锁价、已付款或房间已确认。

## B. FlyAI Mapping

| FlyAI 字段 | TravelHotel 字段 | 处理 |
|---|---|---|
| `shId` | `sourceHotelId`、`id` | `id = fliggy:${shId}`；缺失时跳过该损坏条目 |
| `name` | `name` | 去除首尾空白；缺失时跳过该损坏条目 |
| `city` | `city` | 有则使用，无则 null |
| `district` | `district` | 有则使用，无则 null |
| `address` | `address` | 有则使用，无则 null |
| `latitude` | `latitude` | 字符串/数字安全转换；无效或越界为 null |
| `longitude` | `longitude` | 字符串/数字安全转换；无效或越界为 null |
| `starLevel` | `star` | 仅数值可解析时使用；实际响应未确认时为 null |
| `star` | `starLabel`、`tags` | 保留原始文字标签，不转成 rating |
| `rate` | `rating` | 数值才使用；当前真实结果为 null |
| 无可靠字段 | `reviewCount` | null / unavailable |
| `price` | `priceText`、`referencePrice`、`priceCurrency` | 遮罩、缺失或不可解析时 referencePrice 为 null |
| `originalPrice` | `originalPrice` | 有且可解析才使用，否则 null |
| 无可靠字段 | `roomInformation` | null / unavailable |
| 无可靠字段 | `roomAvailability` | null / unavailable |
| `mainPic` | `imageUrl` | 文本存在时使用 |
| `brandName`、`star` | `tags` | 仅加入真实非空值 |
| 无可靠字段 | `facilities` | null / unavailable |
| 无可靠字段 | `distanceMeters` | null / unavailable |
| `interestsPoi` | `nearbyText` | 只作为附近描述，不解释成距离 |
| `detailUrl/jumpUrl/bookingUrl` | `bookingUrl` | HTTPS + 飞猪域名白名单校验 |
| 搜索请求日期 | `checkInDate/checkOutDate` | 绑定价格的查询上下文 |

Adapter 不保存整份 FlyAI raw response，Zustand 中也不存在 raw payload。

## C. Hotel State

当前标准化酒店选择的唯一 owner：

```text
Store: src/store/useRouteStore.ts
Field: selectedHotel: TravelHotel | null
Context: selectedHotelContext: { destination, checkInDate, checkOutDate } | null
Actions: selectHotel / clearSelectedHotel / getSelectedHotelForTrip / reconcileSelectedHotelContext
```

选择酒店属于“当前 Trip/路线”，不属于长期用户偏好，因此没有放入 `usePreferenceStore`。`selectedHotel` 也没有加入 `useRouteStore` 的 `partialize`；现有持久化仍只保存用户学习权重和画像，不需要新建迁移系统，也不会把大体积供应商响应写入 AsyncStorage。

目的地或入住/退房日期变化后，上下文校验会清掉旧选择，避免深圳酒店污染北京 Trip。无关的价格偏好、设施偏好等变化不会改掉当前已选酒店。

## D. 单一状态源

已完成：

- 活跃 `useHotelStore.ts` 中旧的 `selectedHotelId/selectHotel` 已移除；该 Store 只保留静态搜索/筛选能力。
- 新的标准化酒店正式选择只写入 `useRouteStore.selectedHotel`。
- `selectedHotelRouteBridge.ts` 为路线输入和行程摘要提供统一读取入口。
- `routeGenerator.ts` 检测到当前 Trip 已有真实酒店时，不再自动暗选另一个深圳静态酒店；由于本阶段不做高德坐标融合，它也不会用 FlyAI 酒店 ID 伪造交通耗时。
- Store、route input builder、itinerary summary 的一致性测试读取到相同酒店 ID。

按 Phase 3 范围保留：

- `RoutePlanScreen.tsx` 仍有 `selectedHotelIds`，它服务于原深圳静态、多晚演示页面；本阶段明确禁止切换酒店 UI，因此没有把这个页面改成 FlyAI 列表。
- 旧结算/navigation 参数仍传静态 `hotelId`，因为正式 UI/结算切换属于 Phase 4。
- `routeGenerator.ts` 在当前 Trip 尚未选择标准化酒店时仍可使用静态酒店作为演示 fallback，防止现有页面与语音演示断裂。
- 带 `(1)` 的历史副本仍存在但没有被活跃入口引用；本阶段没有清理用户项目中的备份文件。

因此，新的正式酒店 Domain 只有一个 Trip owner；旧页面的静态局部选择仍是明确隔离的兼容链路，不应在 Phase 4 后继续作为正式酒店真值。

## E. Backend

实际调用路径：

```text
React Native
  src/services/travelData/hotel/TravelHotelService.ts
↓
BackendHotelProvider
  src/services/travelData/hotel/HotelProvider.ts
↓ POST JSON
FastAPI
  api/index.py
↓
TravelHotelService
  api/hotels/service.py
↓
FliggyCliProvider
  api/hotels/provider.py
↓ subprocess（无 shell）
@fly-ai/flyai-cli 1.0.16 search-hotel
↓
FliggyHotelAdapter
  api/hotels/fliggy_adapter.py
↓
HotelSearchResponse / TravelHotel[]
```

`FLYAI_API_KEY` 只由后端环境读取并传给 CLI 子进程。没有进入 React Native 源码、API 响应、Zustand、日志或 Git。Web 构建后还执行了实际 Key 字节扫描：`flyai_key_found_in_web_bundle = false`。

## F. API

### 酒店搜索

- Method：`POST`
- Path：`/api/travel/hotels/search`
- Content-Type：`application/json`

请求示例：

```json
{
  "destination": "深圳",
  "checkInDate": "2026-09-15",
  "checkOutDate": "2026-09-17",
  "maxReferencePrice": 500,
  "stars": [4, 5],
  "keyword": "设计酒店",
  "poiName": "世界之窗",
  "sortBy": "price_asc"
}
```

支持的 `sortBy`：`none`、`price_asc`、`price_desc`、`distance_candidate`。`distance_candidate` 只调用 FlyAI 的候选召回排序，不承诺精确距离。`rating` 会明确返回能力不可用，不会假排序。

响应：

```json
{
  "hotels": ["TravelHotel"],
  "meta": {
    "source": "fliggy",
    "count": 11,
    "queryStatus": "ok",
    "priceMeaning": "search_reference",
    "priceDisclaimer": "最终价格以飞猪预订页为准",
    "nearbyPrecision": "not_requested",
    "ratingAvailable": false
  }
}
```

空结果使用 HTTP 200，返回 `hotels: []` 和 `queryStatus: no_results`，绝不回退为假酒店。

错误分类：

| HTTP | code | 含义 |
|---:|---|---|
| 422 | `HOTEL_INVALID_REQUEST` | FlyAI 拒绝日期/参数等请求 |
| 422 | `HOTEL_CAPABILITY_UNAVAILABLE` | 请求评分排序等未可靠支持的能力 |
| 503 | `HOTEL_PROVIDER_NOT_CONFIGURED` | Key 或官方 CLI 未配置 |
| 504 | `HOTEL_PROVIDER_TIMEOUT` | CLI/上游超时 |
| 502 | `HOTEL_PROVIDER_AUTH_FAILED` | Key 无效或权限不足 |
| 502 | `HOTEL_PROVIDER_UNAVAILABLE` | CLI 非零退出、网络/上游不可用 |
| 502 | `HOTEL_PROVIDER_MALFORMED_RESPONSE` | 非 JSON 或结构不符合预期 |

Provider 每次请求不会安装 CLI；使用 `subprocess.run` 的参数数组、独立超时和进程回收，不经过 shell，也不回传 stderr/raw response。

## G. Tests

### Adapter

| Case | 结果 | 验证 |
|---|---|---|
| Adapter 01 完整酒店 | PASS | 正确生成 TravelHotel、source、参考价格语义 |
| Adapter 02 rating=null | PASS | rating 保持 null |
| Adapter 03 无地址 | PASS | 转换成功，address=null |
| Adapter 04 无/遮罩价格 | PASS | referencePrice=null，不补假价 |
| Adapter 05 合法 shId | PASS | 稳定生成 `fliggy:${shId}` |
| Adapter 06 损坏条目 | PASS | 缺 ID/名称安全跳过；坏坐标/URL 置 null |

### Service / Provider

| Case | 结果 | 验证 |
|---|---|---|
| Service 01 深圳+日期 | PASS | 返回标准化 TravelHotel[] |
| Service 02 max price=500 | PASS | 参数传入 Provider，返回参考价 |
| Service 03 timeout | PASS | 保留规范 timeout error |
| Service 04 空结果 | PASS | 返回 [] 与 no_results |
| rating sort | PASS | 明确拒绝，不伪造能力 |
| invalid key/权限 | PASS | 分类为鉴权错误，不泄漏测试 Key |
| 非 JSON | PASS | 分类为 malformed response |
| CLI 空 itemList | PASS | 识别为合法空结果 |

### Store / 一致性

| Case | 结果 | 验证 |
|---|---|---|
| Store 01 选择 A | PASS | 当前 Trip selectedHotel=A |
| Store 02 选择 B | PASS | B 替换 A，仅一个选择 |
| Store 03 clear | PASS | selectedHotel/context 均为 null |
| Store 04 无关 preference | PASS | selectedHotel 不变 |
| Store 05 切换目的地 | PASS | 旧酒店不会污染新 Trip |
| Store/route/summary ID | PASS | 三处读取同一 ID |

### Integration / Regression

- PASS：FastAPI 路由注册、camelCase 输出、raw 字段不外泄。
- PASS：7 类 FastAPI 错误码与 HTTP 状态映射。
- PASS：真实 HTTP `POST /api/travel/hotels/search`，`200 OK`，11 个 FlyAI 酒店。
- PASS：Python 完整回归（AI、盲盒、路线、高德 provider、FlyAI 酒店）。
- PASS：`npx tsc --noEmit`。
- PASS：`expo export --platform web`。
- PASS：正式 FlyAI Key 未出现在 Web bundle。

测试命令：

```bash
npm run test:phase3:backend
npm run test:phase3:store
npx tsc --noEmit
npm run build
```

## H. FlyAI Deployment Risk

当前 FastAPI 通过绝对项目路径调用：

```text
node_modules/.bin/flyai search-hotel ...
```

正式服务器必须同时具备：

- Node.js runtime；
- 安装好的精确版本 `@fly-ai/flyai-cli@1.0.16`；
- 可执行的 `node_modules/.bin/flyai`，或通过 `FLYAI_CLI_PATH` 指向受控路径；
- Python/FastAPI 进程启动 CLI 子进程的权限；
- 服务端 `FLYAI_API_KEY`；
- 允许访问 FlyAI 上游的网络；
- 超时、并发和进程数量监控。

本地真实调用成功，但当前 `vercel.json` 的 Python function 排除了 `node_modules` 和 package 文件，因此现有 Vercel 部署形态不能假定 FlyAI CLI 一定存在。Phase 3 按要求没有修改 production 部署。进入生产前需要选择支持 Python+Node CLI 的容器/服务，或将官方 FlyAI 调用放入独立 Node 服务并由 FastAPI 安全调用。

真实测试中 20 秒阈值曾触发一次规范超时；调整为后端 40 秒、客户端 45 秒后，直接服务调用约 5 秒成功，HTTP 调用约 2 秒成功。生产环境仍需基于实际 P95/P99 调整并考虑限流，不能把 CLI 子进程当作无限并发调用。

## I. Static Shenzhen Hotels

- 深圳静态酒店仍存在于 `src/data/hotels.ts` 与 `src/data/additionalHotels.ts`。
- 主数据导出时已明确补上 `source: static`。
- 它们仍服务旧酒店/路线/结算演示页面，也在“当前 Trip 尚未选择标准化酒店”时为旧路线生成器提供兼容 fallback。
- 它们没有被混入 FlyAI API 的 `TravelHotel[]`，也不会冒充真实实时价格。
- Phase 4 应让酒店页面从 `TravelHotelService` 获取 FlyAI 数据，正式确认时写入 `useRouteStore.selectedHotel`，再逐步取消静态正式链路；本阶段没有删除静态数据。

## J. Amap Boundary

本阶段没有修改任何高德代码。

后续边界保持为：

- 高德：POI 坐标校验、精确附近、真实距离、驾车、公交、步行、路线耗时；
- FlyAI：真实酒店候选、搜索参考价、星级筛选、商品/预订跳转。

FlyAI 返回的真实经纬度已能通过 `SelectedHotelRouteInput` 暴露，但 Phase 3 没有把它直接塞进现有静态路线表，也没有自行估算距离。后续应由高德矩阵消费这些坐标。

## K. Known Limitations

1. FlyAI 的 `poiName` 附近召回不稳定，只能用于候选召回。
2. 当前响应没有可靠酒店距离，`distanceMeters` 为 null。
3. 当前真实酒店 `rate` 为空，`rating` 为 null，评分排序不可用。
4. `price` 只能作为搜索参考价；本次真实结果甚至出现很低的民宿参考价，不能据此承诺房型、库存或成交价。
5. 最终价格必须以飞猪预订页为准。
6. 房型、库存、设施、评论数、city/district 当前未获得可靠字段，均保持 null/unavailable。
7. FlyAI CLI 是子进程调用，具有冷启动、并发、超时和 Node runtime 部署成本。
8. 当前 Vercel Python bundle 不包含 CLI，生产部署尚未完成。
9. 旧深圳酒店 UI 与结算仍是静态链路，需由 Phase 4 切换；本阶段用户暂时不会在酒店页面看到 FlyAI 结果。
10. 本阶段没有接入航班、火车，也没有修改高德、GLM 或 StepAudio。
11. 安装测试运行器后 `npm install` 报告了项目依赖树中的安全告警；按本阶段禁止项没有执行 `npm audit fix --force`，需要另开依赖安全审计任务评估。

## Phase 3 完成清单

- [x] 建立统一 TravelHotel
- [x] shId 有稳定映射
- [x] source 明确
- [x] rating 缺失不会造假
- [x] distance 缺失不会造假
- [x] price 定义为 referencePrice / search_reference
- [x] bookingUrl 被保留并校验域名
- [x] FliggyAdapter 完成
- [x] TravelHotelService 完成
- [x] FastAPI 酒店查询接口完成
- [x] FlyAI Key 仍只在服务端
- [x] 当前标准化 Trip 只有一个 selectedHotel owner
- [x] selectedHotel 与 hotelPreference 分离
- [x] 路线系统有统一读取入口
- [x] 深圳静态酒店未被错误删除
- [x] 高德未修改
- [x] GLM 未修改
- [x] StepAudio 未修改
- [x] 航班正式业务未接入
- [x] Phase 3 测试完成
- [x] `FLIGGY_PHASE3_REPORT.md` 完成

Phase 3 到此停止；未自动开始 Phase 4。
