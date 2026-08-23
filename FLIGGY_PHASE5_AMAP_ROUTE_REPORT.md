# FlyAI Phase 5：北京真实酒店 + 高德地理补全 + 路线融合报告

完成日期：2026-08-22（Asia/Shanghai）  
当前结论：**Phase 5 完成。北京 FlyAI 酒店、高德酒店定位、三种交通模式、酒店切换和真实多日路线均已通过实际网络验收。**

## 高德 Key 配置审计

- 当前唯一变量名为 `AMAP_WEB_SERVICE_KEY`，未发现 `AMAP_KEY`、`GAODE_KEY` 或第二套高德变量。
- 当前项目 `.env`：变量存在且已有值；`.env.example`：只有空占位；项目内不存在 `.env.local`。
- 历史桌面项目也使用同名 `AMAP_WEB_SERVICE_KEY`。本次仅将其安全复用到当前忽略提交的 `.env`，没有新增或维护重复 Key。
- `api/index.py` 启动时加载项目根 `.env`；`api/travel_providers.py` 从进程环境读取并仅在服务端请求高德；`api/scripts/test_phase5_beijing.py` 仅为真实验收读取该变量。React Native 不读取或接收 Key。
- 已实测高德 `/v5/place/text`、驾车、公交/地铁和步行 Web Service 均成功返回，确认旧 Key 是可用的“Web 服务 API”类型，并具备 Phase 5 所需权限。
- 服务端 HTTPS 使用项目已有 `certifi` CA 包校验证书，没有关闭 TLS 校验。

## A. 北京作为正式城市

正式主验收城市：**北京**。

- FlyAI 正式酒店查询：北京。
- 高德 POI、酒店匹配与路线服务：固定北京行政区 `110000` / 城市码 `010`。
- `src/data/hotels.ts`、`restaurants.ts`、`travelTimeMatrix.ts` 等深圳内容只保留为 `legacy fixture / demo regression`。
- 正式 FlyAI 酒店不会使用深圳静态坐标作为 fallback。
- 本阶段没有修改机票、火车、GLM、StepAudio、支付和生产部署。

状态：**PASS**。

## B. 酒店地理补全

实际链路：

```text
HotelListScreen 选择 FlyAI TravelHotel
→ useRouteStore.selectedHotel（唯一状态源）
→ HotelGeoService
→ POST /api/travel/hotels/geocode
→ AMap /v5/place/text（北京、住宿类型、city_limit）
→ 名称 + 地址 + 区县 + 城市匹配
→ exact / strong 才写回同一个 selectedHotel
→ LiveItinerary 读取核验后的酒店首尾锚点
```

服务端新增独立 `api/hotel_geo.py`，业务端没有直接调用高德公网 URL。Key 仍只读取 `AMAP_WEB_SERVICE_KEY`，并由 FastAPI 启动时加载忽略提交的 `.env`。

状态：代码与真实网络均 **PASS**。

## C. 坐标字段

`TravelHotel` 保留原 `source='fliggy'`，并增加轻量地理语义：

| 字段 | 语义 |
|---|---|
| `latitude` / `longitude` | 领域层统一为纬度/经度；高德边界负责把 `lng,lat` 转换回来 |
| `coordinateSource` | `provider`、`amap` 或 `null` |
| `coordinateVerified` | 只有高德 exact/strong 匹配才为 `true` |
| `geoStatus` | `unresolved/resolving/verified/ambiguous/not_found/error` |
| `geoMatchLevel` | `exact/strong/ambiguous/not_found` |
| `geoConfidence` | 保守匹配分数，不是用户评分 |
| `amapPoiId` | 已确认的高德 POI ID |
| `geocodedAt` | 坐标确认时间 |

FlyAI 原始坐标即使存在，也只标记为 `coordinateSource='provider'`、`coordinateVerified=false`。`selectedHotelRouteBridge` 会将未核验坐标转换为 `null`，不能进入路线算法。

