# 北京真实数据接入

当前客户端不再直接请求任何第三方数据服务。所有请求进入本项目的 `/api/travel/*`，第三方凭证只配置在服务端。

## 需要申请的能力

1. 高德开放平台：创建应用并申请“Web 服务 API”Key。当前使用地点搜索 2.0，以及公交、驾车、步行路线规划 2.0。
2. 携程：申请分销联盟或商务合作。审核通过后，请向对接人索要酒店和景点门票的官方落地页/Deep Link 生成规则；若获批的是正式库存与下单 API，再按其签名规范增加服务端适配器。
3. 餐饮：第一阶段建议申请美团或大众点评官方合作落地页。未取得授权前，不抓取网页，不展示虚构价格。

## 服务端环境变量

复制 `.env.example` 并按部署平台的方式配置：

- `AMAP_WEB_SERVICE_KEY`：高德 Web 服务 Key。
- `CTRIP_HOTEL_LINK_TEMPLATE`：携程酒店官方链接模板。
- `CTRIP_TICKET_LINK_TEMPLATE`：携程门票官方链接模板。
- `MEITUAN_RESTAURANT_LINK_TEMPLATE`：美团/大众点评官方链接模板。

链接模板支持 `{name}`、`{city}`、`{adcode}`、`{poi_id}`。后端会校验域名；非携程、Trip.com、美团或大众点评的地址会被拒绝。

## 客户端环境变量

- Web 与 API 同域部署时，`EXPO_PUBLIC_API_BASE_URL` 留空。
- iOS/Android 调试或独立部署时，将它设为本平台后端的 HTTPS Origin，例如 `https://api.example.com`。

不要把任何高德、携程、餐饮或大模型密钥放在 `EXPO_PUBLIC_*` 中；这类变量会进入客户端安装包。

## 已提供的接口

- `GET /api/travel/config`：检查供应商是否已配置，不返回密钥。
- `GET /api/travel/places?category=attraction|hotel|restaurant&keyword=&page=1&pageSize=20`
- `GET /api/travel/routes?origin=116.397,39.908&destination=116.418,39.921`
- `POST /api/travel/optimize-route`：保留 OR-Tools 多日行程优化能力。

高德接口会在服务端缓存五分钟，减少重复请求和配额消耗。携程/餐饮模板未配置时，客户端只显示“接入中”的禁用按钮，不会把搜索 URL 当成可预订链接。

## 官方资料

- 高德地点搜索 2.0：https://lbs.amap.com/api/webservice/guide/api/newpoisearch
- 高德路径规划 2.0：https://lbs.amap.com/api/webservice/guide/api/newroute
- 携程分销合作：https://pages.c-ctrip.com/public/dlhz.htm
