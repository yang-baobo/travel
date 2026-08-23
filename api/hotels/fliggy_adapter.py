from __future__ import annotations

import math
import re
from typing import Any
from urllib.parse import urlparse

from .models import HotelSearchParams, TravelHotel


PRICE_DISCLAIMER = "飞猪搜索参考价，可能随房型、库存和下单时间变化；最终价格以飞猪预订页为准。"
BOOKING_HOST_SUFFIXES = ("feizhu.com", "fliggy.com", "alitrip.com")


def _clean_text(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        number = float(value)
    elif isinstance(value, str):
        try:
            number = float(value.strip())
        except ValueError:
            return None
    else:
        return None
    return number if math.isfinite(number) else None


def _coordinate(value: Any, *, latitude: bool) -> float | None:
    number = _number(value)
    if number is None:
        return None
    limit = 90 if latitude else 180
    return number if -limit <= number <= limit else None


def _price(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        number = float(value)
        return number if math.isfinite(number) and number >= 0 else None
    text = _clean_text(value)
    if text is None or re.search(r"[xX*]", text):
        return None
    match = re.search(r"(?:¥|￥)?\s*(\d+(?:\.\d+)?)", text.replace(",", ""))
    if not match:
        return None
    number = float(match.group(1))
    return number if math.isfinite(number) and number >= 0 else None


def _trusted_booking_url(value: Any) -> str | None:
    url = _clean_text(value)
    if url is None:
        return None
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https":
        return None
    if not any(host == suffix or host.endswith(f".{suffix}") for suffix in BOOKING_HOST_SUFFIXES):
        return None
    return url


def adapt_fliggy_hotel(raw: dict[str, Any], params: HotelSearchParams) -> TravelHotel | None:
    """Convert one observed FlyAI hotel item without inventing missing fields."""
    source_id = _clean_text(raw.get("shId"))
    name = _clean_text(raw.get("name"))
    if source_id is None or name is None:
        return None

    price_text = _clean_text(raw.get("price"))
    reference_price = _price(raw.get("price"))
    tags = [
        value
        for value in (_clean_text(raw.get("brandName")), _clean_text(raw.get("star")))
        if value is not None
    ]
    booking_url = next(
        (
            trusted
            for candidate in (raw.get("detailUrl"), raw.get("jumpUrl"), raw.get("bookingUrl"))
            if (trusted := _trusted_booking_url(candidate)) is not None
        ),
        None,
    )

    provider_latitude = _coordinate(raw.get("latitude"), latitude=True)
    provider_longitude = _coordinate(raw.get("longitude"), latitude=False)

    return TravelHotel(
        id=f"fliggy:{source_id}",
        source="fliggy",
        sourceHotelId=source_id,
        name=name,
        city=_clean_text(raw.get("city")),
        district=_clean_text(raw.get("district")),
        address=_clean_text(raw.get("address")),
        latitude=provider_latitude,
        longitude=provider_longitude,
        coordinateSource="provider" if provider_latitude is not None and provider_longitude is not None else None,
        coordinateVerified=False,
        geoStatus="unresolved",
        star=_number(raw.get("starLevel")),
        starLabel=_clean_text(raw.get("star")),
        rating=_number(raw.get("rate")),
        reviewCount=None,
        referencePrice=reference_price,
        priceText=price_text,
        priceCurrency="CNY" if price_text and price_text.lstrip().startswith(("¥", "￥")) else None,
        priceType="search_reference",
        priceDisclaimer=PRICE_DISCLAIMER,
        originalPrice=_price(raw.get("originalPrice")),
        roomInformation=None,
        roomAvailability=None,
        imageUrl=_clean_text(raw.get("mainPic")),
        tags=tags,
        facilities=None,
        distanceMeters=None,
        nearbyText=_clean_text(raw.get("interestsPoi")),
        bookingUrl=booking_url,
        checkInDate=params.check_in_date,
        checkOutDate=params.check_out_date,
    )