状态：**PASS**。

## D. 匹配策略

匹配不是“搜名称后取第一条”：

1. 查询限定北京 `region=110000`、`city_limit=true`、住宿类型 `100000`。
2. 分别使用酒店名称和地址召回，并按高德 POI ID 去重。
3. 候选必须满足 `adcode` 以 `11` 开头，或行政字段明确属于北京。
4. 综合原始/规范化名称、地址相似度和区县相似度评分。
5. 只有 `exact` 或 `strong` 返回坐标。
6. 两个分店分数接近且地址不同，结果降为 `ambiguous`。
7. 同名外地酒店直接拒绝；`ambiguous/not_found` 坐标均为空。

自动化验证：同名双分店歧义、上海同名酒店拒绝、无结果不造坐标均 **PASS**。

## E. 真实酒店样例

2026-08-22 使用正式 FlyAI Key、北京、2026-09-15 至 2026-09-17、每晚参考价不高于 800 元实测：

- 返回 11 家酒店，FlyAI 延迟约 1855 ms。
- FlyAI 原始坐标仍保持“未核验”，只有下面的高德匹配结果进入路线。

| FlyAI hotel ID | 酒店 | 参考价 | AMap 匹配 | AMap POI | 核验坐标（lat, lng） |
|---|---|---:|---|---|---|
| `fliggy:68180075` | 北京盛捷大兴酒店 | ¥563 | exact，0.840 | `B0HU5UMN5O` | `39.774304, 116.345956` |
| `fliggy:56011398` | 麗枫酒店（北京天安门广场北京站店） | ¥536 | strong，0.749 | `B0FFK5PRRW` | `39.905477, 116.425051` |

上述参考价仍是 FlyAI 搜索参考价，不是成交价。

## F. 真实路线

目标样例：北京盛捷大兴酒店 → 故宫博物院。三种模式均为同一次验收中高德实际返回：

| 模式 | 距离 | 耗时 | 其他 |
|---|---:|---:|---|
| 驾车/打车 | 20.540 km | 52 min | 高德出租车参考 ¥59 |
| 公交/地铁 | 24.991 km | 83 min | 地铁 4 号线大兴线，步行接驳约 2.0 km |
| 步行 | 20.174 km | 269 min | 高德步行路线 |

该路段端到端高德调用延迟约 657 ms，`provider='amap'`，不是静态估算。

代码侧已统一生成：

```text
originId / destinationId / mode
distanceMeters / durationMinutes
provider='amap' / calculatedAt
estimated=false / status
```

高德秒数在服务端转为分钟；正数不足一分钟时最少为 1 分钟。失败为 `null/no_route/error`，不是 `0 minutes`。

## G. 回酒店

目标样例：当天最后景点 → `selectedHotel`。

- 正向和反向都是独立高德请求，不假设耗时对称。
- 真实矩阵包含 `hotel → attraction` 与 `attraction → hotel`。
- 北京实时路线页在酒店核验后将同一家酒店作为出发与返回节点。

实际返程“故宫博物院 → 北京盛捷大兴酒店”：驾车 20.883 km / 48 min，公交 24.491 km / 101 min，步行 20.871 km / 278 min，调用延迟约 640 ms。正反向结果不同，证明系统没有假设路线对称。

自动化集成与真实网络均 **PASS**。

## H. Route Integration

- `buildRealDurationMatrix` 只接受 `status=available` 且 `durationMinutes>0` 的高德段；缺失任一关键段会阻止优化，不回填 15 分钟。
- `optimizeHotelAnchoredTravelRoute` 复用现有 FastAPI / Google OR-Tools optimizer，把核验酒店作为每天 `start_anchor_id/end_anchor_id`。
- 现有 optimizer 没有被重写。
- `validateRoutePlan` 可接收 `realRouteSegments`，与原有每日结束时间、航班和餐时规则共同验证；`validateTravelRouteSegments` 拒绝无路线和非同点 0 分钟。
- `LiveItineraryScreen` 读取同一个 `selectedHotel`，按照地点/酒店/交通偏好变化自动刷新相邻高德段。
- 旧深圳自定义路线矩阵没有被用于北京真实酒店。

