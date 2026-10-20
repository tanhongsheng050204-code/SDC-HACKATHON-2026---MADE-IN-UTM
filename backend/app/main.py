from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import store
from app.api import router
from app.config import get_settings
from app.reference import get_reference


@asynccontextmanager
async def lifespan(_: FastAPI):
    get_reference()  # fail fast on broken reference data
    store.init_db()
    yield


app = FastAPI(title="Laluan API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(get_settings().cors_origins),
    allow_origin_regex=get_settings().cors_origin_regex,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "X-Admin-Token"],
)
app.include_router(router)
