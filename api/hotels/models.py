from __future__ import annotations

from datetime import date
from zoneinfo import ZoneInfo
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class CamelModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True, extra="ignore")


class HotelSearchParams(CamelModel):
    destination: str = Field(min_length=1, max_length=80)
    check_in_date: date = Field(alias="checkInDate")
    check_out_date: date = Field(alias="checkOutDate")
    max_reference_price: float | None = Field(default=None, alias="maxReferencePrice", gt=0)
    stars: list[int] | None = None
    keyword: str | None = Field(default=None, max_length=80)
    poi_name: str | None = Field(default=None, alias="poiName", max_length=80)
    sort_by: Literal["none", "price_asc", "price_desc", "distance_candidate", "rating"] = Field(
        default="none",
        alias="sortBy",
    )

    @field_validator("destination")
    @classmethod
    def strip_destination(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("destination cannot be blank")
        return normalized

    @field_validator("keyword", "poi_name")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @field_validator("stars")
    @classmethod
    def validate_stars(cls, value: list[int] | None) -> list[int] | None:
        if value is None:
            return None
        normalized = sorted(set(value))
        if not normalized or any(star < 1 or star > 5 for star in normalized):
            raise ValueError("stars must contain values from 1 to 5")
        return normalized

    @model_validator(mode="after")
    def validate_dates(self) -> "HotelSearchParams":
        today = datetime.now(ZoneInfo("Asia/Shanghai")).date()
        if self.check_in_date < today:
            raise ValueError("checkInDate cannot be earlier than today")
        if self.check_out_date <= self.check_in_date:
            raise ValueError("checkOutDate must be later than checkInDate")
        return self


class TravelHotel(CamelModel):
    id: str
    source: Literal["fliggy", "static"]
    source_hotel_id: str = Field(alias="sourceHotelId")
    name: str
    city: str | None = None
    district: str | None = None
    address: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    coordinate_source: Literal["amap", "provider"] | None = Field(default=None, alias="coordinateSource")
    coordinate_verified: bool = Field(default=False, alias="coordinateVerified")
    geo_status: Literal["unresolved", "resolving", "verified", "ambiguous", "not_found", "error"] = Field(
        default="unresolved",
        alias="geoStatus",
    )
    geo_match_level: Literal["exact", "strong", "ambiguous", "not_found"] | None = Field(
        default=None,
        alias="geoMatchLevel",
    )
    geo_confidence: float | None = Field(default=None, alias="geoConfidence", ge=0, le=1)
    amap_poi_id: str | None = Field(default=None, alias="amapPoiId")
    geocoded_at: str | None = Field(default=None, alias="geocodedAt")
    star: float | None = None
    star_label: str | None = Field(default=None, alias="starLabel")
    rating: float | None = None
    review_count: int | None = Field(default=None, alias="reviewCount")
    reference_price: float | None = Field(default=None, alias="referencePrice")
    price_text: str | None = Field(default=None, alias="priceText")
    price_currency: Literal["CNY"] | None = Field(default=None, alias="priceCurrency")
    price_type: Literal["search_reference"] = Field(default="search_reference", alias="priceType")
    price_disclaimer: str = Field(alias="priceDisclaimer")
    original_price: float | None = Field(default=None, alias="originalPrice")
    room_information: list[dict[str, Any]] | None = Field(default=None, alias="roomInformation")
    room_availability: bool | None = Field(default=None, alias="roomAvailability")
    image_url: str | None = Field(default=None, alias="imageUrl")
    tags: list[str]
    facilities: list[str] | None = None
    distance_meters: float | None = Field(default=None, alias="distanceMeters")
    nearby_text: str | None = Field(default=None, alias="nearbyText")
    booking_url: str | None = Field(default=None, alias="bookingUrl")
    check_in_date: date = Field(alias="checkInDate")
    check_out_date: date = Field(alias="checkOutDate")


class HotelSearchMeta(CamelModel):
    source: Literal["fliggy"] = "fliggy"
    count: int
    query_status: Literal["ok", "no_results"] = Field(alias="queryStatus")
    price_meaning: Literal["search_reference"] = Field(default="search_reference", alias="priceMeaning")
    price_disclaimer: str = Field(alias="priceDisclaimer")
    nearby_precision: Literal["candidate_recall_only", "not_requested"] = Field(alias="nearbyPrecision")
    rating_available: bool = Field(alias="ratingAvailable")


class HotelSearchResponse(CamelModel):
    hotels: list[TravelHotel]
    meta: HotelSearchMeta
