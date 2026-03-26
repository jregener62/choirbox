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

app = FastAPI(title="ChoirBox", version="0.1.0")

# API routes
app.include_router(auth_router, prefix="/api")
app.include_router(dropbox_router, prefix="/api")
app.include_router(favorites_router, prefix="/api")
app.include_router(labels_router, prefix="/api")
app.include_router(admin_router, prefix="/api")

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
