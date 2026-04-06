#!/usr/bin/env python3
"""Start the ChoirBox development server."""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import logging
import uvicorn
from backend.app import app  # noqa: E402, F401
from backend.seed import seed  # noqa: E402

logging.basicConfig(level=logging.INFO)

if __name__ == "__main__":
    seed()
    port = int(os.environ.get("PORT", 8001))
    reload = os.environ.get("UVICORN_RELOAD", "true").lower() not in ("false", "0", "no")
    host = os.environ.get("HOST", "127.0.0.1")
    uvicorn.run("backend.app:app", host=host, port=port, reload=reload)
