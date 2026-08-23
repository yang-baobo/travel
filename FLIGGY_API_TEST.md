# 飞猪 FlyAI API 最小能力验证

> 测试日期：2026-08-22（Asia/Shanghai）  
> 测试范围：FlyAI 酒店、机票、景点/POI 和错误处理  
> 测试城市：深圳；航班：北京 → 深圳  
> 酒店日期：2026-09-15 入住，2026-09-17 退房  
> 航班日期：2026-09-15  
> 说明：本报告仅记录 Phase 2 真实能力验证，没有接入 App 正式业务。

## 总结

正式 `FLYAI_API_KEY` 已验证可用。FlyAI 能稳定返回深圳酒店、北京到深圳航班和深圳景点/门票结果，并提供飞猪跳转链接。

但酒店结果存在明显能力边界：

- 酒店搜索没有返回房型、库存、价格类型、原价、税费或最终成交价。
- 本次所有酒店 `rate` 都是 `null`，无法依赖 FlyAI 搜索结果实现评分展示或评分排序。
- “世界之窗附近”参数能找到相关酒店，但结果并不都在附近，也没有数值距离字段。
- 价格只是搜索列表中的字符串展示价，不能当成最终成交价或直接进入支付金额。

因此 Phase 3 可以先做“真实酒店搜索 + 参考价 + 飞猪跳转”，但不能把现有模拟房型替换成所谓“真实房型”，也不能承诺实时库存或最终价格。

## A. 实际接入方式

### 官方方案

本次使用飞猪当前官方链路：

