"""Video service — re-encode uploaded videos for smaller size and streaming.

Uses ffmpeg to:
- Re-encode with H.264 + AAC at reduced quality (CRF 28)
- Cap resolution at 720p
- Set faststart flag (moov atom at beginning) for streaming support
"""

import asyncio
import logging
import shutil
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)

MAX_VIDEO_SIZE = 150 * 1024 * 1024  # 150 MB raw upload limit

# ffmpeg encoding settings
_CRF = "28"
_MAX_HEIGHT = 720
_AUDIO_BITRATE = "128k"


def ffmpeg_available() -> bool:
    """Check if ffmpeg is installed."""
    return shutil.which("ffmpeg") is not None


async def process_video(content: bytes, filename: str) -> tuple[bytes, str]:
    """Re-encode a video for smaller size and streaming support.

    Returns (processed_bytes, output_filename).
    Output is always .mp4 regardless of input format.
    """
    if not ffmpeg_available():
        logger.warning("ffmpeg nicht verfuegbar — Video wird ohne Re-Encoding hochgeladen")
        return content, filename

    suffix = Path(filename).suffix.lower()
    stem = Path(filename).stem

    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = Path(tmpdir) / f"input{suffix}"
        output_path = Path(tmpdir) / f"output.mp4"

        input_path.write_bytes(content)

        cmd = [
            "ffmpeg", "-y",
            "-i", str(input_path),
            "-c:v", "libx264",
            "-crf", _CRF,
            "-preset", "medium",
            "-vf", f"scale=-2:'min({_MAX_HEIGHT},ih)'",
            "-c:a", "aac",
            "-b:a", _AUDIO_BITRATE,
            "-movflags", "+faststart",
            "-loglevel", "warning",
            str(output_path),
        ]

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await asyncio.wait_for(process.communicate(), timeout=300)

        if process.returncode != 0:
            logger.error("ffmpeg Fehler: %s", stderr.decode(errors="replace"))
            raise RuntimeError(
                f"Video-Verarbeitung fehlgeschlagen (ffmpeg exit {process.returncode})"
            )

        processed = output_path.read_bytes()

        output_name = f"{stem}.mp4"
        original_size = len(content) / (1024 * 1024)
        new_size = len(processed) / (1024 * 1024)
        logger.info(
            "Video verarbeitet: %s — %.1f MB → %.1f MB (%.0f%% Reduktion)",
            filename, original_size, new_size,
            (1 - new_size / original_size) * 100 if original_size > 0 else 0,
        )

        return processed, output_name
