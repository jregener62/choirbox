"""PDF-Generator fuer RTF-Dokumente — rendert die paginierte React-View
in einem Headless-Chromium und gibt PDF-Bytes zurueck.

Architektur:
    1. Frontend ruft :func:`render_rtf_pdf` (via REST-Endpoint) mit doc_id +
       Print-Token auf.
    2. Wir starten lazy einen Chromium-Browser (einmal pro Prozess),
       erzeugen pro Request einen neuen Context (sauberes Cookie-Jar).
    3. Browser navigiert zu ``/print/rtf/{doc_id}?token=...`` — die React-
       Seite ist eine "naked route" ohne AppShell und nutzt den kurzlebigen
       Print-Token fuer den Datenabruf via ``/api/print/{doc_id}/bundle``.
    4. Wir warten auf das ``window.__rtfPrintReady === true`` Signal, das
       die Print-Seite nach abgeschlossener Pagination setzt.
    5. ``page.pdf({format: A4, ...})`` — die A4-Seiten in der React-View
       wurden via ``page-break-after: always`` schon zu Druckseiten gemacht.

Browser-Lifecycle:
    Chromium-Launch ist teuer (~200 ms). Wir halten EINEN Browser am Leben
    und erzeugen pro Request einen Context. Bei Reconnect-Verlust starten
    wir neu.
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

# Lokale Basis-URL fuer den Headless-Chromium-Render — Backend ruft sich selbst
# via 127.0.0.1 auf. Default: 8001 (matched run.py). Per ENV ueberschreibbar
# z.B. fuer Dev mit PORT=8002.
PRINT_BASE_URL = os.environ.get("PRINT_BASE_URL", "http://127.0.0.1:8001")

# Companion-PDF-Subfolder relativ zum RTF-Folder. Wird in Browse-Listings
# ausgefiltert; Companion-Dokumente sind nicht user-facing.
RENDERED_SUBFOLDER = ".rendered"

# Lazy imports — playwright soll nicht beim Backend-Start crashen, falls
# der Server-Wartungsstand ihn noch nicht installiert hat. PDF-Endpoints
# liefern dann einen 503 mit klarer Meldung.
try:
    from playwright.async_api import async_playwright, Browser, Playwright
    _PLAYWRIGHT_AVAILABLE = True
except ImportError:
    _PLAYWRIGHT_AVAILABLE = False
    Browser = None  # type: ignore
    Playwright = None  # type: ignore

_pw: Optional["Playwright"] = None
_browser: Optional["Browser"] = None
_lock: Optional[asyncio.Lock] = None


def is_available() -> bool:
    return _PLAYWRIGHT_AVAILABLE


def _get_lock() -> asyncio.Lock:
    global _lock
    if _lock is None:
        _lock = asyncio.Lock()
    return _lock


async def _ensure_browser() -> "Browser":
    """Singleton Chromium. Bei Disconnect wird neu gestartet."""
    global _pw, _browser
    async with _get_lock():
        if _browser is not None and _browser.is_connected():
            return _browser
        if _pw is None:
            _pw = await async_playwright().start()
        _browser = await _pw.chromium.launch(headless=True, args=["--no-sandbox"])
        return _browser


async def shutdown() -> None:
    """Sauberes Herunterfahren — beim FastAPI-Shutdown aufrufen."""
    global _pw, _browser
    if _browser is not None:
        try:
            await _browser.close()
        except Exception as e:
            logger.warning("Browser close failed: %s", e)
        _browser = None
    if _pw is not None:
        try:
            await _pw.stop()
        except Exception as e:
            logger.warning("Playwright stop failed: %s", e)
        _pw = None


def companion_dropbox_path(rtf_dropbox_path: str) -> str:
    """Aus ``/Folder/Sub/Name.rtf`` wird ``/Folder/Sub/.rendered/Name.pdf``."""
    folder, _, name = rtf_dropbox_path.rpartition("/")
    stem = name.rsplit(".", 1)[0] if "." in name else name
    return f"{folder}/{RENDERED_SUBFOLDER}/{stem}.pdf"


async def regenerate_companion_pdf(rtf_doc_id: int) -> None:
    """Hintergrund-Task: rendert Companion-PDF fuer ein RTF und schreibt es
    nach Dropbox + Companion-Document-Row.

    Wird aus FastAPI-BackgroundTasks heraus aufgerufen. Setzt am Quell-RTF
    ``pdf_status`` auf 'pending' (vor Aufruf), 'ready' nach Erfolg, 'failed'
    bei Exception. Markiert die Companion mit ``annotations_stale=True``,
    falls dort bereits Annotations existierten (Layout kann sich geaendert
    haben). Importe sind lazy, um Circular-Imports zu vermeiden.
    """
    from sqlmodel import Session, select
    from backend.database import engine
    from backend.models.annotation import Annotation
    from backend.models.document import Document
    from backend.models.user import User
    from backend.services import document_service
    from backend.services.dropbox_service import get_dropbox_service
    from backend.services.print_token_service import (
        PRINT_TOKEN_TTL_SECONDS,
        issue_print_token,
    )
    from backend.utils.dropbox_paths import full_doc_path

    with Session(engine) as session:
        rtf = session.get(Document, rtf_doc_id)
        if not rtf or rtf.file_type != "rtf":
            logger.warning("regenerate_companion_pdf: doc %s nicht (mehr) RTF", rtf_doc_id)
            return

        try:
            # Print-Token braucht einen User-Bezug — wir nehmen den Uploader
            # des RTFs (oder den ersten Admin als Fallback), da der Token
            # im Hintergrund-Job kein interaktiver User-Kontext hat.
            user_id = rtf.uploaded_by
            user_obj = session.get(User, user_id) if user_id else None
            if not user_obj:
                user_obj = session.exec(select(User).where(User.role == "admin")).first()
                user_id = user_obj.id if user_obj else None
            if not user_obj or not user_id:
                raise RuntimeError("Kein User fuer Print-Token verfuegbar")

            token = issue_print_token(rtf.id, user_id, ttl_seconds=PRINT_TOKEN_TTL_SECONDS)
            print_url = f"{PRINT_BASE_URL}/#/print/rtf/{rtf.id}?token={token}"
            pdf_bytes = await render_rtf_pdf(print_url)

            if not rtf.dropbox_path:
                raise RuntimeError(f"RTF {rtf.id} hat keinen dropbox_path")
            # Absolute Dropbox-Pfade brauchen den Choir-Root vorne dran,
            # die Document-Row speichern wir choir-relativ wie ueblich.
            absolute_rtf_path = full_doc_path(rtf, user_obj, session)
            absolute_companion_path = companion_dropbox_path(absolute_rtf_path)
            companion_relative_path = companion_dropbox_path(rtf.dropbox_path)
            companion_folder = companion_relative_path.rsplit("/", 1)[0]
            companion_name = companion_relative_path.rsplit("/", 1)[1]

            dbx = get_dropbox_service(session)
            if not dbx:
                raise RuntimeError("Dropbox nicht verbunden")
            upload = await dbx.upload_file(pdf_bytes, absolute_companion_path, overwrite=True)
            content_hash = upload.get("content_hash")
            dropbox_file_id = upload.get("id")

            # Page-Count aus PDF-Bytes lesen
            page_count = 1
            try:
                import pymupdf
                with pymupdf.Document(stream=pdf_bytes, filetype="pdf") as pdf_doc:
                    page_count = pdf_doc.page_count
            except Exception as e:
                logger.warning("PDF page_count Lesen fehlgeschlagen: %s", e)

            # Companion-Document-Row finden oder anlegen
            companion = session.exec(
                select(Document).where(
                    Document.source_doc_id == rtf.id,
                    Document.file_type == "pdf",
                )
            ).first()
            had_annotations = False
            if companion:
                # Annotationen pruefen — wenn da, stale-Flag setzen
                ann = session.exec(
                    select(Annotation).where(Annotation.document_id == companion.id)
                ).first()
                had_annotations = ann is not None
                companion.dropbox_path = companion_relative_path
                companion.folder_path = companion_folder
                companion.original_name = companion_name
                companion.file_size = len(pdf_bytes)
                companion.page_count = page_count
                companion.content_hash = content_hash
                if dropbox_file_id:
                    companion.dropbox_file_id = dropbox_file_id
                if had_annotations:
                    companion.annotations_stale = True
            else:
                companion = Document(
                    folder_path=companion_folder,
                    file_type="pdf",
                    original_name=companion_name,
                    file_size=len(pdf_bytes),
                    page_count=page_count,
                    content_hash=content_hash,
                    dropbox_path=companion_relative_path,
                    dropbox_file_id=dropbox_file_id,
                    sort_order=0,
                    uploaded_by=user_id,
                    source_doc_id=rtf.id,
                    annotations_stale=False,
                )
                session.add(companion)
                session.flush()  # damit companion.id verfuegbar ist

            # Render-Caches des Companion-PDFs invalidieren — die Seitenbilder
            # muessen aus den neuen PDF-Bytes kommen.
            try:
                document_service._clear_cached_pdf(companion.id)
                document_service.clear_render_cache()
            except Exception:
                pass

            rtf.pdf_status = "ready"
            session.add(rtf)
            session.add(companion)
            session.commit()
            logger.info(
                "Companion-PDF fuer RTF %s erzeugt (Companion %s, %s Seiten, stale=%s)",
                rtf.id, companion.id, page_count, had_annotations,
            )
        except Exception as e:
            logger.exception("regenerate_companion_pdf failed for doc %s", rtf_doc_id)
            try:
                rtf.pdf_status = "failed"
                session.add(rtf)
                session.commit()
            except Exception:
                pass
            raise e


async def render_rtf_pdf(print_url: str, *, timeout_ms: int = 20000) -> bytes:
    """Rendere ``print_url`` und gib das resultierende PDF zurueck.

    ``print_url`` ist die vollstaendige URL der React-Print-Seite inkl.
    Print-Token als Query-Parameter — z.B.
    ``http://localhost:8001/print/rtf/123?token=...``.

    Wirft :class:`RuntimeError` wenn Chromium nicht verfuegbar ist oder
    die Seite das Ready-Signal nicht innerhalb ``timeout_ms`` setzt.
    """
    if not _PLAYWRIGHT_AVAILABLE:
        raise RuntimeError(
            "playwright nicht installiert — pip install playwright && playwright install chromium"
        )
    browser = await _ensure_browser()
    context = await browser.new_context(viewport={"width": 1024, "height": 1400})
    try:
        page = await context.new_page()
        await page.goto(print_url, wait_until="networkidle", timeout=timeout_ms)
        # Die React-Print-Seite haengt ein Marker-Element <div id="rtf-print-ready">
        # ans Body, sobald Inhalt + Annotations geladen + paginiert sind.
        # wait_for_selector statt wait_for_function, weil unser CSP eval blockt.
        await page.wait_for_selector("#rtf-print-ready", state="attached", timeout=timeout_ms)
        pdf = await page.pdf(
            format="A4",
            print_background=True,
            margin={"top": "0", "bottom": "0", "left": "0", "right": "0"},
            prefer_css_page_size=True,
        )
        return pdf
    finally:
        await context.close()
