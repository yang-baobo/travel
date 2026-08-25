# 北京真实旅行数据缓存：Agent 执行框架

> 适用项目：当前旅行 App（React Native / Expo Web + FastAPI + Vercel Node Function）
> 目标城市：第一阶段只做北京
> 使用方式：把本文件连同项目交给 Agent，并明确指定“只执行 Phase N”。每个 Phase 完成并验收后，再执行下一阶段。

## 一、总任务说明（可直接发给 Agent）

继续当前旅行 App 的真实数据接入工作。现有高德、FlyAI、GLM 和 StepAudio 功能必须保留。

当前问题是：景点、餐饮、酒店和路线在页面打开时频繁请求第三方 API，用户等待时间较长。项目虽然存在少量内存缓存，但部署在 Vercel Serverless 后，实例重启或切换实例时缓存会丢失；FlyAI 酒店搜索还会在每次请求时执行官方 CLI。

本任务要建立一个“服务端持久化数据层 + 分级缓存 + 北京预热”的体系，使网页优先读取平台已有数据，第三方 API 主要承担刷新和补充职责。

### 核心原则

1. PostgreSQL 是跨用户、跨实例的持久化缓存和旅行资料库。
2. 浏览器不是权威数据源，不允许把数据库凭证或第三方 Key 放入 React Native。
3. 景点、餐厅和酒店基础信息可以长期保存；酒店价格、房态和预订链接只能短期缓存。
4. 数据过期时优先采用 stale-while-revalidate：可以先返回允许展示的旧基础资料，再进入刷新队列。
5. 酒店旧价格不能伪装成实时成交价；超过允许期限后必须隐藏价格或重新查询。
6. 高德仍负责 POI、坐标和交通路线；FlyAI 仍负责酒店/旅行商品。不得用缓存层改变二者边界。
7. FlyAI 继续使用官方 `@fly-ai/flyai-cli`，不猜测 REST Endpoint，不改成旧版 TOP API。
8. 所有数据库和 API 凭证只能由服务端环境变量读取，不进入前端、不提交 Git、不打印完整值。
9. 数据保存、图片展示、价格和评论字段的长期存储必须服从高德和 FlyAI 的正式协议；无法确认授权的字段先短期缓存，不做永久资料库。
10. 每次只执行用户指定的一个 Phase。完成报告和测试后停止，不自动进入下一 Phase。

## 二、当前项目事实

- FastAPI 入口：`api/index.py`
- 高德实现：`api/travel_providers.py`
- 高德现有缓存：进程内字典，TTL 5 分钟，不能跨 Serverless 实例
- 酒店正式线上入口：`api/flyai_hotels.mjs`
- 酒店调用方式：官方 FlyAI CLI
- 酒店领域模型：`src/types/hotel.ts`
- 景点/餐饮类型：`src/types/travel.ts`
- 前端统一请求：`src/services/apiClient.ts`
- 前端旅行数据调用：`src/services/travelDataService.ts`
- 酒店服务：`src/services/travelData/hotel/`
- 当前部署：Vercel
- 当前第一城市：北京，adcode `110000`

不得把历史深圳静态演示数据当成真实北京缓存写入数据库。

## 三、推荐架构

```text
React Native / Expo Web
        │
        ▼
现有同域 API（不得直连数据库或第三方）
        │
        ▼
缓存服务 / Repository
   ├── Fresh：立即返回 PostgreSQL 数据
   ├── Stale：返回允许使用的旧数据，并登记刷新任务
   └── Miss：请求高德或 FlyAI，标准化、保存、返回
        │
        ├── PostgreSQL：实体、查询快照、路线、刷新任务
        ├── 高德：POI、坐标、路线
        └── FlyAI：酒店搜索参考价、跳转商品
```

第一版只使用 PostgreSQL，不强制加入 Redis。数据库压力或并发量明显增加后，再添加 Redis 作为 L1 热缓存。

数据库必须通过标准服务端环境变量读取：

```env
DATABASE_URL=
CACHE_REFRESH_SECRET=
```

`DATABASE_URL` 推荐使用支持 Serverless 连接池的 PostgreSQL URL，可来自 Supabase、Neon 或其他兼容服务。

## 四、缓存等级和时间策略