真实北京多日验收使用：北京盛捷大兴酒店、故宫博物院、天坛公园、颐和园和四季民福烤鸭店（翠微店）。系统基于 5 个真实坐标构建 20 条有向驾车耗时矩阵，再交给原有 Google OR-Tools：

- Day 1：酒店 → 天坛公园（09:43 到）→ 故宫博物院（12:52 到）→ 酒店（16:40 回）；交通共 130 分钟。
- Day 2：酒店 → 四季民福（11:30 到，饭点）→ 颐和园（13:17 到）→ 酒店（17:29 回）；交通共 142 分钟。
- Optimizer 状态 `optimized`；4/4 项目全部分配；两天均未超出结束时间；总真实交通 272 分钟。
- 全矩阵高德请求总延迟约 13.25 秒（单对约 0.44～1.26 秒），路线缓存仍为短期缓存。

状态：数据层、自动化与真实北京多日路线均 **PASS**。

## I. 酒店切换

自动化实际测试：

```text
选择 A → 发起 A geocode
立即选择 B → B geocode 完成
A 晚返回 → status=stale
Store 仍为 B，B 坐标未被覆盖
```

保护同时使用全局 request ID、`hotel.id` 和当前 Store 选择检查。酒店 ID 或核验坐标变化会改变实时路线签名，触发路线刷新。

实际酒店切换对比（同一目的地故宫）：

- 北京盛捷大兴酒店：驾车 52 分钟，公交 83 分钟。
- 麗枫酒店（北京天安门广场北京站店）：驾车 19 分钟，公交 61 分钟。

酒店变化会改变核验坐标、路线签名和真实耗时。竞争保护与真实 A/B 对比均 **PASS**。

## J. 交通偏好

沿用项目现有 `TransportPreference` 和 `TransportRule`：

| 当前偏好 | 高德 mode |
|---|---|
| `driving`（含当前 taxi/self 子模式） | `driving` |
| `transit` | `transit` |
| `walking` | `walking` |
| `any` | 读取 `transportRule.defaultMode` |

映射只存在于一个纯函数文件，不在多个 UI 中硬编码 `taxi === driving`。

自动化与真实网络的打车/公共交通/步行均 **PASS**。完整多日路线按驾车偏好通过；同一路段的公交和步行结果也已独立实测。

## K. Fallback

| 情况 | 当前行为 |
|---|---|
| geocode timeout / provider error | `geoStatus=error`，可重试，不写坐标 |
| geocode 无结果 | `geoStatus=not_found`，坐标为空 |
| 同名歧义 | `geoStatus=ambiguous`，坐标为空 |
| 外地同名 | 拒绝，不污染北京 Trip |
| route timeout | 请求报错，UI 显示不可用 |
| 某 mode 无路线 | `status=no_route`、距离/耗时为 `null` |
| 真实路线矩阵缺边 | 阻止 OR-Tools 请求，不写 0/15 分钟 fallback |
| FlyAI 原始坐标 | 保留为未核验 provider 元数据，路线桥接层不输出 |

没有天安门、北京中心、`lat=0/lng=0` 或深圳静态酒店 fallback。

## L. 测试

| 检查 | 结果 |
|---|---|
| Python 全量 | PASS，44/44 |
| Phase 5 TypeScript | PASS，8/8 |
| Phase 3 selectedHotel Store | PASS，6/6 |
| Phase 4 酒店 UI | PASS，16/16 |
| TypeScript `npx tsc --noEmit` | PASS |
| Expo Web export | PASS |
| Web bundle Secret 字节扫描 | PASS；FlyAI/AMap/GLM/StepFun Key 均未出现 |
| 真实 FlyAI 北京酒店 | PASS，11 家 |
| 真实 AMap geocode | PASS，2/2 家酒店 |
| 真实 AMap 酒店→景点 | PASS，三种交通模式 |
| 真实 AMap 景点→酒店 | PASS，三种交通模式 |
| 北京多日酒店+3景点+餐厅 | PASS，20 条有向矩阵、4/4 项目分配 |

