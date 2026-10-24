# AI 自定义路线规划重构：Phase 0 现状审计

审计日期：2026-08-30  
审计范围：/Users/wumingyang/Documents/旅行/旅行app 旅行 App 的 AI 自定义路线规划现状  
本阶段：Phase 0，仅审计，不修复业务代码、不改测试、不安装依赖、不进入 Phase 1。

## A. 审计范围与结论

### A.1 已核对范围

- 前端入口：首页规划展开、AI Planning、确认卡、候选地点、路线工作台、实时行程页。
- 前端规划核心：planningCollection、planningPatch、planningRequestBuilder、planningSessionService、planningOrchestrator。
- 前端数据与适配：景点/餐厅搜索、酒店搜索与高德坐标核验、真实交通矩阵、OR-Tools 请求适配。
- Store：Planning Session、Trip、Route、Live Travel、Preference 五类状态。
- 后端：FastAPI 旅行接口、AMap provider/cache、FlyAI 酒店 JS/Python 双实现、酒店地理核验、路线优化器、刷新 worker、Vercel rewrite。
- 旧链路：静态深圳景点/酒店/餐厅/交通矩阵、routeGenerator、mealScheduler、旧 Voice Assistant 以及自定义路线相关 Store。

### A.2 总结性判断

当前不是“没有 AI 规划”，而是已经具备一条可执行的实时规划骨架：用户输入可进入统一 Planning Session，偏好与硬约束可形成请求，景点/餐厅可查 AMap，酒店可查 FlyAI 并尝试高德坐标核验，交通可查 AMap，路线可送入 OR-Tools，草稿可提交到 currentTrip。

但目标要求的“用户确认需求后，按住宿锚点与景点分布决定酒店，再把真实景点、餐厅、交通统一放入可解释且可校验的完整路线”尚未闭环。当前端到端功能完成度建议记为 PARTIAL，约 45%；其中“交互和数据供应商接入骨架”约 65%，而“统一上下文、依赖顺序、餐次/步行/住宿联动、提交后的单一事实源”明显低于这个数字。百分比是审计估算，不是代码覆盖率。

最关键的事实：

1. planningOrchestrator.plan 在同一阶段并行发起景点、餐厅、酒店查询，酒店选择发生在景点分布和路线优化之前；酒店没有根据景点分区、每日路线或总行程代价参与筛选。
2. 餐厅虽然被实时查询并进入 usable，但随后被当作普通 attractions 传入优化器；meal_slots 定义存在，却没有从编排器传给 solver，后端也没有实现餐次约束。
3. 后端 solver 支持 walking_minutes，但客户端只传 durations，行动便利模式目前主要靠地点关键词过滤、惩罚和生成后展示，而不是求解器内的每日步行硬约束。
4. TripPlanDraft 的停止点有 transportToNext，但没有独立、可持久化的完整路段集合；提交后 LiveItineraryScreen 又按页面节点重新查 AMap 路段，编辑地点/天数/时长不会重新运行全局优化。
5. 新 AI 规划与旧静态深圳路线仍共存：首页/行程页按条件在 currentTrip、useLiveTravelStore、useRouteStore、Preference 之间切换，旧 routeGenerator 仍会把静态数据写入旧 Route Store。
6. 后端发现一个明确的 BROKEN 路径：api/place_cache.py:495 使用了未定义的 refresh_error，已有地点详情走到该分支会抛 NameError。本阶段未修复。

## B. 基线检查与工作区状态

以下是按任务要求执行并记录的命令。基线检查时业务工作区干净；审计报告本身是在检查完成后新增的唯一文件。

    pwd
    /Users/wumingyang/Documents/旅行

    git status --short
    （无输出）

    git log --oneline -8
    942ca08 Merge latest team fixes into travel app
    bd96ae8 Complete real-data planning and route resilience
    a669938 修复了一些bug
    7986808 修改盲盒页面和偏好设置页面
    88a0bbb feat: add guided AI route planning flow
    814bbf8 fix: harden live planning providers
    bc7ec2b fix: use supported FlyAI hotel sort
    dc82f16 chore: trigger authorized production deployment

    git diff
    （无输出）

    git diff --cached
    （无输出）

    npx tsc --noEmit
    退出码 0，无输出

    npm run test:planning
    退出码 1；测试尚未开始执行。tsx 启动时尝试监听
    /var/folders/3b/lz727401017ch1ys9s570f0m0000gn/T/tsx-501/60419.pipe，收到 EPERM。
    核心错误：Error: listen EPERM: operation not permitted ...
    Node.js v24.7.0

package.json 中该脚本包含五个 Planning Store/Service 测试文件和一个 homePlanningInteraction.test.mjs；由于 tsx 的临时 IPC 管道权限错误，没有获得测试通过或失败的业务断言结果。不能把这次结果表述为“测试失败于业务逻辑”。

## C. 实际入口与完整调用链

