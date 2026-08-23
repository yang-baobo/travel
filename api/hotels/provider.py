from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Any, Protocol

from dotenv import load_dotenv

from .errors import (
    HotelAuthenticationError,
    HotelConfigurationError,
    HotelInvalidRequestError,
    HotelMalformedResponseError,
    HotelProviderTimeoutError,
    HotelProviderUnavailableError,
)
from .models import HotelSearchParams


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CLI_PATH = PROJECT_ROOT / "node_modules" / ".bin" / "flyai"


class HotelProvider(Protocol):
    def search_hotels(self, params: HotelSearchParams) -> list[dict[str, Any]]: ...


class FliggyCliProvider:
    """Official FlyAI CLI provider. Credentials and raw responses remain server-side."""

    def __init__(self, *, timeout_seconds: float = 40.0, cli_path: Path | None = None) -> None:
        self.timeout_seconds = timeout_seconds
        self.cli_path = cli_path or Path(os.getenv("FLYAI_CLI_PATH", str(DEFAULT_CLI_PATH)))

    def _build_args(self, params: HotelSearchParams) -> list[str]:
        args = [
            str(self.cli_path),
            "search-hotel",
            "--dest-name",
            params.destination,
            "--check-in-date",
            params.check_in_date.isoformat(),
            "--check-out-date",
            params.check_out_date.isoformat(),
        ]
        if params.max_reference_price is not None:
            args.extend(["--max-price", f"{params.max_reference_price:g}"])
        if params.stars:
            args.extend(["--hotel-stars", ",".join(str(star) for star in params.stars)])
        if params.keyword:
            args.extend(["--key-words", params.keyword])
        if params.poi_name:
            args.extend(["--poi-name", params.poi_name])
        sort_map = {
            "none": "no_rank",
            "price_asc": "price_asc",
            "price_desc": "price_desc",
            "distance_candidate": "distance_asc",
        }
        args.extend(["--sort", sort_map[params.sort_by]])
        return args

    def search_hotels(self, params: HotelSearchParams) -> list[dict[str, Any]]:
        load_dotenv(PROJECT_ROOT / ".env", override=False)
        api_key = os.getenv("FLYAI_API_KEY", "").strip()
        if not api_key:
            raise HotelConfigurationError("FlyAI 服务端凭证未配置")
        if not self.cli_path.is_file():
            raise HotelConfigurationError("FlyAI 官方 CLI 未安装在服务端运行环境")

        env = os.environ.copy()
        env["FLYAI_API_KEY"] = api_key
        try:
            completed = subprocess.run(
                self._build_args(params),
                cwd=PROJECT_ROOT,
                env=env,
                capture_output=True,
                text=True,
                timeout=self.timeout_seconds,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise HotelProviderTimeoutError("FlyAI 酒店搜索超时") from exc
        except OSError as exc:
            raise HotelProviderUnavailableError("FlyAI 官方 CLI 无法启动") from exc

        stderr = completed.stderr.strip()
        if completed.returncode != 0:
            if "Invalid API key" in stderr or "HTTP 401" in stderr or "HTTP 403" in stderr:
                raise HotelAuthenticationError("FlyAI 凭证无效或没有酒店搜索权限")
            raise HotelProviderUnavailableError("FlyAI 酒店搜索暂时不可用")

        try:
            payload = json.loads(completed.stdout.strip())
        except (json.JSONDecodeError, TypeError) as exc:
            raise HotelMalformedResponseError("FlyAI 返回了无法识别的数据格式") from exc
        if not isinstance(payload, dict):
            raise HotelMalformedResponseError("FlyAI 返回结构不是对象")

        status = payload.get("status")
        if status != 0:
            message = str(payload.get("message") or payload.get("systemMessage") or "")
            if "PARAM" in message.upper() or "CICO" in message.upper():
                raise HotelInvalidRequestError("FlyAI 拒绝了酒店搜索参数")
            if status in (401, 403):
                raise HotelAuthenticationError("FlyAI 凭证无效或没有酒店搜索权限")
            raise HotelProviderUnavailableError("FlyAI 酒店搜索返回失败状态")

        data = payload.get("data")
        if not isinstance(data, dict):
            raise HotelMalformedResponseError("FlyAI 响应缺少 data 对象")
        items = data.get("itemList")
        if not isinstance(items, list):
            raise HotelMalformedResponseError("FlyAI 响应缺少 itemList 数组")
        if any(not isinstance(item, dict) for item in items):
            raise HotelMalformedResponseError("FlyAI 酒店列表包含非对象项目")
        return items
