from __future__ import annotations

import asyncio
import base64
import binascii
import json
import os
import re
import ssl
from typing import Any, Literal
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import certifi
from fastapi import WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    # Production platforms inject environment variables directly. dotenv is
    # only required for the local `npm run api:dev` workflow.
    pass


GLM_API_BASE_URL = os.getenv("GLM_API_BASE_URL", "").strip().rstrip("/")
GLM_CHAT_COMPLETIONS_URL = os.getenv("GLM_CHAT_COMPLETIONS_URL", "").strip()
GLM_API_KEY = os.getenv("GLM_API_KEY", "").strip()
GLM_MODEL = os.getenv("GLM_MODEL", "glm-5.3").strip()

STEPFUN_API_BASE_URL = os.getenv("STEPFUN_API_BASE_URL", "https://api.stepfun.com/v1").strip().rstrip("/")
STEPFUN_API_KEY = os.getenv("STEPFUN_API_KEY", "").strip()
STEPFUN_ASR_MODEL = os.getenv("STEPFUN_ASR_MODEL", "stepaudio-2.5-asr").strip()
STEPFUN_REALTIME_MODEL = os.getenv("STEPFUN_REALTIME_MODEL", "stepaudio-2.5-realtime").strip()
STEPFUN_REALTIME_VOICE = os.getenv("STEPFUN_REALTIME_VOICE", "linjiajiejie").strip()

MAX_AUDIO_BYTES = 12 * 1024 * 1024
MAX_REALTIME_CHUNK_CHARS = 512 * 1024
SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())


class AIConfigurationError(RuntimeError):
    pass


class AIUpstreamError(RuntimeError):
    pass


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=8_000)


class AIChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=30)
    context: dict[str, Any] = Field(default_factory=dict)
    phase: str | None = Field(default=None, max_length=40)


class PlanningIntentRequest(BaseModel):
    request: dict[str, Any]
    messages: list[ChatMessage] = Field(default_factory=list, max_length=30)


class PlanIntentNormalizedRequest(BaseModel):
    model_config = {"extra": "forbid"}
    userInput: str = Field(min_length=1, max_length=8_000)
    city: Literal["北京"]
    days: int = Field(ge=1, le=15)
    people: int = Field(ge=1, le=20)
    totalBudget: float | None = Field(default=None, gt=0)
    pace: Literal["relaxed", "standard", "packed"]
    mode: Literal["self", "complete", "auto"]


class PlanIntentPatch(BaseModel):
    model_config = {"extra": "forbid"}
    days: int | None = Field(default=None, ge=1, le=15)
    people: int | None = Field(default=None, ge=1, le=20)
    totalBudget: float | None = Field(default=None, gt=0)
    pace: Literal["relaxed", "standard", "packed"] | None = None
    mode: Literal["self", "complete", "auto"] | None = None


class PlanIntentResponse(BaseModel):
    model_config = {"extra": "forbid"}
    needsClarification: bool
    clarificationQuestions: list[str] = Field(default_factory=list, max_length=3)
    normalizedRequest: PlanIntentNormalizedRequest
    requestPatch: PlanIntentPatch = Field(default_factory=PlanIntentPatch)
    explanation: str = Field(min_length=1, max_length=2_000)
    provider: Literal["remote_glm"] = "remote_glm"
    model: str


class AudioFormat(BaseModel):
    type: Literal["wav", "m4a", "mp3", "ogg", "pcm"] = "wav"
    codec: str | None = Field(default=None, max_length=40)
    rate: int | None = Field(default=None, ge=8_000, le=48_000)
    bits: int | None = Field(default=None, ge=8, le=32)
    channel: int | None = Field(default=None, ge=1, le=2)


class ASRRequest(BaseModel):
    audio_base64: str = Field(min_length=4, max_length=18_000_000)
    format: AudioFormat = Field(default_factory=AudioFormat)
    language: str = Field(default="zh", max_length=12)
    hotwords: list[str] = Field(default_factory=list, max_length=50)