| 数据 | Fresh TTL | 最长 Stale | 过期后的处理 |
|---|---:|---:|---|
| 景点基础资料 | 7 天 | 30 天 | 可展示旧资料并刷新 |
| 餐厅基础资料 | 24 小时 | 7 天 | 可展示旧资料并刷新 |
| 酒店基础资料 | 7 天 | 30 天 | 可展示旧资料并刷新 |
| 酒店日期价格/房态/跳转 | 10 分钟 | 30 分钟 | 超过 30 分钟不得当作当前价格展示 |
| 酒店高德坐标解析 | 90 天 | 180 天 | 可继续使用并后台复核 |
| 步行路线 | 7 天 | 30 天 | 可展示旧距离和基础耗时 |
| 驾车/公交路线 | 30 分钟 | 2 小时 | 超期重新请求，不显示为实时路况 |

酒店缓存响应必须继续保留现有价格免责声明，并新增但不破坏旧客户端的元信息：

```json
{
  "cacheStatus": "fresh | stale | miss | refreshed",
  "fetchedAt": "ISO-8601",
  "expiresAt": "ISO-8601",
  "isPriceStale": false
}
```

## 五、建议数据表

Agent 可以根据当前代码微调列名，但不能用一个无结构的大 JSON 表代替所有核心实体。

### `travel_places`

- `source`
- `source_id`
- `city`
- `adcode`
- `category`
- `name`
- `district`
- `address`
- `latitude`
- `longitude`
- `rating`
- `cost`
- `open_hours`
- `tags_json`
- `photo_urls_json`
- `normalized_json`
- `source_updated_at`
- `refreshed_at`
- `expires_at`
- 唯一键：`(source, source_id)`

### `hotel_properties`

- `source`
- `source_hotel_id`
- `stable_hotel_id`
- 酒店名称、城市、区域、地址、星级、评分、图片、标签、设施
- 已验证的高德坐标、`amap_poi_id`、匹配可信度和验证时间
- `normalized_json`
- `refreshed_at`
- `expires_at`
- 唯一键：`(source, source_hotel_id)`

### `hotel_search_cache`

- `query_hash`
- `request_json`（标准化后，不含 Key）
- `response_json`
- `fetched_at`
- `expires_at`
- `stale_until`
- 查询键必须至少包含目的地、入住/退房日期、价格上限、星级、关键词、POI 和排序。

### `route_cache`

- `route_key`
- 起终点经纬度（建议标准化到约 1 米精度）
- `mode`
- `distance_meters`
- `duration_minutes`
- `price`
- `detail_json`
- `fetched_at`
- `expires_at`
- `stale_until`

### `refresh_jobs`

- `id`
- `job_type`
- `dedupe_key`
- `payload_json`
- `status`
- `attempts`
- `available_at`
- `last_error_code`（不得保存含 Key 的原始 URL或异常）
- `created_at` / `updated_at`

同一个 `dedupe_key` 在待处理状态下不得重复创建，避免缓存击穿。

## 六、分阶段执行

## Phase 0：只读审计

### 目标

确认所有真实请求入口、重复查询路径、现有缓存和 Vercel 运行时边界。

### 允许

- 读取代码和配置
- 输出 `DATA_CACHE_AUDIT.md`

### 禁止

- 修改业务代码
- 创建数据库
- 改 UI
- 改第三方 API 调用方式

### 报告必须包含

- 每个页面触发哪些 API、触发次数和参数
- Python 与 Node Function 的运行时边界
- 当前缓存为什么无法跨实例
- 预计最慢的三条调用链
- Phase 1 精确文件清单

完成后停止。

## Phase 1：PostgreSQL 缓存基础层

### 目标

只建立数据库连接、迁移和通用缓存 Repository，不接管现有正式接口。

### 必须实现

- SQL migration 文件，禁止在普通 API 请求中自动建表
- Python PostgreSQL 客户端和 Node PostgreSQL 客户端
- Serverless 安全连接：短事务、连接复用上限、查询超时
- 标准化查询和稳定 SHA-256 `query_hash`
- Fresh / Stale / Miss 判定
- Upsert、读取、失效和刷新任务去重
- 数据库不可用时允许现有 API 继续直连第三方，不能让整个 App 崩溃
- `.env.example` 只增加空的 `DATABASE_URL` 和 `CACHE_REFRESH_SECRET`
- `.gitignore` 确保真实环境变量不提交

### 测试

