from __future__ import annotations

import base64
import json
import sys
import types
import unittest
from unittest.mock import patch

# The repository's lightweight test command installs Pydantic in /tmp but not
# the whole ASGI stack. api.ai only needs these two classes for annotations.
try:
    import fastapi  # noqa: F401
except ModuleNotFoundError:
    fastapi_stub = types.ModuleType("fastapi")
    fastapi_stub.WebSocket = type("WebSocket", (), {})
    fastapi_stub.WebSocketDisconnect = type("WebSocketDisconnect", (Exception,), {})
    sys.modules["fastapi"] = fastapi_stub

from api import ai


class AIServiceTest(unittest.TestCase):
    def test_glm_json_response_is_normalized(self) -> None:
        upstream = {
            "choices": [{
                "message": {
                    "content": "```json\n{\"reply\":\"可以，先确认预算。\",\"actions\":[],\"stage\":\"collecting\"}\n```"
                }
            }]
        }
        request = ai.AIChatRequest(messages=[ai.ChatMessage(role="user", content="帮我规划北京行程")])
        with (
            patch.object(ai, "GLM_API_KEY", "test-key"),
            patch.object(ai, "GLM_API_BASE_URL", "https://relay.example/v1"),
            patch.object(ai, "_post_json", return_value=json.dumps(upstream, ensure_ascii=False)),
        ):
            result = ai.chat_with_glm(request)
        self.assertEqual(result["reply"], "可以，先确认预算。")
        self.assertEqual(result["stage"], "collecting")
        self.assertEqual(result["model"], ai.GLM_MODEL)

    def test_asr_done_event_is_returned(self) -> None:
        stream = 'data: {"type":"transcript.text.delta","delta":"去故宫"}\n\n' \
                 'data: {"type":"transcript.text.done","text":"去故宫和天坛"}\n\n'
        request = ai.ASRRequest(audio_base64=base64.b64encode(b"RIFFtest").decode("ascii"))
        with (
            patch.object(ai, "STEPFUN_API_KEY", "test-key"),
            patch.object(ai, "_post_json", return_value=stream),
        ):
            result = ai.transcribe_with_stepfun(request)
        self.assertEqual(result["text"], "去故宫和天坛")
        self.assertEqual(result["model"], "stepaudio-2.5-asr")

    def test_invalid_audio_is_rejected_before_upstream_call(self) -> None:
        request = ai.ASRRequest(audio_base64="not-base64")
        with patch.object(ai, "STEPFUN_API_KEY", "test-key"):
            with self.assertRaises(ValueError):
                ai.transcribe_with_stepfun(request)

    def test_provider_status_never_contains_keys(self) -> None:
        with (
            patch.object(ai, "GLM_API_KEY", "secret-glm"),
            patch.object(ai, "GLM_API_BASE_URL", "https://relay.example/v1"),
            patch.object(ai, "STEPFUN_API_KEY", "secret-step"),
        ):
            serialized = json.dumps(ai.ai_provider_status())
        self.assertNotIn("secret-glm", serialized)
        self.assertNotIn("secret-step", serialized)


if __name__ == "__main__":
    unittest.main()
