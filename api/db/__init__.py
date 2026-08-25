# Re-export from connection module so callers can use:
#   from api.db import get_connection, is_configured
from .connection import close_pool, get_connection, is_configured  # noqa: F401