SYSTEM_PROMPT = """你是“北京旅行”的 AI 行程助手。你负责通过简洁、自然的中文帮助用户确定北京旅行路线，并尊重平台已有的偏好、安全限制、预算和当前行程。

重要规则：
1. 不编造实时价格、余票、营业时间或路线耗时；没有数据时明确说明需要查询。
2. 过敏、饮食禁忌、行动限制、“绝对不要”和夜间限制都是硬性条件，不能为了推荐而放宽。
3. 一次只追问最关键的一项缺失信息，避免重复询问 context 中已有的信息。
4. 仅在用户明确表达对应意图时返回动作。
5. 必须返回一个 JSON 对象，不要使用 Markdown 代码块。

返回结构：
{"reply":"给用户的回复","actions":[{"type":"动作名称","value":任意JSON值}],"stage":"collecting|generating|speaking|adjusting|done"}

允许的动作名称：set_travel_days、set_group_size、set_budget_pref、set_travel_pace、set_elderly_mode、set_hotel_level、set_hotel_zone、set_transport_pref、set_cuisine_prefs、set_departure_city、select_attractions、generate_route、navigate_to_route_plan、navigate_to_home、navigate_to_orders、navigate_to_profile、open_restaurant_picker、open_hotel_picker、open_attraction_picker、confirm_route。"""


REALTIME_PROMPT = """你是“北京旅行”的电话式语音助手。用自然、温暖、简短的中文交流，像真人旅行顾问一样每次只说一到三句话。帮助用户澄清路线、景点、酒店和餐饮需求。不得编造价格、余票、营业时间或路线耗时；涉及过敏、危险项目、行动能力、预算与夜间限制时必须保守处理并明确提醒。你可以提出建议，但在实时数据未查询前必须说明建议仍需平台确认。"""


PLAN_INTENT_PROMPT = """你是“北京旅行”的规划意图规范化器，只负责理解用户输入，不负责生成行程事实。

必须返回一个 JSON 对象，禁止 Markdown。字段必须严格为：
{"needsClarification":false,"clarificationQuestions":[],"normalizedRequest":{"userInput":"","city":"北京","days":4,"people":2,"totalBudget":5000,"pace":"relaxed|standard|packed","mode":"self|complete|auto"},"requestPatch":{},"explanation":""}

规则：
1. 只可规范化或修正 days、people、totalBudget、pace、mode；没有明确依据时沿用结构化请求。
2. 不得输出、创造或修改任何地点 ID、坐标、酒店价格、营业时间、门票、余票或交通耗时。
3. 城市固定为北京。候选地点只用于理解用户已选内容，不能改写其 sourceId 或坐标。
4. 最多追问三个会阻止规划的关键问题。已有结构化参数不得重复追问。
5. 过敏、行动能力、夜间与危险项目限制不允许放宽。
6. requestPatch 只写确实需要修改且有用户原话依据的字段；否则返回空对象。"""


def ai_provider_status() -> dict[str, Any]:
    return {
        "glm": {
            "configured": bool(GLM_API_KEY and (GLM_API_BASE_URL or GLM_CHAT_COMPLETIONS_URL)),
            "model": GLM_MODEL,
        },
        "stepfun_asr": {
            "configured": bool(STEPFUN_API_KEY),
            "model": STEPFUN_ASR_MODEL,
        },
        "stepfun_realtime": {
            "configured": bool(STEPFUN_API_KEY),
            "model": STEPFUN_REALTIME_MODEL,
            "voice": STEPFUN_REALTIME_VOICE,
        },
    }


def _read_http_error(exc: HTTPError) -> str:
    try:
        raw = exc.read().decode("utf-8", errors="replace")
        payload = json.loads(raw)
        return str(payload.get("error", {}).get("message") or payload.get("message") or raw[:400])
    except Exception:
        return f"上游服务返回 HTTP {exc.code}"


def _post_json(url: str, api_key: str, payload: dict[str, Any], accept: str = "application/json", timeout: int = 45) -> str:
    request = Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": accept,
        },
    )
    try:
        with urlopen(request, timeout=timeout, context=SSL_CONTEXT) as response:
            return response.read().decode("utf-8", errors="replace")
    except HTTPError as exc:
        raise AIUpstreamError(_read_http_error(exc)) from exc
    except (URLError, TimeoutError) as exc:
        raise AIUpstreamError("暂时无法连接 AI 服务") from exc


def _chat_url() -> str:
    if GLM_CHAT_COMPLETIONS_URL:
        return GLM_CHAT_COMPLETIONS_URL
    if not GLM_API_BASE_URL:
        raise AIConfigurationError("尚未配置 GLM_API_BASE_URL")
    if GLM_API_BASE_URL.endswith("/chat/completions"):
        return GLM_API_BASE_URL
    return f"{GLM_API_BASE_URL}/chat/completions"


def _extract_text_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            str(item.get("text", ""))
            for item in content
            if isinstance(item, dict) and item.get("type") in {"text", "output_text"}
        )
    return str(content or "")