### C.1 用户从首页进入规划

    HomeScreen
      ├─ loadFeatured()
      │    └─ searchTravelPlaces('attraction', '', 1, 8)
      │         └─ travelDataService
      │              └─ GET /api/travel/explore
      │                   └─ Vercel rewrite -> api/index.py::travel_explore
      │                        └─ api/place_cache.py::explore_places
      │                             └─ DB cache / AMap provider
      │
      ├─ loadEditorialAttractions()
      │    └─ fetchFliggyAttractionEditorial()
      │         └─ /api/travel/attractions/editorial
      │              └─ flyai_attractions.mjs
      │
      ├─ buildPlanningRequest()
      │    └─ planningRequestBuilder
      │         ├─ 首页参数：日期、人数、预算、节奏、mode
      │         ├─ Preference Store 快照
      │         ├─ BlindBox draft/confirmed hard constraints
      │         └─ 首屏已加载的 AMap 景点候选
      │
      └─ beginSession()
           └─ usePlanningSessionStore
                └─ navigation.navigate('AIPlanning')

证据：src/screens/explore/HomeScreen.tsx:167-201, 262-280, 348-397；src/services/planningRequestBuilder.ts:61-120；src/navigation/ExploreStack.tsx:48-56。

首页实际只把首屏 AMap 景点映射成 PlannerCandidate。PlannerCandidatePanel 虽然定义了 attraction/hotel/food/experience 四个 tab，但首页传入的 plannerCandidates 全部来自 featured 景点，酒店和餐厅 tab 没有同等候选源。自动模式默认选中首屏前四个景点。FlyAI editorial 结果用于首页视觉/票务灵感，不进入规划编排器的候选集合。

### C.2 Planning Session 收集需求

    AIPlanningScreen
      ├─ submit(text)
      │    ├─ draft/needs_clarification -> answerPlanningClarification
      │    └─ collecting -> answerPlanningCollection
      │
      ├─ RealtimeCallPanel
      │    └─ transcript -> answerPlanningCollection(..., 'realtime')
      │
      ├─ answerPlanningCollection
      │    ├─ planningCollection 找 active requirement
      │    ├─ planningPatch.buildLocalPlanningPatch
      │    ├─ planningPatch.applyPlanningPatch
      │    └─ 异步 requestPlanningIntent -> api/ai.py::planning_intent_with_glm
      │
      └─ confirmAndGenerate
           └─ generatePlanningDraft
                └─ runPlanningSession
                     └─ planningOrchestrator.plan

证据：src/screens/explore/AIPlanningScreen.tsx:105-180, 259-354；src/services/planningSessionService.ts:49-118, 134-193, 209-233。

当前 Session 设计是“字符串输入 + requirement key + patch”，不是单一的事实/约束上下文模型。planningCollection 用正则从原始 request.userInput 推断 inferredKeys，planningPatch 再按当前 active key 解释裸数字、日期、人数、预算等。GLM 结果回来后以 request revision 和 session id 做过期保护，这部分是可保留的并发安全骨架；但本地解析、GLM normalized/requestPatch/planningPatch、全局 Preference 快照之间存在多套事实写入入口。

### C.3 当前编排器的实际顺序

    planningOrchestrator.plan
      1. getIntent(request, messages)
      2. 合并 intent.requestPatch / intent.planningPatch
      3. 若 needsClarification -> 返回，不查供应商
      4. 并行：AMap 景点搜索 + AMap 餐厅搜索 + FlyAI 酒店搜索
      5. 合并地点，按名称精确解析 must/prefer/avoid
      6. 取 FlyAI 返回的前 3 个酒店，逐个请求高德地理核验
      7. 先按坐标、禁用词、过敏词、行动便利关键词、营业时间、预算过滤地点
      8. 把景点和餐厅混成一套 usable route nodes
      9. 对酒店 + 所有地点做全有序对 AMap 交通矩阵
     10. 失败路段如不涉及 required 节点，删除相关可选地点并重建矩阵
     11. 调 OR-Tools：按天、时间窗、酒店 start/end anchor 排序
     12. 将 solver stops 映射为每天 stops，附加 transportToNext
     13. 返回 TripPlanDraft；AIPlanning 确认后 commit 到 currentTrip

证据：src/services/planningOrchestrator.ts:350-410, 430-500, 506-576, 578-705。

其中第 4 步是目标架构的主要顺序错误：酒店搜索发生时尚不知道最终会保留哪些景点、景点如何按天分布、每天的交通代价是多少。第 8 步是餐饮建模错误：餐厅节点拥有地点和营业时间，但没有 mealType、具体哪一天/哪一餐、用餐持续时间或餐次容量的语义。

### C.4 提交后展示链路

    commitDraft()
      └─ useTripStore.commitFromDraft()
           └─ AsyncStorage: beijing-current-trip-v1
                └─ navigation.replace('LiveItinerary')

    LiveItineraryScreen
      ├─ currentTrip 优先；否则读取 useLiveTravelStore.itinerary
      ├─ currentTrip.hotel 优先；旧链路才读取 useRouteStore.selectedHotel
      ├─ 为页面节点重建每天 hotel -> places -> hotel 链
      ├─ 对页面相邻节点重新调用 fetchAmapRouteSegment
      └─ 用户移动/删点/改天/改时长直接更新 Store，不回到 orchestrator

