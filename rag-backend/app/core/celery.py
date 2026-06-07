from celery import Celery

from app.core.settings import settings

celery = Celery(
    "rag_worker",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery.conf.update(
    task_serializer="json",  # data format for sending to broker
    result_serializer="json",  # data format for storing results
    accept_content=["json"],  # allowed content types for tasks
    task_track_started=True,  # flag to track 'STARTED' state in tasks or stuck in queue
)
