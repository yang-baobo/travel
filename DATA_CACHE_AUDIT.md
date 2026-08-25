# Phase 0 只读审计报告：数据缓存现状

> 严格只读，不修改任何业务代码、配置或数据库。输出完成后停止。

---

## 一、每个页面触发的 API、触发次数与参数

### 1.1 HomeScreen（`src/screens/explore/HomeScreen.tsx`）

| 调用点 | 接口 | 参数 | 触发时机 |
|---|---|---|---|
| `useEffect` 加载推荐景点 | `GET /api/travel/places` | `category=attraction`, `keyword=""`, `page=1`, `pageSize=8` | 页面挂载一次 |
| `useEffect` 加载推荐景点（第2次） | `GET /api/travel/places` | `category=attraction`, `keyword=""`, `page=1`, `pageSize=8` | 页面挂载一次（同一参数，见四） |
| 用户手动搜索 | `GET /api/travel/places` | `category`, `keyword`, `page`, `pageSize` | 用户输入搜索词 |
| 点酒店/餐厅图标 | `GET /api/travel/places` | `category=hotel/restaurant` | 用户点击 |
| 预置盲盒入口 | `POST /api/travel/blind-box` | `BlindBoxGenerateRequest` | 用户点击 |

### 1.2 LiveItineraryScreen（`src/screens/explore/LiveItineraryScreen.tsx`）

| 调用点 | 接口 | 参数 | 触发时机 |
|---|---|---|---|
| 行程段路线（同节点跳过） | `GET /api/travel/routes` | `origin`, `destination` (lon,lat) | 逐段渲染 |

### 1.3 HotelListScreen（`src/screens/explore/HotelListScreen.tsx`）

| 调用点 | 接口 | 参数 | 触发时机 |
|---|---|---|---|
| 酒店搜索（含降级重试） | `POST /api/travel/hotels/search` | `HotelSearchParams` | 页面挂载 + 参数变化 + 用户刷新 |

### 1.4 BlindBoxScreen（`src/screens/blind-box/BlindBoxScreen.tsx`）

| 调用点 | 接口 | 参数 | 触发时机 |
|---|---|---|---|
| 生成盲盒 | `POST /api/travel/blind-box` | `BlindBoxGenerateRequest` | 用户点击 |

### 1.5 UniversalRoute（`src/utils/universalRoute.ts`）

| 调用点 | 接口 | 参数 | 触发时机 |
|---|---|---|---|
| 路线规划 | `GET /api/travel/routes` | `origin`, `destination` (lon,lat) | 路由计算 |

### 1.6 HotelGeoService（`src/services/travelData/hotel/HotelGeoService.ts`）

| 调用点 | 接口 | 参数 | 触发时机 |
|---|---|---|---|
| 酒店高德坐标解析 | `POST /api/travel/hotels/geocode` | `HotelGeoRequest` | 用户查看酒店位置 |

---

## 二、Python FastAPI 与 Node FlyAI Function 的运行边界

### 2.1 FastAPI 覆盖范围（`api/index.py`）

Vercel 函数映射：`api/**/*.py` → `maxDuration: 300s`

| 路由 | 处理逻辑 |
|---|---|
| `GET /` `/api/index` `/api/health` | 健康检查，静态返回 |
| `GET /api/travel/config` | `provider_status()` — 只读能力声明，不触发第三方 |
| `GET /api/travel/places` | 调用高德文本搜索（`travel_providers.search_places`） |
| `GET /api/travel/routes` | 调用高德路线（`travel_providers.get_routes`），线程池并行 3 路 |
| `POST /api/travel/hotels/geocode` | 调用高德酒店地理编码（`hotel_geo.resolve_hotel_geography`） |
| `POST /api/travel/blind-box` | 调高德 POI + 规则引擎（`blind_box.generate_blind_box`） |
| `POST /` `/api/index` `/api/optimize-route` `/api/travel/optimize-route` | 纯 CPU OR-Tools，不触发任何第三方 |