证据：src/services/planningSessionService.ts:312-329；src/store/useTripStore.ts:31-69, 163；src/screens/explore/LiveItineraryScreen.tsx:89-183, 192-263, 461-535。

## D. 完成度矩阵

状态含义：COMPLETE = 目标能力已闭环且证据充分；PARTIAL = 有实现但范围/语义不完整；MISSING = 目标能力没有实现；BROKEN = 代码路径明确会失败；UNKNOWN = 需要运行环境/供应商响应才能确认。

| 目标能力 | 状态 | 现状证据与结论 |
|---|---|---|
| 首页进入 AI 自定义规划 | PARTIAL | HomeScreen 有参数面板、模式、候选面板和导航；但自动模式默选首屏 4 个景点，首页餐厅/酒店不是候选同源。 |
| 统一 Planning Session | PARTIAL | usePlanningSessionStore 保存 session/request/messages/requirements/draft；但 Preference、BlindBox、Trip、Route、LiveTravel 仍各有事实入口，且 request 结构重叠。 |
| 用户确认后再查询完整真实数据 | PARTIAL | PlanningConfirmationCard 文案和按钮符合意图；正常确认会运行 orchestrator，但首页 editorial/featured 在进入确认前已查，且“确认后才查询”的表述与首屏预取不完全一致。 |
| 需求可编辑、可追溯 | PARTIAL | patchHistory、messages、derived evidence、revision 存在；但同一字段可由字符串正则、GLM normalized/requestPatch/planningPatch、Preference 同步重复写入。 |
| 景点真实查询 | COMPLETE（规划层） | orchestrator 使用 /api/travel/explore 的 AMap attraction；place_cache 支持 DB fresh/stale/miss 与 AMap 回源；不使用静态深圳景点补位。可用性仍依赖 AMap key/cache。 |
| 餐厅真实查询 | PARTIAL | AMap restaurant 查询和营业时间/禁用词/过敏词筛选存在；但餐厅被当成普通 route node，无 meal assignment，不能证明“午餐/晚餐真实安排”已闭环。 |
| 酒店真实查询 | PARTIAL | FlyAI JS handler、缓存、价格快照、结果标准化存在；选择只看前 3 个结果并核验坐标，且在景点分布前发生，不是住宿锚点驱动的联合选择。 |
| 酒店坐标可信 | PARTIAL | provider 坐标默认 coordinateVerified=false；编排器调用 AMap geocode，只接收 verified；但验证缓存主要在内存，未形成统一持久化事实。 |
| 酒店参与每日路线锚点 | PARTIAL | solver days 有 start/end anchor；draft stop 只保存到下一站的段，酒店到首站/末站的展示由 LiveItinerary 重算。 |
| 实时交通数据 | PARTIAL | AMap routes 有 DB cache、客户端 5 分钟 cache、estimated=false；但矩阵是全有序对，失败时删除可选节点，且 any 模式的 fallback 可能把不满足步行/公交阈值的最后可用结果返回。 |
| 真实交通进入优化器 | PARTIAL | buildAmapDurationMatrix 返回真实 duration 并传入 solver；没有传 walking matrix，交通价格/细节也未进入 solver 目标函数。 |
| 景点按天分布 | PARTIAL | OR-Tools 负责按时间窗、required、locked day 和酒店 anchor 分配；没有按地理区域先聚类，也没有酒店候选与分布的反馈循环。 |
| 营业时间约束 | PARTIAL | orchestrator 对无法解析 HH:mm-HH:mm 的地点剔除，餐厅窗口与午/晚餐边界求交；跨午夜、节假日、按日闭馆的信息仍不足。 |
| 餐次约束进入 solver | MISSING | 前端/后端类型有 meal_slots，但 orchestrator 不传；api/index.py 的 solver 未读取餐次。 |
| 每日步行硬约束 | MISSING | 后端只有在收到 matrix.walking_minutes 时才加 Walking dimension；客户端只传 duration；前端 LiveItinerary 只是计算/展示步行片段。 |
| 行动便利模式 | PARTIAL | 通过 mobility policy、关键词和硬限制减少高体力地点，加入休息/驾驶优先说明；未以真实步行矩阵和景区内部数据证明满足每日步行上限。 |
| 预算约束 | PARTIAL | 过滤已知门票/餐厅/酒店参考价并标 unknown；总价未包含完整交通费用，部分价格是 null，不能保证最终总预算。 |
| 生成可解释草稿 | PARTIAL | warnings、uncertainties、unassigned、issues、provider、derived evidence 都有；但“已知费用”不是完整成本，“完整路线”缺少独立路段事实。 |
| 提交到新行程 | COMPLETE（本地 Store） | commitDraft -> commitFromDraft 写入 currentTrip，并持久化 AsyncStorage；无服务端用户行程持久化。 |
| 提交后编辑仍符合全局约束 | MISSING | Trip Store 的移动、改天、改时长直接修改已提交天/站；不会重新跑矩阵、solver、营业时间或预算校验。 |
| 新旧路线单一事实源 | MISSING | currentTrip、Route Store、Live Travel Store、Preference 并存，页面按条件分叉。 |
| 旧静态链路被隔离 | MISSING | routeGenerator、Voice Assistant、useAttractionStore/useHotelStore、静态矩阵仍在使用，且 generateRoute 会写旧 Route Store。 |
| place detail 后端稳定 | BROKEN | api/place_cache.py:495 引用了函数内未定义的 refresh_error；已有缓存地点详情路径可能抛 NameError。 |
| 酒店 stale refresh 完整 | BROKEN | JS 酒店 handler 会 enqueue job_type=hotel；scripts/process_refresh_jobs.py:117-125 只处理 place/route，其他类型抛 unsupported_job_type。 |
| 真实 provider 运行可用 | UNKNOWN | 取决于 AMAP_WEB_SERVICE_KEY、FLYAI_API_KEY、GLM/StepFun、DATABASE_URL 和供应商限流；本次未主动发起付费/外部 provider 请求。 |
| 规划测试状态 | UNKNOWN | TypeScript 通过；npm run test:planning 被 tsx IPC EPERM 阻断，不能从本次结果判断业务测试。 |

