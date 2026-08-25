# Phase 1 完成报告（二次修正版）：PostgreSQL 缓存基础层

> 本阶段严格遵循 DATA_CACHE_EXECUTION_FRAMEWORK.md 第 204–238 行。
> 基线：DATA_CACHE_AUDIT.md（Phase 0 审计）
> **二次修正范围**：消除导入冲突、JSONB 编解码、CacheMiss 细分、partial index、RETURNING id、保守连接池、Node Repository、跨语言 hash 测试、Report 矛盾修正；修复 `_is_db_ready` 与 `_db_reachable` 边界、`ensure_refresh_job` 含 `running`、`upsert_cache` SQL 失败返回 `false`、mock SQL 分支测试、pool 无 5 分钟强制替换。

---

## 1. 本阶段结论

**PARTIAL** — 所有代码和测试已完成并全部通过，但**真实 PostgreSQL 连接与迁移未在真实数据库验证**（当前环境 `DATABASE_URL` 为空）。

---

## 2. 修改文件清单

### 新增文件

| 文件 | 用途 |
|---|---|
| `api/db/connection.py` | PostgreSQL 连接管理（min_size=0/max_size=2，`init` 回调注册 json/jsonb codec，10s 超时，只在 `close_pool()` 时替换） |
| `api/db/__init__.py` | 从 `connection.py` 重新导出 `get_connection`, `is_configured`, `close_pool` |
| `api/db/schema.sql` | 6 张表 + partial unique index（`refresh_jobs` `idx_refresh_jobs_dedupe_pending`，仅约束 pending/running），可重复执行 |
| `api/db/node_hash.mjs` | Node.js SHA-256 hash，与 Python 完全一致 |
| `api/db/node_repository.mjs` | Node.js PostgreSQL Repository（`readCache`, `upsertCache`, `ensureRefreshJob`；`pool.end()`，`statementTimeoutMillis`，json codec） |
| `api/cache/__init__.py` | `api/cache` 包标记 |
| `api/cache/models.py` | `CacheTier` 枚举、`CacheEntry`、`classify_tier()` |
| `api/cache/hash.py` | Python `stable_dumps` + `query_hash`（SHA-256），4 个便捷函数 |
| `api/cache/repository.py` | `CacheMissReason`（`NOT_FOUND`/`DATABASE_UNAVAILABLE`）、`read_cache`（含 payload_json）、`upsert_cache`（失败返 false）、`_db_reachable` 区分层、`ensure_refresh_job`（RETURNING id，含 running）、`mark_refresh_job_done`（安全错误码） |
| `tests/test_phase1_cache.py` | 39 个测试（hash/tier/FakeRepository/mock SQL/真实 DB 分支） |
| `tests/test_node_hash.mjs` | 8 个 Node.js 测试（含 Python 跨语言一致性比对） |

### 修改文件

| 文件 | 修改内容 |
|---|---|
| `.env.example` | 增加 `DATABASE_URL=` 和 `CACHE_REFRESH_SECRET=` |
| `pyproject.toml` | `[project.dependencies]` 增加 `"asyncpg>=0.31"`；新增 `[project.optional-dependencies]` 含 `pytest>=8.0`、`pytest-asyncio>=0.24` |
| `package.json` | `dependencies` 增加 `"pg": "^8.11.0"` |

### 删除文件

| 文件 | 原因 |
|---|---|
| `api/db.py` | 与 `api/db/__init__.py` 同包名冲突，内容迁移至 `api/db/connection.py` |

### 未修改文件

- `api/index.py`, `api/travel_providers.py`, `api/flyai_hotels.mjs`, `api/hotels/`, `src/**/*` — 全部未改

---

## 3. 数据库迁移和环境变量

### 迁移文件

- **路径**：`api/db/schema.sql`
- **执行方式**：`psql $DATABASE_URL -f api/db/schema.sql`
- **可重复执行**：全部使用 `CREATE TABLE IF NOT EXISTS`，`INSERT ... ON CONFLICT DO NOTHING`
- **partial unique index**：`idx_refresh_jobs_dedupe_pending WHERE status IN ('pending', 'running')`
- **回滚**：`DROP TABLE IF EXISTS refresh_jobs, route_cache, hotel_search_cache, hotel_properties, travel_places, cache_entries, _schema_version CASCADE;`

### 新增环境变量

| 变量名 | 必填 | 用途 |
|---|---|---|
| `DATABASE_URL` | 是 | PostgreSQL 连接串（服务端，禁止提交真实值） |
| `CACHE_REFRESH_SECRET` | 是 | 内部刷新接口凭证（Phase 5 启用） |

### 新增依赖

| 包 | 版本 | 位置 | 用途 |
|---|---|---|---|
| `asyncpg` | >= 0.31 | `pyproject.toml` | Python PostgreSQL 驱动 |
| `pytest` | >= 8.0 | `pyproject.toml` [test] | Python 测试框架 |
| `pytest-asyncio` | >= 0.24 | `pyproject.toml` [test] | async 测试支持 |
| `pg` | ^8.11.0 | `package.json` | Node.js PostgreSQL 驱动 |

---

## 4. 实际缓存键与 TTL

### query_hash 构成

统一 SHA-256 实现，Python/Node 完全一致：

```
SHA-256(source | category | stable_json_params)
```

### 便捷函数

