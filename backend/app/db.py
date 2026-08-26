from pymongo import MongoClient
from pymongo.database import Database

from app.config import get_settings

_client: MongoClient | None = None


def get_db() -> Database:
    global _client
    settings = get_settings()
    if _client is None:
        _client = MongoClient(settings.mongodb_uri)
    return _client[settings.mongodb_db]