def _parse_assistant_json(raw_content: str) -> dict[str, Any]:
    cleaned = raw_content.strip()
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.IGNORECASE)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        return {"reply": raw_content.strip(), "actions": [], "stage": "collecting"}

    if not isinstance(parsed, dict):
        return {"reply": raw_content.strip(), "actions": [], "stage": "collecting"}
    reply = str(parsed.get("reply") or "我已经记下了。")
    actions = parsed.get("actions") if isinstance(parsed.get("actions"), list) else []
    safe_actions = [action for action in actions if isinstance(action, dict) and isinstance(action.get("type"), str)][:12]
    stage = parsed.get("stage")
    if stage not in {"collecting", "generating", "speaking", "adjusting", "done"}:
        stage = "collecting"
    return {"reply": reply, "actions": safe_actions, "stage": stage}


def chat_with_glm(payload: AIChatRequest) -> dict[str, Any]:
    if not GLM_API_KEY:
        raise AIConfigurationError("尚未配置 GLM_API_KEY")
    context_json = json.dumps(payload.context, ensure_ascii=False, separators=(",", ":"))[:14_000]
    messages: list[dict[str, str]] = [
        {"role": "system", "content": f"{SYSTEM_PROMPT}\n\n平台当前上下文：{context_json}\n当前阶段：{payload.phase or 'collecting'}"},
        *[{"role": item.role, "content": item.content} for item in payload.messages],
    ]
    raw = _post_json(
        _chat_url(),
        GLM_API_KEY,
        {
            "model": GLM_MODEL,
            "messages": messages,
            "temperature": 0.35,
            "stream": False,
        },
    )
    try:
        response = json.loads(raw)
        content = _extract_text_content(response["choices"][0]["message"]["content"])
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
        raise AIUpstreamError("GLM 中转站返回了无法识别的数据") from exc
    result = _parse_assistant_json(content)
    result["provider"] = "glm-relay"
    result["model"] = GLM_MODEL
    return result


def planning_intent_with_glm(payload: PlanningIntentRequest) -> dict[str, Any]:
    if not GLM_API_KEY:
        raise AIConfigurationError("尚未配置 GLM_API_KEY")
    request_json = json.dumps(payload.request, ensure_ascii=False, separators=(",", ":"))[:18_000]
    history = [{"role": item.role, "content": item.content} for item in payload.messages[-20:]]
    messages: list[dict[str, str]] = [
        {"role": "system", "content": PLAN_INTENT_PROMPT},
        *history,
        {"role": "user", "content": f"请规范化以下结构化规划请求：{request_json}"},
    ]
    raw = _post_json(
        _chat_url(),
        GLM_API_KEY,
        {
            "model": GLM_MODEL,
            "messages": messages,
            "temperature": 0.1,
            "thinking": {"type": "disabled"},
            "response_format": {"type": "json_object"},
            "max_tokens": 800,
            "stream": False,
        },
    )
    try:
        response = json.loads(raw)
        content = _extract_text_content(response["choices"][0]["message"]["content"])
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", content.strip(), flags=re.IGNORECASE)
        parsed = json.loads(cleaned)
        if not isinstance(parsed, dict):
            raise TypeError("PlanIntent is not an object")
        parsed["provider"] = "remote_glm"
        parsed["model"] = GLM_MODEL
        validated = PlanIntentResponse.model_validate(parsed)
    except (KeyError, IndexError, TypeError, json.JSONDecodeError, ValueError) as exc:
        raise AIUpstreamError("GLM 返回的 PlanIntent 未通过 Schema 校验") from exc
    return validated.model_dump(exclude_none=True)


def transcribe_with_stepfun(payload: ASRRequest) -> dict[str, Any]:
    if not STEPFUN_API_KEY:
        raise AIConfigurationError("尚未配置 STEPFUN_API_KEY")
    try:
        audio_bytes = base64.b64decode(payload.audio_base64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("audio_base64 不是有效的 Base64 音频") from exc
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise ValueError("单次语音输入不能超过 12 MB")

    audio_format = payload.format.model_dump(exclude_none=True)
    if audio_format["type"] == "pcm":
        audio_format.setdefault("codec", "pcm_s16le")
        audio_format.setdefault("rate", 16_000)
        audio_format.setdefault("bits", 16)
        audio_format.setdefault("channel", 1)

    raw = _post_json(
        f"{STEPFUN_API_BASE_URL}/audio/asr/sse",
        STEPFUN_API_KEY,
        {
            "audio": {
                "data": payload.audio_base64,
                "input": {
                    "transcription": {
                        "model": STEPFUN_ASR_MODEL,
                        "language": payload.language,
                        "hotwords": payload.hotwords[:50],
                        "enable_itn": True,
                    },
                    "format": audio_format,
                },
            }
        },
        accept="text/event-stream",
        timeout=75,
    )

    transcript = ""
    deltas: list[str] = []
    for line in raw.splitlines():
        if not line.startswith("data:"):
            continue
        data = line[5:].strip()
        if not data or data == "[DONE]":
            continue
        try:
            event = json.loads(data)
        except json.JSONDecodeError:
            continue
        if event.get("type") == "transcript.text.done":
            transcript = str(event.get("text") or "")
        elif event.get("type") == "transcript.text.delta":
            deltas.append(str(event.get("delta") or ""))
        elif event.get("type") == "error":
            raise AIUpstreamError(str(event.get("message") or "语音识别失败"))
    transcript = (transcript or "".join(deltas)).strip()
    if not transcript:
        raise AIUpstreamError("没有识别到清晰的语音，请再试一次")
    return {"text": transcript, "provider": "stepfun", "model": STEPFUN_ASR_MODEL}


def _safe_realtime_context(value: Any) -> str:
    try:
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))[:10_000]
    except (TypeError, ValueError):
        return "{}"