| 函数 | 用途 |
|---|---|
| `place_query_hash(category, keyword, page, pageSize)` | 景点/餐饮搜索 |
| `route_query_hash(origin, destination, mode)` | 路线 |
| `hotel_search_query_hash(params)` | FlyAI 酒店搜索 |
| `refresh_job_dedupe_key(job_type, source, category, params)` | 刷新去重键 |

### TTL 配置（Phase 2 起注入）

| 数据 | Fresh TTL | Stale 窗口 | 超期处理 |
|---|---|---|---|
| 景点基础资料 | 7 天 | +30 天 | stale 展示并刷新 |
| 餐厅基础资料 | 24 小时 | +7 天 | stale 展示并刷新 |
| 酒店基础资料 | 7 天 | +30 天 | stale 展示并刷新 |
| 酒店搜索快照 | 10 分钟 | +30 分钟 | 超期隐藏价格 |
| 路线（驾车/公交） | 30 分钟 | +2 小时 | 超期重新请求 |

---

## 5. 测试命令和结果

### 4 条最低验收命令（逐条原始 PASS/FAIL）

```
=== 1. node -e "import('./api/db/node_repository.mjs')" ===
PASS

=== 2. .venv/bin/python -c "import api.db; import api.cache.repository" ===
PASS

=== 3. node tests/test_node_hash.mjs ===
✅ All Node.js hash tests passed

=== 4. .venv/bin/python -m pytest tests/test_phase1_cache.py -k "not real_db" ===
39 passed, 6 deselected in 0.07s
```

### 测试明细

| 类别 | 通过 | 失败 | 说明 |
|---|---|---|---|
| `TestStableDumps` | 5 | 0 | deterministic 序列化 |
| `TestQueryHash` | 9 | 0 | hash 确定性/方向性/category/source 区分 |
| `TestClassifyTier` | 6 | 0 | FRESH/STALE/EXPIRED/MISS 边界 |
| `TestFakeRepository` | 10 | 0 | Miss→Upsert→Fresh→Stale→Expired→去重→完成 |
| `TestRepositoryMockSql`（新增） | 9 | 0 | DB 不可用返回 DATABASE_UNAVAILABLE / NOT_FOUND 区分 / 成功返回 CacheEntry / upsert 失败返回 false / ensure_refresh_job 异常返回 unavailable / hotel_search 调用 hotel_search_cache / error_message 不泄漏 |
| **Python 合计** | **39** | **0** | **6 个真实 DB 测试跳过（DATABASE_URL 为空）** |

### Node.js hash 测试

```
✅ All Node.js hash tests passed
- stableDumps deterministic / key-order invariant / null stripping: OK
- queryHash matches Python (4 cases): OK
- refreshJobDedupeKey matches Python: OK
```

### 现有测试回归

```
.venv/bin/python -m unittest tests.test_travel_providers tests.test_blind_box tests.test_hotel_geo
Ran 22 tests in 0.004s — OK
```

---

## 6. 性能对比

本阶段仅建立基础设施层，尚未接管任何正式接口，无性能对比数据。

---

## 7. 安全检查

| 检查项 | 状态 |
|---|---|
| 数据库连接串未写入任何源码 | ✅ |
| 数据库连接串未提交 Git | ✅ |
| `.env.example` 无真实值 | ✅ |
| 高德 Key / FlyAI Key 未进入前端 | ✅ |
| `api/db.py` 已删除，无同包名冲突 | ✅ |
| `connection.py` 不打印连接串 | ✅ |
| `connection.py` min_size=0/max_size=2，只在 `close_pool()` 时替换 Pool | ✅ |
| Node Pool 使用 `pool.end()`，不读 `_closed` | ✅ |
| json/jsonb codec 通过 `init` 回调注册 | ✅ |
| `mark_refresh_job_done` 不保存 `error_message`，`error_code` 过滤敏感词 | ✅ |
| `_db_reachable` 独立于 `_is_db_ready`，区分 DATABASE_UNAVAILABLE / NOT_FOUND | ✅ |
| `upsert_cache` SQL 失败返回 `false` | ✅ |
| `ensure_refresh_job` 查询含 `pending` + `running` | ✅ |
| `refresh_jobs` partial unique index 不阻止 done/failed 历史 | ✅ |
| Python/Node hash 完全一致（Node 测试通过 Python 子进程实时比对） | ✅ |
| `pyproject.toml` asyncpg/pytest/pytest-asyncio 已声明 | ✅ |
| `package.json` pg 已声明 | ✅ |
| `.gitignore` 含 `.env` | ✅ |
| 未修改任何业务代码（`api/index.py`、`api/travel_providers.py`、`api/hotels/`、`src/**`） | ✅ |

---

## 8. 已知问题

### 8.1 真实 PostgreSQL 未连接（阻塞 Phase 2+）

- 环境变量 `DATABASE_URL` 为空。
- 真实数据库迁移、JSONB/TIMESTAMPTZ 编解码在真实数据库上未验证。
- 需用户提供 `DATABASE_URL`，执行 `psql $DATABASE_URL -f api/db/schema.sql`。

### 8.2 Node.js `pg` 模块需 Vercel 环境提供

- `node_modules` 中无 `pg`，本地 Node.js DB 连接测试未执行。
- Vercel 部署时由 `package.json` 安装。

---

## 9. 阻塞项

- **`DATABASE_URL` 未配置**：无法执行 `psql $DATABASE_URL -f api/db/schema.sql`，6 个真实 DB 测试全部跳过。
