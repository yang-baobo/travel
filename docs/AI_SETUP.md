# AI 接入配置

当前助手由三条链路组成：

- 键盘文字：GLM 5.3 中转站
- 文字聊天中的语音输入：StepAudio 2.5 ASR
- 电话式语音：StepAudio 2.5 Realtime

所有密钥只能配置在后端环境变量中，不能添加 `EXPO_PUBLIC_` 前缀，也不要提交 `.env`。

## 1. 本地环境变量

项目已经创建了一个被 Git 忽略的 `.env`，直接填写：

```dotenv
GLM_API_BASE_URL=https://你的中转站地址/v1
GLM_API_KEY=
GLM_MODEL=glm-5.3

STEPFUN_API_KEY=
STEPFUN_API_BASE_URL=https://api.stepfun.com/v1
STEPFUN_ASR_MODEL=stepaudio-2.5-asr
STEPFUN_REALTIME_MODEL=stepaudio-2.5-realtime
STEPFUN_REALTIME_VOICE=linjiajiejie

EXPO_PUBLIC_API_BASE_URL=http://localhost:8000
EXPO_PUBLIC_REALTIME_WS_URL=ws://localhost:8000/api/ai/realtime
EXPO_PUBLIC_STEP_REALTIME_OUTPUT_SAMPLE_RATE=24000
```

如果中转站提供的是完整 `/chat/completions` 地址，填写 `GLM_CHAT_COMPLETIONS_URL`，它会覆盖 `GLM_API_BASE_URL` 的自动拼接。

## 2. 本地启动

后端：

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
npm run api:dev
```

Windows 用户把安装命令中的 `.venv/bin/python` 换成 `.venv\\Scripts\\python.exe`。

前端：

```bash
npm run web -- --port 8082
```

修改 `EXPO_PUBLIC_` 环境变量后需要重启前端开发服务，普通服务端 Key 只需要重启后端。

## 3. 正式部署

`/api/ai/chat` 和 `/api/ai/asr` 可以运行在普通 HTTP Serverless Functions 中。

`/api/ai/realtime` 是持久 WebSocket 代理。Vercel Functions 已在 2026 年 6 月开始原生支持 WebSocket（Public Beta）；本项目已经添加同域转发并把函数最长执行时间配置为 300 秒。正式环境同域部署时，`EXPO_PUBLIC_REALTIME_WS_URL` 可以留空，前端会自动使用当前域名的 `wss://.../api/ai/realtime`。

WebSocket 会在函数达到最大运行时间后关闭，客户端应允许用户重新拨打。若团队不使用 Vercel WebSocket 公测，也可以把代理部署到任意支持 ASGI WebSocket 的长期运行服务，再显式填写其 `wss://` 地址。

前端不会收到 GLM 或 StepFun API Key；Realtime 的系统提示、音色和模型也由代理端固定，客户端只能发送音频和中断事件。