1. [FlyAI 官方 Quick Start](https://open.fly.ai/docs/quickstart)；
2. [Alibaba FlyAI 官方 Skill 仓库](https://github.com/alibaba-flyai/flyai-skill)；
3. 官方 npm 包 [`@fly-ai/flyai-cli`](https://www.npmjs.com/package/@fly-ai/flyai-cli)，实际安装版本 **1.0.16**；
4. CLI 通过飞猪 MCP 服务执行搜索，向标准输出返回单行 JSON。

没有猜测或直接调用未公开 REST Endpoint，也没有使用旧版飞猪 TOP API。

### 实际调用路径

```text
api/scripts/test_flyai.py
  → node_modules/.bin/flyai
  → @fly-ai/flyai-cli 1.0.16
  → 飞猪官方 MCP
  → JSON stdout / error stderr
```

独立测试命令：

```bash
npm run test:flyai
```

脚本默认要求正式 Key。只有显式传入 `--allow-trial` 才允许使用 CLI 自带体验模式，避免误把受限数据当成正式结果。

### 官方说明与实际 CLI 的差异

官网和 Skill 文档给出的配置示例是：

```text
flyai config set FLYAI_API_KEY "..."
```

但实际安装的 1.0.16 CLI 帮助中没有 `config` 子命令。实际程序可以直接读取 `FLYAI_API_KEY` 环境变量，本项目因此采用环境变量方式，没有把 Key 写入 CLI 配置文件或源码。

### 是否适合由 FastAPI 包装

能力上可包装：Python 可以用参数数组和子进程调用官方 CLI，再解析 JSON。

但当前只证明了本地服务端调用可行。正式部署前还要验证：

- Vercel Python Function 中是否稳定包含 Node 与本地 CLI；
- 子进程冷启动、并发和超时成本；
- CLI/MCP 的限流与重试行为；
- 是否应改为独立 Node Serverless Adapter，再由 FastAPI 调用。

Phase 2 没有修改 FastAPI 正式接口或部署配置。

## B. API Key

| 检查项 | 结果 |
| --- | --- |
| `FLYAI_API_KEY` 是否被测试脚本读取 | 是 |
| 正式查询是否鉴权成功 | 是 |
| 正式结果是否仍显示体验模式提示 | 否，`systemMessage` 为 `null` |
| Key 是否进入 React Native | 否 |
| Key 是否写入源码或文档 | 否 |
| Key 是否被打印 | 否 |
| `.env` 是否被 Git 忽略 | 是，命中 `.gitignore` |

错误 Key 的真实结果为 HTTP 401，消息为 `Invalid API key`，说明正式 Key 确实参与了鉴权，而不是继续使用体验凭证。

## C. 酒店测试结果

### H1：深圳酒店 + 未来入住日期

**PASS**

- 调用成功：`status: 0`、`message: success`。
- 返回 10 个酒店结果。
- 10 个结果都有唯一 `shId`。
- 返回酒店名、地址、经纬度、类型标签、价格字符串、主图和 `detailUrl`。
- 示例真实结果：雅园笋岗酒店，`shId: 57074012`，搜索展示价 `¥285`。

结论：FlyAI 可以按城市和日期返回真实酒店搜索结果，并提供可用于后续归一化的稳定来源 ID。

### H2：深圳酒店，每晚最高 500 元

**PASS（仅证明搜索过滤，不代表成交价）**

- 调用成功，返回 11 个结果。
- 返回的可解析价格均不高于 500 元。
- 本次价格范围是 `¥15`～`¥28`，结果以低价民宿/经济型住宿为主。
- `--max-price` 对搜索结果有明显约束作用。

这些极低价格进一步说明：`price` 只能按飞猪搜索展示价处理，不能假定为普通标准房最终每晚成交价。

### H3：世界之窗附近酒店

**FAIL（参数可调用，但附近结果不可靠）**

- 调用成功，返回 8 个结果。
- 返回经纬度和 `interestsPoi` 文字，但没有数值距离。
- 8 个结果中只有部分结果明确写有“近深圳世界之窗”。
- 第一条结果位于福田，并不是世界之窗附近。
- 即使使用 `distance_asc`，也无法从响应字段证明按实际距离正确排序。

结论：可以把 `poi-name` 用作搜索提示，但不能把返回列表直接标成“全部位于世界之窗附近”。后续应由高德坐标计算和验证实际距离。

### H4：深圳 4～5 星、最高 800 元、评分排序

**FAIL（星级和价格过滤可用，评分排序不可验证）**

- 调用成功，返回 9 个结果。
- 全部返回为“高档型”，没有经济型/舒适型结果，说明星级参数产生了过滤作用。
- 本次价格均不高于 800 元，范围为 `¥299`～`¥666`。
- 所有结果的 `rate` 都是 `null`。
- 因没有评分值，无法证明 `rate_desc` 排序有效，也无法在 App 中展示真实评分。
- 返回的 `star` 是“高档型”等中文等级标签，不是请求中的数值 4/5，无法精确还原每家酒店是四星还是五星。

结论：后续可以使用星级参数做粗筛，但不能把 `rate_desc` 当作已验证能力；评分为空时必须隐藏评分及评分排序结果说明。

## D. 酒店真实字段

下表只依据 H1～H4 的正式真实响应，不根据文档补字段。

| 业务字段 | 真实返回字段 | 状态 | 本次观察 |
| --- | --- | --- | --- |
| hotel id | `shId` | 存在 | 所有结果都有字符串 ID |
| hotel name | `name` | 存在 | 所有结果都有 |
| city | 无 | 不存在 | 请求里有深圳，结果项没有 city 字段 |
| district | 无 | 不存在 | 地址中可能包含区名，但没有独立字段 |
| address | `address` | 存在 | 所有结果都有字符串地址 |
| latitude | `latitude` | 存在 | 字符串，需要 Adapter 安全转数值 |
| longitude | `longitude` | 存在 | 字符串，需要 Adapter 安全转数值 |
| star | `star` | 有时存在 | 字段都有，但部分值为空格；有效值是“经济型/舒适型/高档型”等标签 |
| rating | `rate` | 暂时无法确认 | 字段存在，但 H1～H4 全部为 `null` |
| review count | 无 | 不存在 | 未返回 |
| price | `price` | 存在 | 带人民币符号的字符串，如 `¥285` |
| price type | 无 | 不存在 | 未说明起价、房型价或含税价 |
| price description | 无 | 不存在 | 未返回 |
| original price | 无 | 不存在 | 未返回 |
| room information | 无 | 不存在 | 没有房型、床型、早餐或取消规则 |
| room availability | 无 | 不存在 | 没有库存/可售状态 |
| hotel image | `mainPic` | 存在 | 所有本次结果都有图片 URL |
| tags | 无 | 不存在 | 酒店结果没有 tags 字段 |
| facilities | 无 | 不存在 | 未返回任何酒店设施列表 |
| distance | 无 | 不存在 | `interestsPoi` 只是附近文字，不是距离 |
| booking/jump URL | `detailUrl` | 存在 | 所有本次结果都有飞猪跳转 URL |
| source ID | `shId` | 存在 | 可同时作为飞猪来源酒店 ID；没有第二个独立 sourceId |

本次实际额外出现的字段：

| 字段 | 状态 | 说明 |
| --- | --- | --- |
| `brandName` | 有时存在 | 部分为品牌名，部分为 `null` |
| `decorationTime` | 有时存在 | 字符串或 `null`，格式不完全统一 |
| `interestsPoi` | 存在 | “近某地铁站/景点”等文字描述 |
| `commissionMoneyYuan` | 暂时无法确认 | 本次全部为 `null`，不应进入客户端 |

## E. 酒店价格结论

### FlyAI 本次实际返回的是什么

酒店只返回一个 `price` 字符串，例如：

```json
{
  "price": "¥285"
}
```

官方 CLI 把 `--max-price` 描述为每晚人民币最高价，但真实响应没有返回：

- 对应房型；
- 入住人数；
- 早餐和取消政策；
- 剩余库存；
- 原价和优惠组成；
- 税费；
- 两晚合计；
- 价格类型或价格说明；
- 价格更新时间。

所以只能确认它是**指定查询条件下的飞猪酒店搜索列表展示价**。仅凭本次字段无法证明它是最终成交价，也无法严格证明它是哪个房型的起价。

### App 最终应该如何展示

建议展示：

```text
飞猪参考价 ¥285/晚
具体房型、库存、税费及成交价以飞猪页面为准
```

规则：

1. 不使用“最终价”“已锁价”“最低可订价”等未经返回字段支持的说法。
2. 在用户跳转飞猪前，不把该价格当作可支付订单金额。
3. 可以把它作为路线预算的**参考估算值**，但必须标记来源和不确定性。
4. `max-price` 可以用于候选过滤，但跳转后仍需以飞猪页面为准。
5. 缺少价格或无法解析时展示“前往飞猪查看价格”，不得填 0 或模拟价格。
6. 搜索结果与飞猪详情页价格可能因库存、时间、会员权益和房型变化；本阶段没有锁价能力。

## F. 预订跳转

### 酒店

- H1 所有酒店都有 `detailUrl`。
- 对第一条酒店执行只读 GET，最终 HTTP 状态为 200。
- 未登录环境会跳转淘宝登录页，这是正常的登录门槛。
- 解码后的目标链路包含正确的 `shid`、`checkIn=2026-09-15` 和 `checkOut=2026-09-17`。
- 因此可以确认链接对应正确酒店和本次日期。

### 航班

- 航班结果都有 `jumpUrl`。
- 对示例链接执行只读 GET，最终 HTTP 状态为 200，并到达飞猪机票搜索页。
- 最终链接包含 `BJS → SZX`、`2026-09-15` 和航班号 `CZ3194`。

本阶段没有登录、下单或支付。短链接可能过期，App 不应长期缓存它作为永久订单凭证。

## G. 航班测试

北京 → 深圳、2026-09-15、直达航班查询：**PASS**。

- 返回 10 个航班结果。
- 示例：南航 `CZ3194`，北京大兴机场 08:00 → 深圳宝安机场 11:20。
- `duration` 与 `totalDuration` 均返回字符串 `"200"`；时间差为 200 分钟，说明本例以分钟表示，但字段本身没有单位。
- 返回票价 `ticketPrice: "520.00"` 和可用跳转链接。

| 业务字段 | 真实字段 | 状态 | 本次观察 |
| --- | --- | --- | --- |
| flight id | 无 | 不存在 | 没有独立唯一航班/报价 ID |
| flight number | `journeys[].segments[].marketingTransportNo` | 存在 | 如 `CZ3194` |
| airline | `marketingTransportName` | 存在 | 如“南航” |
| departure airport | `depStationCode/Name/ShortName/Term` | 存在 | 含机场代码、名称和航站楼 |
| arrival airport | `arrStationCode/Name/ShortName/Term` | 存在 | 含机场代码、名称和航站楼 |
| departure time | `depDateTime` | 存在 | `YYYY-MM-DD HH:mm:ss` 字符串 |
| arrival time | `arrDateTime` | 存在 | `YYYY-MM-DD HH:mm:ss` 字符串 |
| duration | `duration` / `totalDuration` | 存在 | 本例为无单位字符串 `200`，与分钟差一致 |
| direct/transfer | `journeyType` | 存在 | 本例为“直达” |
| cabin | `seatClassName` | 存在 | 本例为“经济舱” |
| price | `ticketPrice` | 存在 | 字符串 `520.00` |
| price description/currency | 无 | 不存在 | 没有币种、税费、票价规则说明 |
| booking/jump URL | `jumpUrl` | 存在 | 已验证能打开正确航线/日期/航班 |

结论：FlyAI 能提供真实航班时间和耗时，可用于未来替换模拟航班；但 Adapter 必须把时间自行解析，并通过起降时间复核耗时，不能无条件把任何无单位数字都当成分钟。

## H. FlyAI POI

深圳“世界之窗”查询：**PASS**，返回 10 个结果。

第一条“深圳世界之窗”实际包含：

- POI ID：`id: "72"`；
- 名称、地址、经纬度、分类、长描述、图片、本地榜单；
- `freePoiStatus: "NOT_FREE"`；
- `ticketInfo.itemId: "741239244341"`；
- `ticketInfo.ticketName: "全天票 成人票"`；
- `ticketInfo.price: "¥220"`；
- 飞猪 `jumpUrl`。

其他结果的 `ticketInfo` 可能为 `null`。这说明 FlyAI POI 是**景点信息与可售门票商品的混合结果**，并非每个 POI 都有商品。

与高德的边界建议：

| 能力 | 建议来源 |
| --- | --- |
| 地图展示、坐标、附近距离、公交/驾车/步行路线 | 高德 |
| 景点介绍、飞猪门票商品、商品价格、商品 ID、购买跳转 | FlyAI |
| POI 身份匹配 | 名称 + 地址 + 坐标综合匹配，不只按名称 |

本阶段没有修改高德 POI。

## I. 错误情况

| 场景 | 实际结果 | Adapter 必须如何判断 |
| --- | --- | --- |
| API Key 错误 | CLI 退出码 1；stderr 为 `MCP HTTP 401`，JSON-RPC code `-32600`，消息 `Invalid API key` | 识别为鉴权/权限错误；不得把 stderr 原样送到客户端 |
| 查询无结果 | CLI 退出码 0；响应 `status: 0`、`message: "empty"`、`itemList: []` | 作为成功的空结果，不是服务异常 |
| 参数错误 | 无效日期时 CLI 退出码仍为 0；响应 `status: 1`，消息含 `CICO_CHECK_PARAM_ERROR` | 不能只看进程退出码，必须同时检查 JSON `status` |
| 不支持的排序值 | 体验预检中无效 sort 被静默接受并返回普通结果 | Adapter 必须在调用 CLI 前做参数白名单校验 |
| 网络 DNS 失败 | 实际观察到 `ENOTFOUND flyai.open.fliggy.com` | 识别为网络错误并允许有限重试 |
| 网络连接超时 | 实际观察到 `UND_ERR_CONNECT_TIMEOUT`；测试脚本也能主动终止超时子进程 | 设置明确超时，终止子进程，不无限等待 |
| 权限不足 | 正式 Key 对本次酒店、航班和 POI 均有权限；未出现独立“权限不足”响应 | 暂时无法确认具体错误码；401 统一归入鉴权/权限类并保留服务端诊断 |
| 非预期格式 | 网络失败时官方 CLI 可能输出 Node 堆栈而不是 JSON；解析器探针能识别非 JSON | stdout 必须严格 JSON 解析，失败时返回结构化上游格式错误 |

安全要求：任何日志和异常都必须先用实际 Key 做脱敏；测试脚本已经执行该规则。

## J. 对 Phase 3 的建议

### TravelHotel 字段

根据本次真实结构，建议先定义最小模型：

```ts
type TravelHotel = {
  id: string;
  source: 'fliggy';
  sourceHotelId: string;
  name: string;
  requestedCity?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  brandName?: string;
  starLabel?: string;
  rating?: number;
  reviewCount?: number;
  price?: {
    rawText: string;
    amount?: number;
    currency?: string;
    meaning: 'search_reference';
    checkIn?: string;
    checkOut?: string;
  };
  imageUrl?: string;
  nearbyDescription?: string;
  bookingUrl?: string;
};
```

注意：

- `requestedCity` 是请求上下文，不得伪装成 FlyAI 返回字段。
- `rating`、`reviewCount`、设施、房型和库存都必须允许缺失。
- 不能把 `starLabel` 反向伪造成精确数字星级。
- 原始 `price` 文本必须保留，解析失败时不能填 0。

### FliggyAdapter 设计

1. 只运行在服务端，使用 `FLYAI_API_KEY`，绝不接受客户端上传 Key。
2. 使用参数数组调用 CLI，不拼接 shell 字符串。
3. 对 city、日期、星级、排序、价格做本地白名单和格式校验。
4. 同时检查子进程退出码、stdout JSON、响应 `status` 和 `itemList` 类型。
5. 为 CLI 设置超时、并发上限和有限重试；网络错误与业务空结果分开。
6. 日志必须脱敏，不能记录环境变量、完整 stderr 或用户敏感查询。
7. 对 `detailUrl/jumpUrl` 做飞猪域名白名单校验。
8. 保留来源 ID、原始价格文本、查询日期和抓取时间，便于追踪动态变化。
9. 检测体验模式 `systemMessage`，生产环境出现时应报警，不能静默上线。
10. 不在 Adapter 中补造评分、设施、房型、库存和最终价格。

### 酒店与 Trip 状态统一位置

Phase 3 应只选一个现有旅行状态作为权威来源。建议扩展现有路线/Trip 状态，使酒店列表和路线规划都读写同一个 `selectedHotelsByNight`，订单保存必要的酒店快照；不要同时保留页面局部 `selectedHotelIds`、`useHotelStore.selectedHotelId` 和另一套新 Trip Store。

本建议只记录设计方向，本阶段没有修改任何 Store。

### 后续可以替换的 Mock

在 Phase 3 酒店链路稳定后可逐步替换：

- `src/data/hotels.ts` 和 `src/data/additionalHotels.ts` 在正式酒店列表中的使用；
- `RoutePlanScreen` 中静态酒店推荐、价格和路线锚点；
- 本地模拟房型只能删除或明确标成演示，不能包装成 FlyAI 房型；
- 航班阶段可用已验证的 FlyAI 航班时间、耗时和票价替换 `src/data/flights.ts` 的生产入口。

暂时保留：

- 高德 POI、地图和交通路线；
- 深圳静态景点/餐厅演示数据，直到对应阶段单独替换；
- OR-Tools 路线优化器；
- GLM、StepAudio 和盲盒；
- 火车票功能仍不新增。

### Phase 3 的功能边界

建议 Phase 3 第一版只实现：

```text
真实酒店搜索
→ 真实基础字段
→ 飞猪参考价
→ 飞猪详情/预订跳转
→ 高德补充距离与路线
```

暂不实现：

- 飞猪真实房型和库存展示；
- 平台内下单或支付；
- 评分排序承诺；
- 仅依赖 FlyAI 的附近距离排序；
- 把搜索展示价直接计入最终订单金额。

## 本阶段文件与停止条件

Phase 2 只增加/修改了允许范围内的内容：

- `api/scripts/test_flyai.py`：独立测试脚本；
- `package.json`、`package-lock.json`：固定官方 CLI 开发依赖 1.0.16 和测试命令；
- `.env.example`：增加空的服务端 `FLYAI_API_KEY` 示例；
- `FLIGGY_API_TEST.md`：本测试报告。

`.gitignore` 原本已经忽略 `.env` 和 `.env.*`，因此无需修改。真实 Key 没有进入 Git。

Phase 2 到此结束，不自动进入 Phase 3。
