from __future__ import annotations

from .errors import HotelCapabilityUnavailableError
from .fliggy_adapter import PRICE_DISCLAIMER, adapt_fliggy_hotel
from .models import HotelSearchMeta, HotelSearchParams, HotelSearchResponse
from .provider import FliggyCliProvider, HotelProvider


class TravelHotelService:
    def __init__(self, provider: HotelProvider | None = None) -> None:
        self.provider = provider or FliggyCliProvider()

    def search(self, params: HotelSearchParams) -> HotelSearchResponse:
        if params.sort_by == "rating":
            raise HotelCapabilityUnavailableError("当前 FlyAI 酒店评分字段不稳定，暂不支持按评分排序")

        raw_items = self.provider.search_hotels(params)
        hotels = []
        for item in raw_items:
            hotel = adapt_fliggy_hotel(item, params)
            if hotel is None:
                continue
            # FlyAI 的 --max-price 只是请求参数，供应方并不保证逐条过滤。
            # 参考价明确高于用户每晚预算上限的酒店在这里再次剔除；缺少
            # 参考价的酒店保留（前端会显示"查看实时价格"）。
            if (
                params.max_reference_price is not None
                and hotel.reference_price is not None
                and hotel.reference_price > params.max_reference_price
            ):
                continue
            hotels.append(hotel)
        rating_available = any(hotel.rating is not None for hotel in hotels)
        return HotelSearchResponse(
            hotels=hotels,
            meta=HotelSearchMeta(
                count=len(hotels),
                queryStatus="ok" if hotels else "no_results",
                priceDisclaimer=PRICE_DISCLAIMER,
                nearbyPrecision="candidate_recall_only" if params.poi_name else "not_requested",
                ratingAvailable=rating_available,
            ),
        )