## E. 四类核心真实数据的来源、状态与问题

### E.1 景点

| 数据项 | 分类 | 实际来源/处理 | 审计判断 |
|---|---|---|---|
| 规划候选景点 | REAL | AMap /v5/place/text，后端统一 source=amap，通过 /api/travel/explore 返回；规划器再按关键词/偏好搜索。 | 新 AI 规划没有用静态景点补位；但首页首屏已提前搜索。 |
| 地点列表缓存 | CACHED_REAL | api/place_cache.py：景点 fresh 7 天、stale 30 天；stale 可先返回并排刷新。 | 是真实数据的缓存副本，不应在 UI 中再标成“刚刚实时”。 |
| FlyAI editorial 景点 | REAL / CACHED_REAL | flyai_attractions.mjs 只服务 editorial 图片/票务灵感，独立缓存 fresh 6 小时/stale 2 天。 | 当前不进入 orchestrator 的正式候选，不应与 AMap 规划地点混为同一事实源。 |
| 类别、标签、区域、评分 | REAL | 由 AMap business/type/category 归一化。 | 可作为筛选/排序输入，不能直接证明景区内部可达性。 |
| 营业时间 | REAL（字段）/ DERIVED（窗口） | AMap 原始 openHours 为 REAL；编排器只解析简单 HH:mm-HH:mm 并与日程/餐次求交。 | 丢失跨午夜、按日闭馆、临时闭馆时会剔除或产生不确定性。 |
| 游玩时长 | ESTIMATED / DEFAULT | durationFor 对餐厅 75 分钟、普通地点 120 分钟、relaxed/elderly 150 分钟、packed 90 分钟等硬编码。 | 不是 provider 事实；应进入统一估算来源与可编辑上下文。 |
| 门票/费用 | REAL 或 UNKNOWN | AMap cost 有值时参与已知费用；无值不补静态价格。 | “不补静态”是正确方向，但预算只覆盖已知部分。 |

### E.2 酒店

| 数据项 | 分类 | 实际来源/处理 | 审计判断 |
|---|---|---|---|
| 酒店搜索结果 | REAL | Vercel rewrite 将 /api/travel/hotels/search 指向 flyai_hotels.mjs；通过 FlyAI CLI 搜索日期/预算/星级。 | 部署主链路是 JS；Python api/hotels 仍是重复适配路径，存在漂移风险。 |
| 酒店搜索缓存 | CACHED_REAL | Node cache fresh 10 分钟、stale 30 分钟；stale 结果带 isPriceStale。 | 日期绑定价格应明确为缓存价格，不是最终成交价。 |
| 参考价格 | REAL / CACHED_REAL / UNKNOWN | FlyAI search_reference 价格；无值为 unknown，编排器只累计 known cost。 | 不能把参考价视为预订价，也没有完整房型/入住人数校验闭环。 |
| 酒店 provider 坐标 | REAL（未可信） | FlyAI 可返回坐标，但标准化时 coordinateVerified=false。 | 不直接进路线，符合安全原则。 |
| 酒店高德坐标 | REAL（核验结果）/ CACHED_REAL（进程内） | /api/travel/hotels/geocode 用酒店名/地址查 AMap，只有 exact/strong 且唯一结果才 verified。 | 可靠性较高，但缓存和验证结果没有统一持久化事实表写入。 |
| 选中的酒店 | DERIVED | selectVerifiedHotel 只取前 3 个结果，按评分、价格、坐标、区域/设施文字排序。 | 这是排序结果，不是住宿与景点联合优化结果；调用时景点尚未按天分布。 |

