"""User settings endpoints — capture/refine and generation defaults."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..services import settings as settings_service

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/captures", response_model=models.CaptureSettingsResponse)
async def get_capture_settings_endpoint(db: Session = Depends(get_db)):
    return settings_service.get_capture_settings(db)


@router.put("/captures", response_model=models.CaptureSettingsResponse)
async def update_capture_settings_endpoint(
    patch: models.CaptureSettingsUpdate,
    db: Session = Depends(get_db),
):
    return settings_service.update_capture_settings(db, patch.model_dump(exclude_unset=True))


@router.get("/generation", response_model=models.GenerationSettingsResponse)
async def get_generation_settings_endpoint(db: Session = Depends(get_db)):
    return settings_service.get_generation_settings(db)


@router.put("/generation", response_model=models.GenerationSettingsResponse)
async def update_generation_settings_endpoint(
    patch: models.GenerationSettingsUpdate,
    db: Session = Depends(get_db),
):
    return settings_service.update_generation_settings(db, patch.model_dump(exclude_unset=True))


@router.get("/text-prep", response_model=models.TextPrepSettings)
async def get_text_prep_settings():
    from ..utils import text_prep

    return models.TextPrepSettings(
        enabled=text_prep.load_settings()["enabled"], dictionary=text_prep.load_dictionary_text()
    )


@router.put("/text-prep", response_model=models.TextPrepSettings)
async def update_text_prep_settings(patch: models.TextPrepSettingsUpdate):
    from ..utils import text_prep

    if patch.enabled is not None:
        text_prep.save_settings({"enabled": patch.enabled})
    if patch.dictionary is not None:
        text_prep.save_dictionary_text(patch.dictionary)
    return await get_text_prep_settings()


@router.post("/text-prep/preview")
async def preview_text_prep(payload: dict):
    """Show how a text will be spoken after preparation."""
    from ..utils import text_prep

    text = str(payload.get("text", ""))[:20_000]
    language = str(payload.get("language", "de"))
    rules = text_prep.parse_rules(text_prep.load_dictionary_text())
    return {"spoken": text_prep.spoken_form(text, language, rules)}


@router.get("/qwen-cpp", response_model=models.QwenCppSettings)
async def get_qwen_cpp_settings():
    from ..backends import get_tts_backend_for_engine
    from ..backends import qwen_cpp_backend

    backend = get_tts_backend_for_engine("qwen_cpp")
    return models.QwenCppSettings(
        **qwen_cpp_backend.load_settings(),
        server_found=qwen_cpp_backend.find_server_binary() is not None,
        active_device=backend.device_name if backend.is_loaded() else None,
    )


@router.put("/qwen-cpp", response_model=models.QwenCppSettings)
async def update_qwen_cpp_settings(patch: models.QwenCppSettingsUpdate):
    """Sampling changes apply to the next generation; precision/device changes reload the model."""
    from ..backends import get_tts_backend_for_engine
    from ..backends import qwen_cpp_backend

    before = qwen_cpp_backend.load_settings()
    after = qwen_cpp_backend.save_settings(patch.model_dump(exclude_unset=True))
    if any(before[k] != after[k] for k in ("talker_precision", "codec_precision", "device")):
        get_tts_backend_for_engine("qwen_cpp").unload_model()
    return await get_qwen_cpp_settings()
