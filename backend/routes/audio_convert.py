"""Convert uploads the browser can't decode into WAV."""

import asyncio
import io
import tempfile
from pathlib import Path

import soundfile as sf
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response

router = APIRouter()

UPLOAD_CHUNK_SIZE = 1024 * 1024  # 1 MB
CONVERT_MAX_FILE_SIZE = 200 * 1024 * 1024
CONVERT_MAX_SECONDS = 20 * 60
CONVERT_SAMPLE_RATE = 24000


@router.post("/audio/convert")
async def convert_audio(file: UploadFile = File(...)):
    """Decode any audio or video upload and return it as 16-bit mono WAV.

    The browser decodes uploads itself to measure them and cut clips; this is
    the fallback for containers or codecs it can't read. Decoding goes through
    librosa, which hands unknown formats to ffmpeg via audioread.
    """
    from ..utils.audio import UPLOAD_AUDIO_EXTS

    uploaded_ext = Path(file.filename or "").suffix.lower()
    file_suffix = uploaded_ext if uploaded_ext in UPLOAD_AUDIO_EXTS else ".bin"

    with tempfile.NamedTemporaryFile(suffix=file_suffix, delete=False) as tmp:
        tmp_path = tmp.name
        total_size = 0
        while chunk := await file.read(UPLOAD_CHUNK_SIZE):
            total_size += len(chunk)
            if total_size > CONVERT_MAX_FILE_SIZE:
                tmp.close()
                Path(tmp_path).unlink(missing_ok=True)
                raise HTTPException(
                    status_code=413,
                    detail=f"File is too large to convert (maximum {CONVERT_MAX_FILE_SIZE // (1024 * 1024)} MB)",
                )
            tmp.write(chunk)

    try:
        audio, sr = await asyncio.to_thread(_decode, tmp_path)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=415,
            detail="This file format could not be read. Is ffmpeg installed?",
        ) from e
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    buffer = io.BytesIO()
    sf.write(buffer, audio, sr, format="WAV", subtype="PCM_16")
    return Response(content=buffer.getvalue(), media_type="audio/wav")


def _decode(path: str):
    import librosa

    # Read one second past the limit so an over-long file is detected without
    # decoding all of it.
    audio, sr = librosa.load(
        path, sr=CONVERT_SAMPLE_RATE, mono=True, duration=CONVERT_MAX_SECONDS + 1
    )
    if audio.size == 0:
        raise HTTPException(status_code=415, detail="The file contains no audio")
    if len(audio) / sr > CONVERT_MAX_SECONDS:
        raise HTTPException(
            status_code=400,
            detail=f"Audio is too long to convert (maximum {CONVERT_MAX_SECONDS // 60} minutes)",
        )
    return audio, sr