### E.3 餐厅

| 数据项 | 分类 | 实际来源/处理 | 审计判断 |
|---|---|---|---|
| 餐厅候选 | REAL | AMap /api/travel/explore?category=restaurant，可走 place cache fresh 24 小时/stale 7 天。 | provider 接入存在。 |
| 餐厅缓存 | CACHED_REAL | DB entity/snapshot；provider 失败时可返回已有 DB 实体。 | 缓存降级需要在 UI 显示 stale/来源状态。 |
| 餐厅营业窗口 | DERIVED | AMap openHours 解析后与午餐 [11:30, latest]、晚餐 [17:00, latest] 求交。 | 只说明可营业，不说明被安排为哪天哪一餐。 |
| 餐厅类型/菜系/过敏风险 | REAL / DERIVED / UNKNOWN | 关键词、tags、typeName 和用户 allergy 文本匹配；过敏原无法由公开字段证明“完全不含”。 | 风险提示合理，不能升级成安全保证。 |
| 餐厅游玩/用餐时长 | DEFAULT / ESTIMATED | durationFor 固定餐厅 75 分钟。 | 没有按 meal type、餐厅实际服务或用户节奏配置。 |
| 餐次安排 | MISSING | meal_slots 类型定义了但 orchestrator 未传，solver 未消费；所有启用午/晚餐的餐厅节点可能被标为 required。 | 这是完整 AI 路线中最大的业务缺口之一。 |

### E.4 交通

| 数据项 | 分类 | 实际来源/处理 | 审计判断 |
|---|---|---|---|
| 单段路线 | REAL | AMap transit/driving/walking，estimated=false；服务端 route cache fresh 10 分钟/stale 2 小时，客户端内存 cache 5 分钟。 | 供应商事实清楚，仍受 key、限流和路段可用性影响。 |
| 路线矩阵 | DERIVED（由 REAL 段组成） | realRouteMatrix 为唯一节点生成所有有序非对角 pair，最多 3 并发；失败 pair 返回给 orchestrator。 | O(n²) 成本和 serverless 时延风险明显。 |
| solver travel duration | REAL 输入 / DERIVED 排序结果 | durations 矩阵传给 OR-Tools；solver 输出按天和顺序的结果。 | 价格、换乘复杂度、步行子段没有共同进入目标函数。 |
| 步行分钟矩阵 | MISSING | 后端 api/index.py:252-273 支持 walking dimension，但 routeOptimizationService 请求只传 node_ids、durations。 | 行动便利的每日步行硬上限在 solver 中没有生效。 |
| UI 相邻段 | REAL 或 UNKNOWN | LiveItineraryScreen 提交后再次 fetchAmapRouteSegment；失败时按页面状态显示。 | 与生成时矩阵不是同一份持久化事实，可能因缓存/偏好/节点顺序变化而不同。 |

## F. 当前与目标架构的差异

| 目标行为 | 当前行为 | 差距性质 |
|---|---|---|
| 先统一确认城市、日期、人数、预算、节奏、偏好、交通、住宿餐食、硬约束 | 这些字段分散在首页 params、Preference、BlindBox hard constraints、Session patch、GLM 两类 patch | 需要统一上下文与 provenance；不是单纯换 UI。 |
| 需求确认后以同一份上下文驱动搜索 | 首页先搜首屏景点和 editorial；规划器再次按 request 搜索 | 预取可保留，但应与正式候选明确区分，避免“确认后才查询”的语义冲突。 |
| 先发现/分布景点，再按景点分区选择酒店 | 景点、餐厅、酒店并行查询；酒店只按前 3 个结果做局部排序 | 依赖顺序错误，住宿不能影响分区和路线成本。 |
| 酒店是每日首尾锚点 | solver 有酒店 start/end anchor；draft/页面对酒店首尾路段分别重算 | 具有部分语义，但路段事实不统一、不完整。 |
| 餐厅按午餐/晚餐插入时间轴 | 餐厅是普通地点节点，营业窗口被压缩为两个可用窗口 | 缺 meal type/meal assignment/用餐时长/重复餐次约束。 |
| 行动便利由真实步行成本和硬约束保障 | 关键词识别、地点排除、优先驾驶、说明文案、固定 reserve；无 walking matrix | 只完成软策略，未完成可证明的硬约束。 |
| 全局优化包含交通、时间、预算、步行、餐次、必去/可选 | solver 主要使用 duration、opening windows、required、locked day；预算在入 solver 前粗过滤，meal/walking 未传 | 优化目标和过滤条件分裂。 |
| 生成后编辑可继续满足约束 | Trip Store 直接变更 stops/days/duration；只有展示层重算路段 | 编辑路径绕过规划器，容易形成失效行程。 |
| 一个行程事实源 | currentTrip、RouteStore、LiveTravelStore、Preference 互相 fallback | 新旧链路并存，页面行为取决于入口和当前哪一个 Store 有值。 |
| 真实数据失败可解释降级 | provider issue/warning/unassigned 基础能力存在 | 仍有 cache stale、酒店 stale worker、place detail bug、provider 双实现等运行风险。 |