FastAPI 内部使用 `from .blind_box`、`from .hotels`、`from .hotel_geo`、`from .travel_providers` 四个子模块，使用相对导入，在 Vercel 无包上下文中回退到绝对导入（`try/except ImportError` 分支，第 50–80 行）。

### 2.2 Node FlyAI Function 覆盖范围（`api/flyai_hotels.mjs`）

Vercel 函数映射：`api/flyai_hotels.mjs` → `maxDuration: 60s`

| 路由 | 处理逻辑 |
|---|---|
| `POST /api/travel/hotels/search` | 调用 FlyAI 官方 CLI（`@fly-ai/flyai-cli`）子进程，超时 40s |

前端统一通过 `POST /api/travel/hotels/search` 调用，由 `vercel.json` rewrites（第 18 行）指向 Node Function，而非 Python FastAPI。

### 2.3 前端统一 API 入口

所有前端调用经 `src/services/apiClient.ts` `apiRequest<T>(path)` 发起，经 `EXPO_PUBLIC_API_BASE_URL` 拼接域名。

不配置 `EXPO_PUBLIC_API_BASE_URL` 时，Web 端回退为空字符串（同域），原生 App 抛出 `API_BASE_URL_MISSING` 错误。

---

## 三、现有缓存机制及跨实例失效原因

### 3.1 `api/travel_providers._REQUEST_CACHE`（`travel_providers.py` 第 45–47 行）

```python
_REQUEST_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_REQUEST_CACHE_LOCK = RLock()
_REQUEST_CACHE_TTL_SECONDS = 5 * 60
```

- **缓存层**：进程内内存字典，key 为排序后的 query string，value 为 `(expires_at, payload)`。
- **失效方式**：`_REQUEST_CACHE` 随进程生命周期存在，**Vercel 冷启动（新容器）或容器回收后完全清空**。
- **影响范围**：`_amap_request`（第 104 行）内部使用，覆盖 `search_places`、`search_blind_box_places`、`get_routes` 三个高德调用路径。
- **清理策略**：满 500 条时优先清理已过期条目，否则清理前 100 条（第 131–135 行），防止内存无限增长，但**不解决跨实例问题**。

### 3.2 `src/utils/amapService.routeCache`（`amapService.ts` 第 19–20 行）

```typescript
const routeCache = new Map<string, { data: TravelRoutesResponse; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;
```

- **缓存层**：浏览器 / 客户端内存 `Map`，key 为 `lng,lat|lng,lat`（6 位小数），TTL 5 分钟。
- **失效方式**：页面刷新 / 用户关闭 App / App 退出后台再重启后清空。
- **影响范围**：`fetchAmapRoutesRaw`（第 45 行）和 `fetchAmapRouteSegment`（第 59 行），被 `universalRoute.ts` 和 `LiveItineraryScreen.tsx` 调用。
- **额外问题**：`routeCache` 与 `_REQUEST_CACHE` **分别缓存同一条高德路线响应**，造成两层客户端重复缓存，但都不跨实例。

### 3.3 无 FlyAI 侧缓存

`api/flyai_hotels.mjs`（`handler` 函数）每次请求都执行 `execFileAsync` 调用 FlyAI CLI，无任何中间缓存。Python `TravelHotelService.search` 中虽有 `post-filter`（`service.py` 第 27–31 行），但仅对引用价做客户端过滤，不缓存 FlyAI 结果。

---

## 四、重复请求路径

### 4.1 HomeScreen 景点重复请求

`HomeScreen.tsx` 第 128 行：

```typescript
searchTravelPlaces('attraction', '', 1, 8)
```

