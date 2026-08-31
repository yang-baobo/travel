# 旅序 AI（TravelFlow）

> 真实数据驱动的个性化旅行规划助手。

[在线体验](https://shenzhen-travel.vercel.app) · [公开代码仓库](https://github.com/yang-baobo/travel)

## 项目简介

旅序 AI 通过文字、语音输入和实时语音对话理解用户的日期、预算、兴趣、饮食限制与行动能力，再结合真实景点、酒店、餐饮和交通数据，生成按天可执行的旅行路线。当前以北京作为首个落地城市。

规划流程：

    自然语言需求
    → 结构化 PlanningRequest 与硬性限制
    → 查询并筛选真实景点
    → 景点按日期、位置和开放时间分布
    → 根据景点分布选择酒店
    → 在每日路线中插入餐饮与休息
    → 查询全部相邻地点的真实交通
    → 校验时间、预算、步行量和行动能力
    → 生成完整日程

## 核心功能

- 文字、ASR 语音输入和 StepAudio 实时语音对话
- 高德真实 POI、坐标、餐饮与交通路线
- FlyAI 酒店、景点和旅行商品数据
- GLM 自然语言理解与结构化需求提取
- 面向老人及行动不便用户的步行、换乘和休息约束
- 景点、酒店、餐饮与交通统一规划
- 每日时间轴、路线调整和旅行盲盒
- PostgreSQL 分级缓存与北京数据预热

## 技术架构

| 层级 | 技术 |
|---|---|
| 多端前端 | React Native、Expo、React Native Web、TypeScript |
| 状态管理 | Zustand |
| 服务端 | FastAPI、Vercel Serverless Functions、Node.js handlers |
| AI | GLM、StepAudio 2.5 ASR、StepAudio 2.5 Realtime |
| 旅行数据 | 高德 Web 服务 API、飞猪 FlyAI |
| 路线优化 | 高德真实路线矩阵、Google OR-Tools |
| 数据缓存 | PostgreSQL、Fresh / Stale / Expired / Miss 分级策略 |
| 部署 | Vercel |

第三方 API Key 只保存在服务端环境变量中，不进入 React Native 客户端。

## 本地运行

### 环境要求

- Node.js 20 或更高版本
- npm
- Python 3.12
- 可选：PostgreSQL（未配置时缓存层会安全降级）

### 安装依赖

    npm install
    python3.12 -m venv .venv
    .venv/bin/python -m pip install -r requirements.txt

Windows 用户请将 .venv/bin/python 替换为 .venv\\Scripts\\python.exe。

### 配置环境变量

    cp .env.example .env

主要变量：

| 变量 | 用途 | 是否进入前端 |
|---|---|---|
| AMAP_WEB_SERVICE_KEY | 高德地点与交通路线 | 否 |
| FLYAI_API_KEY | FlyAI 酒店与景点 | 否 |
| GLM_API_BASE_URL / GLM_API_KEY / GLM_MODEL | GLM 模型 | 否 |
| STEPFUN_API_KEY / STEPFUN_API_BASE_URL | StepAudio | 否 |
| STEPFUN_ASR_MODEL / STEPFUN_REALTIME_MODEL | 语音模型 | 否 |
| DATABASE_URL | PostgreSQL 缓存 | 否 |
| EXPO_PUBLIC_API_BASE_URL | App 访问后端的地址；同域部署可留空 | 是 |
| EXPO_PUBLIC_REALTIME_WS_URL | 独立实时语音地址；同域部署可留空 | 是 |

请勿提交 .env、.env.local、密码或任何真实 API Key。

### 启动服务

终端一启动后端：

    npm run api:dev

终端二启动 Web 前端：

    npm run web -- --port 8082

访问 http://localhost:8082。

如需启用 PostgreSQL 缓存，配置 DATABASE_URL 后执行：

    psql "$DATABASE_URL" -f api/db/schema.sql

## 常用接口

    GET  /api/health
    GET  /api/travel/config
    GET  /api/travel/explore
    GET  /api/travel/places/detail
    GET  /api/travel/attractions/editorial
    GET  /api/travel/hotels/search
    GET  /api/travel/routes
    POST /api/travel/optimize-route
    POST /api/travel/blind-box
    POST /api/ai/chat
    POST /api/ai/plan-intent
    POST /api/ai/asr
    WS   /api/ai/realtime

## 测试与构建

    npx tsc --noEmit
    npm run test:planning
    npm run test:phase3:store
    npm run test:phase4:ui
    npm run test:phase5:route
    .venv/bin/python -m unittest discover -s tests -p "test_*.py" -v
    npm run build

## 生产部署

项目已适配 Vercel：

    npx vercel --prod

在 Vercel Project Settings → Environment Variables 中配置服务端变量。不要将 Key 写入 vercel.json 或任何 EXPO_PUBLIC_ 变量。

生产地址：[https://shenzhen-travel.vercel.app](https://shenzhen-travel.vercel.app)

## 目录结构

    api/       FastAPI、FlyAI handlers、缓存与数据库层
    src/       React Native 页面、组件、Store 与规划服务
    scripts/   本地启动、缓存刷新和数据预热脚本
    tests/     TypeScript、Node.js 与 Python 测试
    docs/      AI 与 API 接入文档

## 当前边界

- 当前重点支持北京，数据层可以继续扩展到其他城市。
- 酒店和景点价格是查询时的展示信息，不代表最终成交价。
- 预订通过官方商品页面跳转完成，平台当前不代收款或拆分支付。