## G. Store 与状态关系

### G.1 当前各 Store 的责任

| Store | 当前责任 | 持久化 | 与 AI 规划的关系 |
|---|---|---|---|
| usePlanningSessionStore | 正在收集的消息、request、requirements、intent、draft、patch preview、状态 | 无，内存 | 新规划过程事实源；刷新/离开页面会丢失未提交 session。 |
| useTripStore | 已提交 currentTrip、已生成 days/stops、警告、已知费用；支持直接编辑 | AsyncStorage beijing-current-trip-v1，只 partialize currentTrip | AI commit 的目标 Store；没有服务端保存，没有独立 route segments。 |
| useRouteStore | 旧 custom/guide/system route、selectedHotel、用户路线权重/profile | route-user-learning 只持久化 weights/profile，route stops/currentRoute/selectedHotel 不完整持久化 | 旧路线、旧酒店边界和旧页面仍使用；AI commit 不同步写入。 |
| useLiveTravelStore | 旧 LivePlaces 搜索结果、旧 itinerary、itemMeta、移动/删除/改时长 | 无 | LiveItineraryScreen 没有 currentTrip 时使用；AI 新行程不会写入该 Store。 |
| usePreferenceStore | 全局城市、日期、人数、交通、酒店/餐食、日时间窗、老人模式 | AsyncStorage travel-platform-preferences-v1 | buildPlanningRequest 初始快照；Session revision 为 0 时可同步，之后通常不覆盖规划值。 |

### G.2 主要分叉

1. 首页 hasRoute 同时检查 currentTrip 和旧 Route Store 的 stops；用户可能从同一入口看到不同来源的“有路线”。
2. LiveItineraryScreen 以 currentTrip 优先，否则渲染 useLiveTravelStore.itinerary；酒店又在新 Trip、旧 selectedHotel、Preference 之间 fallback。
3. 旧 routeGenerator.generateRoute 直接读取静态 attractions/restaurants/hotels 与旧 Preference，然后写入 useRouteStore.loadFromPreset；旧 Voice Assistant 会调用它。
4. 新 AI 规划提交后只写 useTripStore，不会刷新旧 Route Store/Live Travel Store。旧页面和新页面因此不会共享同一份 stops/餐厅/交通事实。
5. Trip Store 的 removePlace、movePlace、setPlaceDay、setPlaceDuration 只改提交结构和更新时间；没有调用 planningSessionService 或 orchestrator。

## H. 静态、Mock、默认、估算数据清单

### H.1 仍会被旧链路使用的 STATIC/MOCK

- src/data/attractions.ts：静态深圳景点，含固定坐标、estimatedDuration、ticketPrice、营业/寄存等字段。
- src/data/hotels.ts：静态深圳酒店；导出对象统一补 source: 'static'，固定价格/评分/坐标/附近景点。
- src/data/restaurants.ts：静态深圳餐厅，固定人均、营业时间、餐次和附近景点关系。
- src/data/travelTimeMatrix.ts：静态深圳地点间 RouteOption，含固定公交/驾车/步行耗时、距离、价格和线路描述。
- src/utils/routeGenerator.ts：读取上述静态数据，按评分/区域/固定时间槽生成旧路线；无 provider 请求时还存在“默认路线”、固定 30/5 等 fallback 语义。
- src/utils/mealScheduler.ts：旧路线餐次窗口、间隔、早餐逻辑；不属于新 planningOrchestrator 的 solver 输入。
- src/utils/routeOptimizer.ts、src/utils/costCalculator.ts：旧静态矩阵优化/成本计算路径仍可被旧模块引用。
- src/utils/returnDayPlanner.ts、src/utils/routeReviewBuilder.ts、旧 useAttractionStore/useHotelStore：继续从静态数据构造或读取旧模型。

这些静态数据不应被报告为“新 AI 规划使用的 mock”。目前证据表明新 orchestrator 使用 AMap/FlyAI；真正的问题是旧链路仍可被用户入口和 Voice Assistant 触发，造成产品整体仍存在静态路线。

### H.2 新 AI 链路中的 DEFAULT/ESTIMATED/DERIVED