代码路径分析：`useEffect`（依赖 `[]`）执行一次，**但在 HomeScreen 的初始渲染中该调用在 `hasLoaded` 状态为 false 时不会二次触发**。然而 `searchTravelPlaces` 在页面卸载重挂、或 Expo 热更新刷新页面时仍会再次请求高德。因为 `_REQUEST_CACHE` 在同一个 Vercel 实例内存在，5 分钟内第二次请求会被进程内字典命中；**新实例上每次都会打高德**。

### 4.2 `search_blind_box_places` vs `search_places` 的重复高德调用

`travel_providers.py` 第 257 行（`search_places`）和第 301 行（`search_blind_box_places`）均通过 `_amap_request("/v5/place/text", ...)` 调用高德，但两者查询参数不同（`AMAP_PLACE_TYPES` vs `AMAP_BLIND_BOX_TYPES`），不属于完全重复，但若某 POI 同时命中两种 category 查询，数据被重复拉取。

### 4.3 路线分段重复请求

`LiveItineraryScreen.tsx` 逐段调用 `fetchAmapRouteSegment`，若相邻景点对在快速连续渲染中，会多次触发 `fetchAmapRoutesRaw`，若 `routeCache`（前端 Map）已命中则不会打后端，但 `_REQUEST_CACHE`（进程内）是否命中取决于实例生命周期。

### 4.4 酒店搜索

`HotelListScreen.tsx` 调用 `travelHotelService.search()` → `POST /api/travel/hotels/search`。每次不同参数组合（日期、星级、POI、最高价、关键词）均唯一命中 FlyAI CLI，**无任何缓存**。

---

## 五、预计最慢的三条调用链

### 5.1 酒店搜索（最慢，无缓存）

```
HotelListScreen.tsx
  → POST /api/travel/hotels/search  (Node Function, maxDuration 60s)
    → FlyAI CLI execFileAsync (timeout 40s)
      → FlyAI 上游响应
```

**预期耗时**：2~12s 正常，FlyAI 上游慢时 40s 超时抛出 `HotelProviderTimeoutError`。
**重复打点**：每次参数变化均完全重新调用 FlyAI CLI。

### 5.2 路线并行请求

```
universalRoute.ts / LiveItineraryScreen.tsx
  → GET /api/travel/routes  (FastAPI, 线程池3路并行)
    → _amap_request("/v5/direction/transit/integrated")
    → _amap_request("/v5/direction/driving")
    → _amap_request("/v5/direction/walking")
      → 高德上游
```

**预期耗时**：500ms~3s，取决于高德响应。
**重复打点**：前端 `routeCache`（Map，5 分钟）仅限单页/会话；Vercel `_REQUEST_CACHE`（5 分钟）仅在单个实例内；跨实例、跨页面完全重新请求。

### 5.3 盲盒生成

```
BlindBoxScreen.tsx / BlindBoxScreen.tsx
  → POST /api/travel/blind-box  (FastAPI, 300s 上限)
    → search_blind_box_places × N  (N 轮高德 POI 查询，若命中 _REQUEST_CACHE 5min 内可跳过)
    → 规则引擎 + LLM（可选）
```

**预期耗时**：2~8s（高德 POI 命中缓存时），无缓存时每轮 1~3s。
**重复打点**：高德 POI 查询有 `_REQUEST_CACHE`（进程内 5 分钟）保护；LLM 调用无缓存。

---

## 六、现有缓存失效原因（核心缺陷总结）

| 缓存位置 | 失效原因 | 影响 |
|---|---|---|
| `api/travel_providers._REQUEST_CACHE`（进程内字典） | Vercel 冷启动、容器回收、负载均衡切换实例 → 全新进程 | 高德 POI 和路线数据在新实例上100% miss |
| `src/utils/amapService.routeCache`（浏览器 Map） | 用户刷新页面 / 关闭 App 重开 / Web 标签页刷新 → 内存清空 | 路线缓存仅在同一会话内有效 |
| 酒店搜索（无缓存） | 每次请求都启动 FlyAI CLI 子进程 | 无缓存，每次耗时最长 |