- migration 可重复执行
- 相同参数产生相同 hash，参数变化产生不同 hash
- Fresh / Stale / Expired 边界测试
- 并发请求刷新任务去重
- 数据库断开时安全降级
- 日志不出现连接串和 Key

### 输出

- `DATA_CACHE_PHASE1_REPORT.md`
- 迁移和回滚说明
- 所需环境变量名称，不输出真实值

完成后停止，不接管高德或 FlyAI。

## Phase 2：高德景点与餐饮持久缓存

### 目标

让 `/api/travel/places` 优先读取 PostgreSQL，并保持现有返回字段兼容。

### 必须实现

- Attraction 与 Restaurant 使用不同 TTL
- Provider 成功后按 `(source, source_id)` upsert
- 查询快照和实体同时保存
- Fresh 直接返回，不调用高德
- Stale 返回旧数据并创建刷新任务
- Miss 调用高德，保存后返回
- 高德失败时只在允许的 stale 窗口内回退
- 响应新增缓存元信息，但不删除/改名现有字段
- 不缓存或输出高德 Key、带 Key 的原始请求 URL
- 保留当前北京限制，不顺手扩城市

### 验收场景

- 同一景点查询第二次不调用高德
- Serverless 新实例仍能命中数据库
- 过期数据能降级展示并标记 stale
- 无结果查询短缓存，避免反复打第三方，但不能长期保存
- 搜索关键词、分类、页码必须进入查询键

### 输出

- `DATA_CACHE_PHASE2_REPORT.md`
- 调用次数、首查耗时、缓存命中耗时对比

完成后停止，不修改酒店和路线。

## Phase 3：FlyAI 酒店分层缓存

### 目标

在 `api/flyai_hotels.mjs` 中加入“酒店基础资料 + 日期查询快照”缓存，不改变官方 CLI 接入方式。

### 必须实现

- 先按完整标准化查询读取 `hotel_search_cache`
- Miss 时才执行 FlyAI CLI
- 每次成功响应 upsert `hotel_properties`
- 价格、房态和 booking URL 与入住/退房日期绑定
- 10 分钟内可作为 fresh 参考价
- 10～30 分钟只能明确标记 stale，并保留价格免责声明
- 超过 30 分钟不得把缓存价格当当前价格；刷新失败时清除动态价格/跳转字段或返回明确错误
- 基础酒店资料可以继续展示
- 不把 FlyAI 的任意数字解释为最终成交价
- 不修改高德酒店坐标验证的事实来源
- 缓存失败时仍允许回退到现有官方 CLI 调用

### 验收场景

- 相同日期和筛选条件第二次不启动 CLI
- 日期、星级、最高价或 POI 任一变化都会产生不同查询键
- 旧价格绝不显示为实时成交价
- FlyAI 超时且存在允许 stale 数据时可快速返回
- FlyAI 超时且价格超出 stale 窗口时不能继续展示旧价格
- booking URL 仍执行可信域名校验

### 输出

- `DATA_CACHE_PHASE3_REPORT.md`
- CLI 调用次数和耗时对比

完成后停止，不修改前端页面。

## Phase 4：酒店坐标与路线缓存

### 目标

替换仅存在于单实例内存中的酒店坐标和路线缓存。

### 必须实现

- 高德酒店坐标匹配结果写入 `hotel_properties`
- 不同 FlyAI 酒店只能使用各自稳定 ID 的坐标
- 模糊匹配和错误城市结果不得进入 verified 缓存
- 路线键包含起点、终点和交通方式
- 对步行、驾车、公交分别应用 TTL
- `no_route` 只能短缓存，防止长时间掩盖恢复后的路线
- 继续保留分钟/米单位约定
- 缓存结果必须继续标识 provider、calculatedAt 和 estimated 状态

### 验收场景

- 酒店 → 景点和景点 → 酒店是两个不同方向的缓存键
- 坐标变化会使旧路线键失效
- Serverless 新实例仍命中路线缓存
- 缓存不可用时保持现有高德直查路径

### 输出

- `DATA_CACHE_PHASE4_REPORT.md`

完成后停止。

## Phase 5：北京资料预热与刷新任务

### 目标

让用户第一次打开北京页面也能直接读到已有数据。

### 必须实现

