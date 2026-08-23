"""Unified hotel domain and FlyAI-backed provider boundary."""

from .models import HotelSearchParams, HotelSearchResponse, TravelHotel
from .service import TravelHotelService

__all__ = ["HotelSearchParams", "HotelSearchResponse", "TravelHotel", "TravelHotelService"]