- planningRequestBuilder：日期/天数、人数、预算、节奏的默认/解析值；Preferences 默认城市北京、交通 any、酒店/午餐/晚餐开关、每日 09:00-19:00 等。
- planningPatch：带父母、膝盖/腿脚/轮椅等文本会推导 elderlyMode、行动限制、休息、门到门交通等 DERIVED 约束；有 sourceText/confidence，但 hard/soft 和 requiresConfirmation 仍混杂于同一 patch。
- planningOrchestrator.durationFor：景点/餐厅游玩或用餐时长固定值，属于 DEFAULT/ESTIMATED，不是 AMap/FlyAI 实时事实。
- routeOptimizationService/api/index.py：没有矩阵条目时 solver 使用超大不可行值 1,000,000，这是求解安全哨兵，不是路线估算；不要在 UI 展示为耗时。
- LiveItineraryScreen：没有 stop meta 时使用 120 分钟默认展示时长；该默认值不等于生成器实际时长。
- 旧 routeGenerator：静态 attraction estimatedDuration、旧餐厅价格 fallback 40/60/80、hotel/交通固定值，属于 STATIC/ESTIMATED。

### H.3 MOCK 结论

新 AI 编排器没有发现用静态深圳地点作为 provider 失败时的自动补位；酒店失败会明确 warning/blocking，而不是静态酒店兜底。这一点可标为 COMPLETE（防止静态补位）。但旧链路的静态数据仍然存在并可达，因此“整个 App 不再有 mock/static 路线”是 MISSING。

## I. 可保留模块、应重构模块与 Phase 1 修改边界

### I.1 可保留

- usePlanningSessionStore 的 session id、revision、状态机、messages、draft/patchPreview 状态。
- planningDateValidation 的时区日期验证与 planningRequestBuilder 的基础输入归一化思路。
- planningPatch.validatePlanningPatch 的类型边界、硬约束只收紧的安全方向，以及 derivedConstraints 的证据字段。
- planIntentSchema.validatePlanIntent 的白名单协议和远端响应校验。
- planningSessionService 的 GLM 异步结果 stale revision/session guard。
- travelDataService、AMap provider、真实 route matrix、FlyAI hotel adapter、酒店高德核验的 provider 边界；这些应作为统一 context 的数据能力，而不是推翻重写。
- PlanningConfirmationCard 的确认前展示和“真实价格/营业时间/交通缺失时明确提示”的产品原则。

### I.2 应重构但本阶段不改

- src/types/planning.ts：把当前扁平 request 与多套 patch 拆为统一 PlanningContext，至少区分 explicit facts、derived constraints、provider facts、defaults/estimates、confirmation/provenance。
- src/services/planningCollection.ts：从“每个 key 问一个问题 + 正则猜已填”改为基于字段 provenance/status 的缺口计算；不要再用原始整句 userInput 作为主要事实判断源。
- src/services/planningPatch.ts：保留校验器，统一本地文本、ASR、realtime、GLM 的解析输出到同一种 typed patch；明确替换旧值、追加数组、收紧硬限制、撤销推导约束的语义。
- src/services/planningRequestBuilder.ts：只负责从用户确认值和 Preference 生成初始 context，不应再承担多处事实合并。
- src/services/planningSessionService.ts：将收集、确认、provider query、draft revision、commit preview 的阶段边界显式化；编辑已提交行程应回到同一 context/replan 入口。
- src/utils/planIntentSchema.ts 与 api/ai.py：统一 normalizedRequest、requestPatch、planningPatch 协议，避免两套可写字段含义重叠。
- src/services/planningOrchestrator.ts：Phase 1 只先接收统一 context；酒店/景点/餐厅/交通依赖顺序和联合优化属于后续阶段，不在本次 Phase 0 或 Phase 1 的 context model 中实现。
- src/store/useTripStore.ts、useRouteStore.ts、useLiveTravelStore.ts：Phase 1 先明确谁是 AI 行程 canonical source，以及旧入口如何只读/迁移；不要在没有模型边界的情况下继续互相 fallback。

### I.3 Phase 1 的精确修改范围：只做统一用户需求/上下文模型

Phase 1 建议只允许改以下范围：

1. 定义一个有版本号的用户规划上下文，字段覆盖 city、travel dates/days、people、budget、pace、categories/cuisines、transport rules、hotel/meal needs、daily windows、mobility/hard constraints、place mentions、candidate references。
2. 每个字段保存 value、source（user/preference/home/ai）、confidence、confirmed、updatedAt/revision；默认值、估算值、provider 事实、用户明确要求不能只靠字符串拼接区分。
3. 将 PlanningPatch 收敛为一个 typed patch：set/append/remove/derive/confirm 的行为明确；保留 hard constraint 单向收紧，撤销或放宽必须有明确用户动作和审计消息。
4. 让 text、ASR、realtime、GLM 都先输出同一个 patch 协议，再由一个 reducer 应用到 context；移除重复的“active requirement + 原始全文正则”事实写入路径。
5. PlanningRequirements 从 context 的 confirmed/missing 计算，不再从 request.userInput 反向猜测已确认字段。
6. 保持现有 provider、solver、页面视觉和提交动作不变；本阶段不重排酒店/景点查询，不实现餐次 solver，不改 transport matrix 算法，不清理静态数据。
7. 为旧 Route/Preference 输入增加只读 adapter，使旧页面可以提供 context 初值，但不能绕过 Planning Session 直接覆盖已确认值。