Phase 5 核心 Case：

| Case | 状态 | 说明 |
|---|---|---|
| 1 selectedHotel → geocode → same A | PASS | 真实酒店 A 精确匹配并进入同一 Store 语义 |
| 2 Hotel A → 景点 | PASS | 真实高德距离与耗时 |
| 3 景点 → Hotel A | PASS | 独立反向高德结果 |
| 4 A → B 路线刷新 | PASS | 同一故宫目的地真实耗时显著变化 |
| 5 打车 | PASS | 映射为 driving，实际返回 52 分钟 |
| 6 公交/地铁 | PASS | 映射为 transit，实际返回 83 分钟 |
| 7 匹配失败 | PASS | 不造坐标 |
| 8 外地同名 | PASS | 北京约束拒绝 |
| 9 A 晚返回覆盖 B | PASS | 返回 stale |
| 10 价格变化 | PASS | 坐标缓存 Key 不含价格/日期 |

真实探针可安全重跑；输出只包含 Key 是否存在，不包含 Key 值：

```bash
.venv/bin/python api/scripts/test_phase5_beijing.py
```

## M. Known Limitations

1. FlyAI 酒店参考价不是成交价；房型、库存、税费和会员权益以飞猪预订页为准。
2. FlyAI 当前 rating 缺失，不能展示或用于排序。
3. FlyAI 不提供已验证的可靠距离；正式距离与交通只认高德。
4. 高德 geocode 仍可能出现同名分店歧义；当前选择保守拒绝自动使用。
5. 高德交通耗时会随路况变化；路线缓存只有 5 分钟，坐标缓存与价格缓存分离。
6. 当前坐标长缓存为进程内 30 天缓存，服务重启后重新核验；后续可迁移到持久化表。
7. 当前真实矩阵为全对全请求，地点很多时后续应增加批处理/并发限流；酒店列表页不会预算所有候选。
8. Vercel FlyAI Node CLI runtime 尚未解决。
9. 生产部署尚未完成。
10. FlyAI 酒店搜索偶尔会短暂返回 provider unavailable；验收脚本只对 timeout/unavailable 做最多 3 次有限重试，生产 UI 仍保留明确错误与重试语义。

## 修改文件

主要新增/修改：

- `api/hotel_geo.py`
- `api/index.py`
- `api/travel_providers.py`
- `api/hotels/models.py`
- `api/hotels/fliggy_adapter.py`
- `api/scripts/test_phase5_beijing.py`
- `src/types/hotel.ts`
- `src/types/travel.ts`
- `src/store/useRouteStore.ts`
- `src/services/travelData/hotel/HotelGeoService.ts`
- `src/utils/amapRouteMapping.ts`
- `src/utils/amapService.ts`
- `src/utils/realRouteMatrix.ts`
- `src/services/routeOptimizationService.ts`
- `src/utils/realRouteValidation.ts`
- `src/utils/routeValidation.ts`
- `src/screens/explore/HotelListScreen.tsx`
- `src/screens/explore/LiveItineraryScreen.tsx`
- `src/screens/custom/RoutePlanScreen.tsx`
- `tests/test_hotel_geo.py`
- `tests/hotelPhase5Route.test.ts`
- `tests/test_travel_providers.py`
- `package.json`

## 当前完成判定

**Phase 5：完成。**

北京 FlyAI 酒店、高德核验坐标、真实三模式路线、酒店切换、20 条有向耗时矩阵、原有 OR-Tools 多日优化及安全验证均已通过。本阶段到此停止，不进入机票、GLM、语音或部署阶段。