**根本原因**：三层请求路径（React Native → Vercel → 高德/FlyAI）中有**两层独立且不相通的进程内缓存**（Python 侧 + 浏览器侧），任何一层失效都导致下一层再次向高德/FlyAI 发起请求，并且两个缓存层之间互不知晓、互不共享。

---

## 七、环境变量与凭证边界

| 变量 | 用途 | 是否进入前端 |
|---|---|---|
| `AMAP_WEB_SERVICE_KEY` | 高德 Web 服务 Key | ❌ 禁止；只读取自 `api/.env` |
| `FLYAI_API_KEY` | FlyAI CLI Key | ❌ 禁止；只读取自 `api/.env` |
| `CTRIP_*_TEMPLATE` | 携程落地页模板 | ❌ 只服务端拼接使用 |
| `MEITUAN_RESTAURANT_LINK_TEMPLATE` | 美团落地页模板 | ❌ 只服务端拼接使用 |
| `GLM_API_KEY`, `STEPFUN_API_KEY` | LLM/ASR | ❌ 只服务端 |
| `EXPO_PUBLIC_API_BASE_URL` | 前端 API 地址 | ✅ 可配置；无值时 Web 同域、App 报错 |
| `EXPO_PUBLIC_REALTIME_WS_URL` | 实时语音 WS 地址 | ✅ 可配置 |

`.env.example` 已为所有服务端 Key 列出注释和空值占位，`.gitignore` 应确保真实 `.env` 不提交（需确认）。

---

## 八、Phase 1 精确修改文件清单

> 以下为根据框架文档推导的 Phase 1 应新增/修改文件，本阶段（Phase 0）**不实际创建或修改任何文件**。

### 新增文件

| 文件 | 用途 |
|---|---|
| `api/db.py` | PostgreSQL 连接管理（Serverless 连接池适配） |
| `api/db/schema.sql` | SQL 迁移文件（5 张表） |
| `api/cache/repository.py` | 通用缓存 Repository（Fresh/Stale/Miss 判定） |
| `api/cache/hash.py` | 请求参数 → SHA-256 query_hash |
| `api/cache/models.py` | 缓存实体数据类（Fresh/Stale/Miss 枚举） |
| `tests/test_cache_hash.py` | query_hash 确定性测试 |
| `tests/test_cache_repository.py` | Fresh/Stale/Expired 边界测试 |
| `tests/test_cache_dedup.py` | 并发刷新去重测试 |

### 修改文件

| 文件 | 修改内容 |
|---|---|
| `.env.example` | 增加 `DATABASE_URL=` 和 `CACHE_REFRESH_SECRET=` 空值占位 |
| `.gitignore` | 确认 `.env` 已列入 |
| `requirements.txt` 或 `pyproject.toml` | 增加 `asyncpg` / `psycopg2-binary` 依赖 |

### 不修改文件（Phase 1 明确排除）

- `api/index.py` — 不改任何路由
- `api/travel_providers.py` — 不改高德调用
- `api/flyai_hotels.mjs` — 不改 FlyAI CLI 调用
- `api/hotels/service.py` — 不改服务层
- `src/**/*` — 不改前端任何文件

---

## 九、审计结论

| 检查项 | 状态 |
|---|---|
| FastAPI 所有路由已枚举 | ✅ |
| Node FlyAI Function 边界已确认 | ✅ |
| 所有真实请求入口已列出 | ✅ |
| 重复请求路径已识别 | ✅ |
| 跨实例缓存失效原因已定位 | ✅ |
| 最慢三条调用链已确认 | ✅ |
| 环境变量与凭证边界已确认 | ✅ |
| Phase 1 精确文件清单已推导 | ✅ |
| 本阶段**未修改任何代码** | ✅ |

**下一步建议**：等待用户确认后，执行 Phase 1（PostgreSQL 缓存基础层）。
