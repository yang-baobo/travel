#!/usr/bin/env python3
"""FlyAI Phase 2 isolated capability probe.

This script deliberately does not import or register the FastAPI application.
It shells out to the official ``@fly-ai/flyai-cli`` package, reads the API key
only from the server environment (or the ignored project-root .env file), and
prints a redacted JSON report to stdout.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse


PROJECT_ROOT = Path(__file__).resolve().parents[2]
CLI_PATH = PROJECT_ROOT / "node_modules" / ".bin" / "flyai"
CLI_PACKAGE = PROJECT_ROOT / "node_modules" / "@fly-ai" / "flyai-cli" / "package.json"
DOTENV_PATH = PROJECT_ROOT / ".env"

CHECK_IN_DATE = "2026-09-15"
CHECK_OUT_DATE = "2026-09-17"
FLIGHT_DATE = "2026-09-15"

BOOKING_HOST_SUFFIXES = (
    "feizhu.com",
    "fliggy.com",
    "alitrip.com",
)


@dataclass(frozen=True)
class Case:
    case_id: str
    description: str
    args: tuple[str, ...]


CASES = (
    Case(
        "H1",
        "深圳酒店，指定未来入住和退房日期",
        (
            "search-hotel",
            "--dest-name",
            "深圳",
            "--check-in-date",
            CHECK_IN_DATE,
            "--check-out-date",
            CHECK_OUT_DATE,
        ),
    ),
    Case(
        "H2",
        "深圳酒店，每晚最高 500 元",
        (
            "search-hotel",
            "--dest-name",
            "深圳",
            "--check-in-date",
            CHECK_IN_DATE,
            "--check-out-date",
            CHECK_OUT_DATE,
            "--max-price",
            "500",
            "--sort",
            "price_asc",
        ),
    ),
    Case(
        "H3",
        "世界之窗附近酒店",
        (
            "search-hotel",
            "--dest-name",
            "深圳",
            "--poi-name",
            "世界之窗",
            "--check-in-date",
            CHECK_IN_DATE,
            "--check-out-date",
            CHECK_OUT_DATE,
            "--sort",
            "distance_asc",
        ),
    ),
    Case(
        "H4",
        "深圳 4～5 星酒店，最高 800 元，按评分降序",
        (
            "search-hotel",
            "--dest-name",
            "深圳",
            "--hotel-stars",
            "4,5",
            "--max-price",
            "800",
            "--sort",
            "rate_desc",
            "--check-in-date",
            CHECK_IN_DATE,
            "--check-out-date",
            CHECK_OUT_DATE,
        ),
    ),
    Case(
        "F1",
        "北京到深圳直达航班",
        (
            "search-flight",
            "--origin",
            "北京",
            "--destination",
            "深圳",
            "--dep-date",
            FLIGHT_DATE,
            "--journey-type",
            "1",
            "--sort-type",
            "2",
        ),
    ),
    Case(
        "P1",
        "深圳世界之窗景点能力确认",
        (
            "search-poi",
            "--city-name",
            "深圳",
            "--keyword",
            "世界之窗",
        ),
    ),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run isolated FlyAI Phase 2 capability probes.",
    )
    parser.add_argument(
        "--allow-trial",
        action="store_true",
        help="Allow the CLI bundled trial credential when FLYAI_API_KEY is absent.",
    )
    parser.add_argument(
        "--case",
        action="append",
        dest="case_ids",
        help="Run only a case ID (repeatable): H1, H2, H3, H4, F1, P1.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=35.0,
        help="Per-command timeout in seconds (default: 35).",
    )
    parser.add_argument(
        "--skip-link-check",
        action="store_true",
        help="Do not make the read-only HTTP request used to verify a booking link.",
    )
    return parser.parse_args()


def read_dotenv_value(path: Path, name: str) -> str | None:
    """Read one simple dotenv assignment without ever logging the file."""
    if not path.is_file():
        return None
    pattern = re.compile(rf"^\s*{re.escape(name)}\s*=\s*(.*?)\s*$")
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line or line.lstrip().startswith("#"):
            continue
        match = pattern.match(line)
        if not match:
            continue
        value = match.group(1).strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        return value or None
    return None


def load_api_key() -> str | None:
    return os.environ.get("FLYAI_API_KEY") or read_dotenv_value(DOTENV_PATH, "FLYAI_API_KEY")


def cli_version() -> str | None:
    try:
        package = json.loads(CLI_PACKAGE.read_text(encoding="utf-8"))
        version = package.get("version")
        return str(version) if version is not None else None
    except (OSError, json.JSONDecodeError, TypeError):
        return None


def redact(text: str, secrets: list[str]) -> str:
    safe = text
    for secret in secrets:
        if secret:
            safe = safe.replace(secret, "[REDACTED]")
    safe = re.sub(r"sk-[A-Za-z0-9_-]{8,}", "sk-[REDACTED]", safe)
    return safe


def parse_json_output(stdout: str) -> tuple[Any | None, str | None]:
    stripped = stdout.strip()
    if not stripped:
        return None, "empty stdout"
    try:
        return json.loads(stripped), None
    except json.JSONDecodeError as exc:
        return None, f"non-JSON stdout: {exc.msg} at position {exc.pos}"


def item_list(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    data = payload.get("data")
    if not isinstance(data, dict):
        return []
    items = data.get("itemList")
    if not isinstance(items, list):
        return []
    return [item for item in items if isinstance(item, dict)]


def value_shape(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, str):
        return "string"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return type(value).__name__


def field_shapes(items: list[dict[str, Any]]) -> dict[str, list[str]]:
    shapes: dict[str, set[str]] = {}
    for item in items:
        for key, value in item.items():
            shapes.setdefault(key, set()).add(value_shape(value))
    return {key: sorted(values) for key, values in sorted(shapes.items())}


def parse_visible_price(value: Any) -> float | None:
    if not isinstance(value, str):
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return float(value)
        return None
    normalized = value.replace(",", "")
    match = re.search(r"(?:¥|￥)?\s*(\d+(?:\.\d+)?)", normalized)
    if not match or re.search(r"[xX*]", normalized):
        return None
    return float(match.group(1))


def booking_url_from(item: dict[str, Any]) -> str | None:
    for key in ("detailUrl", "jumpUrl", "bookingUrl"):
        value = item.get(key)
        if isinstance(value, str) and value.startswith(("https://", "http://")):
            return value
    return None


def validate_booking_url(
    url: str,
    hotel_id: str | None,
    timeout_seconds: float = 15.0,
) -> dict[str, Any]:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    trusted = any(host == suffix or host.endswith(f".{suffix}") for suffix in BOOKING_HOST_SUFFIXES)
    result: dict[str, Any] = {
        "provided": True,
        "original_host": host or None,
        "trusted_fliggy_host": trusted,
    }
    if not trusted:
        result["reachable"] = False
        result["error"] = "URL host is outside the expected Fliggy/Feizhu domains"
        return result

    try:
        completed = subprocess.run(
            [
                "curl",
                "--silent",
                "--show-error",
                "--location",
                "--connect-timeout",
                str(min(10, int(timeout_seconds))),
                "--max-time",
                str(int(timeout_seconds)),
                "--output",
                os.devnull,
                "--write-out",
                "%{http_code}\n%{url_effective}\n%{content_type}",
                url,
            ],
            capture_output=True,
            text=True,
            timeout=timeout_seconds + 2,
            check=False,
        )
        lines = completed.stdout.splitlines()
        status = int(lines[0]) if lines and lines[0].isdigit() else None
        final_url = lines[1] if len(lines) > 1 else ""
        decoded_final_url = final_url
        for _ in range(3):
            decoded_final_url = unquote(decoded_final_url)
        result.update(
            {
                "reachable": completed.returncode == 0 and status is not None and 200 <= status < 400,
                "http_status": status,
                "final_host": urlparse(final_url).hostname or None,
                "redirected_to_login": "login.taobao.com" in final_url,
                "matches_hotel_id": (
                    f"shid={hotel_id}" in decoded_final_url if hotel_id else None
                ),
                "includes_check_in": f"checkIn={CHECK_IN_DATE}" in decoded_final_url,
                "includes_check_out": f"checkOut={CHECK_OUT_DATE}" in decoded_final_url,
            }
        )
        if completed.returncode != 0:
            result["error"] = completed.stderr.strip()[:300] or f"curl exit {completed.returncode}"
    except (subprocess.TimeoutExpired, OSError) as exc:
        result.update({"reachable": False, "error": type(exc).__name__})
    return result


def run_cli(
    case: Case,
    api_key: str | None,
    timeout_seconds: float,
    *,
    key_override: str | None = None,
) -> dict[str, Any]:
    env = os.environ.copy()
    effective_key = api_key if key_override is None else key_override
    if effective_key:
        env["FLYAI_API_KEY"] = effective_key
    else:
        env.pop("FLYAI_API_KEY", None)

    started = time.monotonic()
    try:
        completed = subprocess.run(
            [str(CLI_PATH), *case.args],
            cwd=PROJECT_ROOT,
            env=env,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        return {
            "case": case.case_id,
            "description": case.description,
            "ok": False,
            "error_kind": "timeout",
            "duration_ms": round((time.monotonic() - started) * 1000),
            "stderr": redact((exc.stderr or "") if isinstance(exc.stderr, str) else "", [effective_key or ""]),
        }

    duration_ms = round((time.monotonic() - started) * 1000)
    stdout = redact(completed.stdout, [effective_key or ""])
    stderr = redact(completed.stderr, [effective_key or ""])
    payload, parse_error = parse_json_output(stdout)
    items = item_list(payload)
    response_status = payload.get("status") if isinstance(payload, dict) else None
    response_message = payload.get("message") if isinstance(payload, dict) else None
    system_message = payload.get("systemMessage") if isinstance(payload, dict) else None

    result: dict[str, Any] = {
        "case": case.case_id,
        "description": case.description,
        "ok": completed.returncode == 0 and parse_error is None and response_status == 0,
        "exit_code": completed.returncode,
        "duration_ms": duration_ms,
        "response_status": response_status,
        "response_message": response_message,
        "system_message": system_message,
        "result_count": len(items),
        "top_level_fields": sorted(payload.keys()) if isinstance(payload, dict) else [],
        "item_field_shapes": field_shapes(items),
        "sample_item": items[0] if items else None,
    }
    if completed.returncode != 0 and ("Invalid API key" in stderr or "HTTP 401" in stderr):
        result["error_kind"] = "authentication_or_permission"
    elif parse_error:
        result["error_kind"] = "unexpected_format"
    if parse_error:
        result["parse_error"] = parse_error
        result["stdout_preview"] = stdout[:400]
    if stderr:
        result["stderr"] = stderr[:1000]

    if case.case_id.startswith("H"):
        visible_prices = [item.get("price") for item in items if item.get("price") is not None]
        numeric_prices = [price for price in (parse_visible_price(value) for value in visible_prices) if price is not None]
        result["hotel_checks"] = {
            "ids": [item.get("shId") for item in items if item.get("shId") is not None],
            "visible_prices": visible_prices,
            "numeric_prices": numeric_prices,
            "all_numeric_prices_lte_500": (
                all(price <= 500 for price in numeric_prices)
                if case.case_id == "H2" and numeric_prices
                else None
            ),
            "stars": [item.get("star") for item in items if item.get("star") is not None],
            "rates": [item.get("rate", item.get("score")) for item in items if item.get("rate", item.get("score")) is not None],
            "nearby_descriptions": [item.get("interestsPoi") for item in items if item.get("interestsPoi")],
        }

    return result


def error_probes(api_key: str | None, timeout_seconds: float) -> dict[str, Any]:
    invalid_key = run_cli(
        Case(
            "E_INVALID_KEY",
            "错误 API Key",
            ("search-hotel", "--dest-name", "深圳"),
        ),
        api_key,
        timeout_seconds,
        key_override="invalid-phase2-test-key",
    )
    no_result = run_cli(
        Case(
            "E_NO_RESULT",
            "不存在的目的地查询",
            ("search-hotel", "--dest-name", "不存在的测试城市ZZZ20260821"),
        ),
        api_key,
        timeout_seconds,
    )
    invalid_parameter = run_cli(
        Case(
            "E_INVALID_PARAMETER",
            "无效的酒店入住日期",
            (
                "search-hotel",
                "--dest-name",
                "深圳",
                "--check-in-date",
                "not-a-date",
                "--check-out-date",
                CHECK_OUT_DATE,
            ),
        ),
        api_key,
        timeout_seconds,
    )
    timeout = run_cli(
        Case(
            "E_TIMEOUT",
            "客户端极短超时",
            ("search-hotel", "--dest-name", "深圳"),
        ),
        api_key,
        0.001,
    )
    _, unexpected_format_error = parse_json_output("not-json")
    return {
        "invalid_key": invalid_key,
        "no_result": no_result,
        "invalid_parameter": invalid_parameter,
        "timeout": timeout,
        "unexpected_format_parser_probe": {
            "ok": unexpected_format_error is not None,
            "classification": "unexpected_format",
            "message": unexpected_format_error,
        },
    }


def main() -> int:
    options = parse_args()
    if not CLI_PATH.exists():
        print(
            json.dumps(
                {"ok": False, "error": "Official FlyAI CLI is not installed"},
                ensure_ascii=False,
            )
        )
        return 2

    api_key = load_api_key()
    if not api_key and not options.allow_trial:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "FLYAI_API_KEY is missing",
                    "hint": "Set it in the server process environment or the ignored project-root .env file.",
                },
                ensure_ascii=False,
            )
        )
        return 2

    selected_ids = set(options.case_ids or [])
    selected_cases = [case for case in CASES if not selected_ids or case.case_id in selected_ids]
    unknown_ids = selected_ids.difference(case.case_id for case in CASES)
    if unknown_ids:
        print(
            json.dumps(
                {"ok": False, "error": f"Unknown case IDs: {', '.join(sorted(unknown_ids))}"},
                ensure_ascii=False,
            )
        )
        return 2


    results = [run_cli(case, api_key, options.timeout) for case in selected_cases]
    hotel_result = next((result for result in results if result["case"] == "H1"), None)
    booking_check: dict[str, Any] = {"provided": False}
    if hotel_result and isinstance(hotel_result.get("sample_item"), dict):
        booking_url = booking_url_from(hotel_result["sample_item"])
        if booking_url:
            booking_check = {"provided": True, "skipped": options.skip_link_check}
            if not options.skip_link_check:
                hotel_id_value = hotel_result["sample_item"].get("shId")
                hotel_id = str(hotel_id_value) if hotel_id_value is not None else None
                booking_check = validate_booking_url(booking_url, hotel_id)

    report = {
        "metadata": {
            "official_package": "@fly-ai/flyai-cli",
            "cli_version": cli_version(),
            "authentication_mode": "FLYAI_API_KEY" if api_key else "bundled_trial",
            "api_key_present": bool(api_key),
            "api_key_value_logged": False,
            "hotel_dates": {"check_in": CHECK_IN_DATE, "check_out": CHECK_OUT_DATE},
            "flight_date": FLIGHT_DATE,
        },
        "cases": results,
        "booking_link_check": booking_check,
        "error_probes": error_probes(api_key, options.timeout),
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if all(result.get("ok") for result in results) else 1


if __name__ == "__main__":
    sys.exit(main())
