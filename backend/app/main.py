from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

from app import store
from app.api import router
from app.config import get_settings
from app.reference import get_reference


@asynccontextmanager
async def lifespan(_: FastAPI):
    store.init_db()  # first: reference data reads approved snapshots from the database
    get_reference()  # fail fast on broken reference data
    yield
    store.close_pools()


app = FastAPI(title="Laluan API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(get_settings().cors_origins),
    allow_origin_regex=get_settings().cors_origin_regex,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "X-Admin-Token", "Authorization"],
)
app.include_router(router)


# The built frontend, when present (Replit runs one process for both). The app keeps its state in
# the query string (?view=roles), so any path that isn't a file gets index.html.
_dist = get_settings().frontend_dist
if _dist is not None:
    _root = _dist.resolve()

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str):
        if path == "api" or path.startswith("api/"):
            raise HTTPException(404, "Not found")
        file = (_root / path).resolve()
        if path and file.is_file() and file.is_relative_to(_root):
            return FileResponse(file)
        return FileResponse(_root / "index.html")