- 建立可审计的北京 seed 配置，不把无限分页和“全北京所有 POI”作为目标
- 景点优先预热热门和主要公共文化场馆
- 餐饮按北京行政区/重点商圈和必要分类分批预热
- 酒店只预热基础资料和少量明确日期窗口；不得批量固化未来价格
- 提供受 `CACHE_REFRESH_SECRET` 保护的内部刷新入口
- 刷新入口不得由客户端直接调用
- 支持批量上限、速率限制、失败重试和断点续跑
- 输出每次新增、更新、未变化、失败数量
- 调度可以使用 Vercel Cron、GitHub Actions 或外部调度器，但必须记录选择理由
- 不在日志中打印 Key、连接串或带凭证 URL

### 建议 seed

- 北京核心景点第一页至合理上限
- 故宫、天坛、颐和园、圆明园、长城、国家博物馆等高频关键词
- 王府井、前门、三里屯、国贸、什刹海、中关村等重点区域
- 餐饮按区域分批，不追求一次抓完全部北京餐厅

### 输出

- `DATA_CACHE_PHASE5_REPORT.md`
- 实际资料数量、API 调用量、失败率和下一次调度时间

完成后停止。

## Phase 6：前端快速展示与数据新鲜度

### 目标

让页面不因刷新而清空已有内容，并向用户诚实说明数据状态。

### 必须实现

- 页面优先保留上一次成功结果，刷新时不切成全屏空白
- 首次无数据才显示完整 loading
- 后台刷新显示轻量状态
- 可显示“更新于 X 分钟前”
- 酒店 stale 价格必须明确标注“历史参考价/正在刷新”
- 超出价格 stale 窗口时隐藏旧价格，不显示 `¥0`
- 浏览器只做短时会话级缓存，不能保存数据库凭证和 API Key
- 不引入第二套 Hotel/Trip 状态源
- 不恢复已关闭的登录流程

### 性能目标

- 已预热的景点/餐饮接口服务端 P50 小于 300ms
- 酒店相同查询缓存命中 P50 小于 500ms
- 页面切换回已加载列表时不重新出现全屏等待

### 输出

- `DATA_CACHE_PHASE6_REPORT.md`
- 关键页面前后对比

完成后停止。

## Phase 7：生产验收

### 目标

在不暴露凭证的前提下完成北京线上验收。

### 必须验证

- 数据库连接成功
- 第一次请求是 miss/refreshed，第二次是 fresh
- 新 Serverless 实例仍能命中持久缓存
- 高德/FlyAI 暂时失败时的降级行为符合各自 stale 规则
- 酒店价格和 booking URL 不越过安全期限
- API 响应不包含 Key 或连接串
- 浏览器生产包不包含服务端凭证
- 线上缓存命中耗时达到目标
- 现有 GLM、StepAudio、盲盒、路线生成没有回归

### 回归测试

- `npm run build`
- `npx tsc --noEmit`
- 全部 Python 单元测试
- 全部现有 Node/TypeScript 测试
- 新增缓存集成测试

### 输出

- `DATA_CACHE_PRODUCTION_REPORT.md`
- PASS / FAIL 表
- 数据量、命中率、P50/P95、第三方调用减少比例
- 已知限制和回滚方法

完成后停止。

## 七、所有 Phase 的禁止项

- 不把真实 `.env`、数据库连接串或任何 API Key 提交 Git
- 不在 React Native 中读取 `DATABASE_URL`
- 不让前端直连数据库
- 不把高德/FlyAI 的原始响应未经清洗直接透传
- 不缓存含第三方 Key 的完整 URL
- 不因缓存加入第二套酒店或 Trip 状态
- 不把旧酒店价格称为实时价或成交价
- 不用静态 mock 覆盖真实 API 错误
- 不顺手修改 GLM、StepAudio、登录、支付或其他无关功能
- 不在当前 Phase 完成后自动继续下一 Phase

## 八、Agent 每阶段交付格式

每个 Agent 最终必须按以下格式报告：

1. 本阶段结论：PASS / PARTIAL / FAIL
2. 修改文件清单
3. 数据库迁移和环境变量
4. 实际缓存键与 TTL
5. 测试命令和结果
6. 性能对比
7. 安全检查
8. 已知问题
9. 下一 Phase 建议

如果缺少 `DATABASE_URL`，Agent 应先完成不依赖真实凭证的代码、迁移和测试框架，然后明确列出阻塞项；不得编造已连接数据库或已完成生产验证。