### I.4 Phase 1 必须补的最小测试

- 在 active key 为 budget 时输入裸数字 10000，只更新预算；切换 active key 后相同数字不能误改预算。
- 带父母/膝盖不便/轮椅产生 derived constraint，保存原文、来源、置信度和 requiresConfirmation。
- 用户明确“不要酒店/不要晚餐”可以关闭对应默认值；旧 Preference 默认不能覆盖明确输入。
- 旧预算/日期/人数被新输入替换时不产生重复事实；patch history 可回溯。
- hard max walking 只允许收紧；任何来源不能静默放宽。
- text、ASR、realtime 对同一 session 得到同一类 typed patch。
- GLM 延迟返回时，旧 revision 不能覆盖新 revision；新 session id 不能被旧响应写入。
- Preference sync 只在未发生 session edit 时初始化，不覆盖已确认 context。
- 序列化/反序列化 Planning Context 后字段 provenance、unknown/default/estimated 分类不丢失。

## J. 风险、阻塞与待确认项

### J.1 运行与供应商风险

- AMap：AMAP_WEB_SERVICE_KEY 缺失、配额/限流、地点无坐标、营业时间不规范、路线部分失败都会影响“真实完整路线”。realRouteMatrix 是全有序 pair，节点增加后 provider 请求量按 O(n²) 增长。
- FlyAI：JS 和 Python 有两套酒店 provider/模型/CLI 适配；部署 rewrite 主路径是 JS，但本地/其他 fallback 可能走 Python，字段和错误语义可能漂移。
- GLM/StepFun：缺少 GLM_API_KEY/GLM_BASE_URL/GLM_MODEL 或 ASR 配置时会进入 local fallback；fallback 只规范化已确认输入，不负责发现地点和价格，这是正确的安全边界，但 UX 需要清楚显示。
- 数据库：DATABASE_URL 不可用时，place/route/hotel cache 可能回到进程内或直接 provider；serverless 实例内存缓存不可共享，也不能保证跨请求存在。
- Vercel：Python functions 最大 300 秒，FlyAI JS 最大 60 秒；酒店 stale refresh 使用后台任务但 serverless 返回后不保证任务完成。
- 凭据卫生：.env.example 中应再次确认是否只包含占位符，尤其是 AMap key 字段；本次未修改配置，未读取或输出真实 secret。

### J.2 代码级阻塞

- api/place_cache.py:495 的未定义 refresh_error 是明确 BROKEN，需要在后续修复前加回归测试。
- scripts/process_refresh_jobs.py:117-125 不支持 hotel job type，而 flyai_hotels.mjs 会写 hotel refresh job；酒店缓存后台刷新链路当前不能宣称闭环。
- api/index.py 的 solver 有 meal_slots/walking_minutes 接口但消费不完整，容易给调用方造成“已支持约束”的假象。
- TravelHotelService/JS handler/Python hotel service/HotelGeoService 之间有重复边界；没有明确唯一 provider owner，后续改动容易只修一条链。
- AMap any 交通选择在某些受限条件下可能返回最后一个有结果但已超过步行/公交阈值的 segment；需要在后续交通策略阶段确认是否允许“可用但超限”的可解释降级。

### J.3 产品与数据风险

- AMap 地点的公开字段不足以证明景区内部无障碍、台阶、排队时间、预约和实际游玩时长；当前只能标 UNKNOWN/提示，不能承诺行动便利。
- 过敏过滤只匹配公开文本，不能证明餐厅完全不含过敏原；现有 uncertainty 文案应保留。
- 已知费用可能没有交通、完整餐次、未返回门票/房价等项目；“总预算内”只能称为已知费用预算检查。
- provider cache stale 数据可能被 UI 当成实时；需要统一显示数据新鲜度和来源分类。
- 生成后拖动/改时长可能产生营业时间、酒店往返、步行上限和预算失效，但 UI 没有重新验证/标记。

## 最终审计结论

- 当前状态：PARTIAL，具备真实 provider + Session + solver 的骨架，但尚未形成目标级闭环。
- 前五个架构问题：
  1. 规划事实分散在 Session、Preference、Trip、Route、Live Travel，多源可写且无 canonical context。
  2. 酒店查询/选择早于景点按天分布，住宿没有参与联合规划。
  3. 餐厅没有餐次语义，meal slots 未进入 solver。
  4. walking matrix 未进入 solver，行动便利主要是规则/文案而非可证明约束。
  5. 提交后编辑与旧静态路线绕过同一规划器，完整路线和路段事实无法保持一致。
- 可保留：Session revision/并发保护、patch 校验、日期验证、真实 provider 边界、酒店坐标核验、真实 AMap matrix、确认卡的无静态补位原则。
- Phase 1 只应先统一用户需求/上下文/patch/provenance/reducer 和测试；不应在未确认上下文模型前同时重排酒店、重写 solver、清理旧页面。
- 本次未修改任何业务代码、测试或配置；仅新增本报告。