async def proxy_stepfun_realtime(websocket: WebSocket) -> None:
    await websocket.accept()
    if not STEPFUN_API_KEY:
        await websocket.send_json({"type": "proxy.error", "message": "尚未配置 STEPFUN_API_KEY"})
        await websocket.close(code=1011)
        return

    try:
        initial = await asyncio.wait_for(websocket.receive_text(), timeout=8)
        initial_event = json.loads(initial)
        if initial_event.get("type") != "client.configure":
            raise ValueError("首条消息必须是 client.configure")
    except (asyncio.TimeoutError, json.JSONDecodeError, ValueError, WebSocketDisconnect) as exc:
        await websocket.send_json({"type": "proxy.error", "message": str(exc) or "实时会话初始化失败"})
        await websocket.close(code=1008)
        return

    context = _safe_realtime_context(initial_event.get("context", {}))
    upstream_url = f"{STEPFUN_API_BASE_URL.replace('https://', 'wss://').replace('http://', 'ws://')}/realtime?model={STEPFUN_REALTIME_MODEL}"

    try:
        import websockets

        async with websockets.connect(
            upstream_url,
            additional_headers={"Authorization": f"Bearer {STEPFUN_API_KEY}"},
            ssl=SSL_CONTEXT if upstream_url.startswith("wss://") else None,
            max_size=8 * 1024 * 1024,
            ping_interval=20,
            ping_timeout=20,
        ) as upstream:
            await upstream.send(json.dumps({
                "event_id": "server_session_config",
                "type": "session.update",
                "session": {
                    "modalities": ["text", "audio"],
                    "instructions": f"{REALTIME_PROMPT}\n\n平台当前上下文：{context}",
                    "voice": STEPFUN_REALTIME_VOICE,
                    "input_audio_format": "pcm16",
                    "output_audio_format": "pcm16",
                    "turn_detection": {
                        "type": "server_vad",
                        "prefix_padding_ms": 400,
                        "silence_duration_ms": 650,
                    },
                },
            }, ensure_ascii=False))
            await websocket.send_json({"type": "proxy.ready", "model": STEPFUN_REALTIME_MODEL})

            allowed_types = {
                "input_audio_buffer.append",
                "input_audio_buffer.commit",
                "input_audio_buffer.clear",
                "response.cancel",
            }

            async def client_to_upstream() -> None:
                while True:
                    raw_message = await websocket.receive_text()
                    event = json.loads(raw_message)
                    event_type = event.get("type")
                    if event_type not in allowed_types:
                        continue
                    if event_type == "input_audio_buffer.append":
                        audio = event.get("audio")
                        if not isinstance(audio, str) or len(audio) > MAX_REALTIME_CHUNK_CHARS:
                            continue
                    event.setdefault("event_id", f"client_{id(event)}")
                    await upstream.send(json.dumps(event, ensure_ascii=False))

            async def upstream_to_client() -> None:
                async for raw_message in upstream:
                    if isinstance(raw_message, bytes):
                        raw_message = raw_message.decode("utf-8", errors="replace")
                    await websocket.send_text(raw_message)

            tasks = [asyncio.create_task(client_to_upstream()), asyncio.create_task(upstream_to_client())]
            done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in pending:
                task.cancel()
            for task in done:
                task.result()
    except WebSocketDisconnect:
        return
    except Exception as exc:
        try:
            await websocket.send_json({"type": "proxy.error", "message": f"实时语音连接失败：{exc}"})
            await websocket.close(code=1011)
        except Exception:
            pass
