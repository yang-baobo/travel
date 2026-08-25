from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


PROJECT_ROOT = Path(__file__).resolve().parents[1]
CLI_BUNDLE = PROJECT_ROOT / "node_modules/@fly-ai/flyai-cli/dist/flyai-bundle.cjs"
TRUSTED_IMAGE_HOSTS = ("alicdn.com", "tbcdn.cn", "alibabausercontent.com")
TRUSTED_BOOKING_HOSTS = ("feizhu.com", "fliggy.com", "alitrip.com")
CACHE_TTL_SECONDS = 6 * 60 * 60

_cache: tuple[float, dict[str, Any]] | None = None


class FliggyAttractionError(RuntimeError):
    def __init__(self, code: str, message: str, status_code: int) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code


def _clean_text(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _finite_number(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number and abs(number) != float("inf") else None


def _trusted_https_url(value: Any, trusted_hosts: tuple[str, ...]) -> str | None:
    url = _clean_text(value)
    if not url:
        return None
    try:
        parsed = urlparse(url)
    except ValueError:
        return None
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https":
        return None
    return url if any(host == suffix or host.endswith(f".{suffix}") for suffix in trusted_hosts) else None


def adapt_flyai_attraction(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    source_poi_id = _clean_text(raw.get("id"))
    name = _clean_text(raw.get("name"))
    image_url = _trusted_https_url(raw.get("mainPic"), TRUSTED_IMAGE_HOSTS)
    if not source_poi_id or not name or not image_url:
        return None
    ticket_raw = raw.get("ticketInfo")
    ticket = None
    if isinstance(ticket_raw, dict):
        ticket = {
            "itemId": _clean_text(ticket_raw.get("itemId")),
            "name": _clean_text(ticket_raw.get("ticketName")),
            "priceText": _clean_text(ticket_raw.get("price")),
        }
    return {
        "id": f"fliggy:{source_poi_id}",
        "source": "fliggy",
        "sourcePoiId": source_poi_id,
        "city": "北京",
        "name": name,
        "address": _clean_text(raw.get("address")),
        "latitude": _finite_number(raw.get("latitude")),
        "longitude": _finite_number(raw.get("longitude")),
        "category": _clean_text(raw.get("category")),
        "poiLevel": _clean_text(raw.get("poiLevel")),
        "description": _clean_text(raw.get("description")),
        "imageUrl": image_url,
        "jumpUrl": _trusted_https_url(raw.get("jumpUrl"), TRUSTED_BOOKING_HOSTS),
        "ticket": ticket,
    }


def get_fliggy_editorial_attractions() -> dict[str, Any]:
    global _cache
    now = time.time()
    if _cache and _cache[0] > now:
        return _cache[1]

    api_key = os.getenv("FLYAI_API_KEY", "").strip()
    node_path = shutil.which("node")
    if not api_key or not node_path or not CLI_BUNDLE.is_file():
        raise FliggyAttractionError(
            "ATTRACTION_PROVIDER_NOT_CONFIGURED",
            "FlyAI 服务端凭证或官方 CLI 未配置",
            503,
        )
    try:
        completed = subprocess.run(
            [
                node_path,
                str(CLI_BUNDLE),
                "search-poi",
                "--city-name",
                "北京",
                "--poi-level",
                "5",
            ],
            cwd=PROJECT_ROOT,
            env={**os.environ, "FLYAI_API_KEY": api_key},
            capture_output=True,
            text=True,
            timeout=40,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise FliggyAttractionError(
            "ATTRACTION_PROVIDER_TIMEOUT",
            "FlyAI 景点搜索超时",
            504,
        ) from exc
    except OSError as exc:
        raise FliggyAttractionError(
            "ATTRACTION_PROVIDER_UNAVAILABLE",
            "FlyAI 景点搜索暂时不可用",
            502,
        ) from exc

    if completed.returncode != 0:
        if any(marker in completed.stderr for marker in ("Invalid API key", "HTTP 401", "HTTP 403")):
            raise FliggyAttractionError(
                "ATTRACTION_PROVIDER_AUTHENTICATION",
                "FlyAI 凭证无效或没有景点搜索权限",
                502,
            )
        raise FliggyAttractionError(
            "ATTRACTION_PROVIDER_UNAVAILABLE",
            "FlyAI 景点搜索暂时不可用",
            502,
        )
    try:
        payload = json.loads(completed.stdout.strip())
        raw_items = payload["data"]["itemList"]
    except (json.JSONDecodeError, KeyError, TypeError) as exc:
        raise FliggyAttractionError(
            "ATTRACTION_PROVIDER_MALFORMED_RESPONSE",
            "FlyAI 返回了无法识别的数据格式",
            502,
        ) from exc
    if payload.get("status") != 0 or not isinstance(raw_items, list):
        raise FliggyAttractionError(
            "ATTRACTION_PROVIDER_UNAVAILABLE",
            "FlyAI 景点搜索返回失败状态",
            502,
        )

    attractions = [item for raw in raw_items if (item := adapt_flyai_attraction(raw)) is not None]
    result = {
        "attractions": attractions,
        "meta": {
            "source": "fliggy",
            "city": "北京",
            "count": len(attractions),
            "imageMeaning": "FlyAI 景点 mainPic；与同条景点名称绑定",
        },
    }
    _cache = (now + CACHE_TTL_SECONDS, result)
    return result
