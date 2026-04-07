from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from backend.database import create_db_and_tables

from backend.api.auth import router as auth_router
from backend.api.dropbox import router as dropbox_router
from backend.api.favorites import router as favorites_router
from backend.api.labels import router as labels_router
from backend.api.admin import router as admin_router
from backend.api.sections import router as sections_router
from backend.api.notes import router as notes_router
from backend.api.section_presets import router as section_presets_router
from backend.api.documents import router as documents_router
from backend.api.annotations import router as annotations_router
from backend.api.feedback import router as feedback_router


class CacheControlMiddleware:
    """Set Cache-Control headers for static assets.
    Hashed files (/assets/*) get long cache (1 year).
    index.html gets no-cache (always fresh)."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")

        async def send_with_cache(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                if path.startswith("/assets/"):
                    # Hashed files: cache for 1 year
                    headers.append((b"cache-control", b"public, max-age=31536000, immutable"))
                elif path == "/" or path.endswith(".html"):
                    # HTML: always revalidate
                    headers.append((b"cache-control", b"no-cache"))
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_cache)


app = FastAPI(title="ChoirBox", version="0.1.0")
app.add_middleware(CacheControlMiddleware)

# API routes
app.include_router(auth_router, prefix="/api")
app.include_router(dropbox_router, prefix="/api")
app.include_router(favorites_router, prefix="/api")
app.include_router(labels_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(sections_router, prefix="/api")
app.include_router(notes_router, prefix="/api")
app.include_router(section_presets_router, prefix="/api")
app.include_router(documents_router, prefix="/api")
app.include_router(annotations_router, prefix="/api")
app.include_router(feedback_router, prefix="/api")

# Static files
BASE = Path(__file__).resolve().parent.parent

# React frontend (Vite build output)
REACT_DIST = BASE / "static" / "react"
REACT_ASSETS = REACT_DIST / "assets"
if REACT_ASSETS.exists():
    app.mount(
        "/assets",
        StaticFiles(directory=str(REACT_ASSETS)),
        name="react-assets",
    )


# Static mockups/files
MOCKUPS_DIR = BASE / "docs" / "mockups"
if MOCKUPS_DIR.exists():
    app.mount("/mockups", StaticFiles(directory=str(MOCKUPS_DIR), html=True), name="mockups")


@app.get("/")
def index():
    """Serve React SPA if built."""
    react_index = REACT_DIST / "index.html"
    if react_index.exists():
        return FileResponse(str(react_index))
    return {"message": "ChoirBox API running. Frontend not built yet — run: cd frontend && npm run build"}


@app.on_event("startup")
async def on_startup():
    import backend.models  # noqa: F401
    create_db_and_tables()
