import redis
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.core.settings import settings

class Base(DeclarativeBase):
    pass


engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True, # check connection before giving from pool
    pool_size=settings.DB_POOL_SIZE, # number of connections in the pool
    max_overflow=settings.DB_MAX_OVERFLOW, # extra connections beyond pool_size
    pool_timeout=settings.DB_POOL_TIMEOUT, # how many seconds to wait for a connection before raising
    pool_recycle=settings.DB_POOL_RECYCLE, # recycle connections older than given time
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_db():
    """FastAPI dependency — yields a DB session and always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
