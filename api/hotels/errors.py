from __future__ import annotations


class HotelDataError(RuntimeError):
    code = "HOTEL_PROVIDER_ERROR"


class HotelConfigurationError(HotelDataError):
    code = "HOTEL_PROVIDER_NOT_CONFIGURED"


class HotelAuthenticationError(HotelDataError):
    code = "HOTEL_PROVIDER_AUTH_FAILED"


class HotelProviderUnavailableError(HotelDataError):
    code = "HOTEL_PROVIDER_UNAVAILABLE"


class HotelProviderTimeoutError(HotelDataError):
    code = "HOTEL_PROVIDER_TIMEOUT"


class HotelInvalidRequestError(HotelDataError):
    code = "HOTEL_INVALID_REQUEST"


class HotelCapabilityUnavailableError(HotelDataError):
    code = "HOTEL_CAPABILITY_UNAVAILABLE"


class HotelMalformedResponseError(HotelDataError):
    code = "HOTEL_PROVIDER_MALFORMED_RESPONSE"
