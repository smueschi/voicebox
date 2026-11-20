"""OmniVoice speed mode: persisted choice, step count and CPU precision."""

import pytest
import torch

from backend.backends import omnivoice_backend as ov


@pytest.fixture
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr("backend.config.get_data_dir", lambda: tmp_path)
    return tmp_path


def test_default_is_quality(data_dir):
    assert ov.load_settings() == {"mode": "quality"}
    assert ov.DIFFUSION_STEPS["quality"] == 32


def test_fast_mode_is_saved(data_dir):
    assert ov.save_settings({"mode": "fast"}) == {"mode": "fast"}
    assert ov.load_settings()["mode"] == "fast"
    assert ov.DIFFUSION_STEPS["fast"] == 16


def test_unknown_mode_is_ignored(data_dir):
    ov.save_settings({"mode": "turbo"})
    assert ov.load_settings()["mode"] == "quality"
    (data_dir / "omnivoice.json").write_text('{"mode": "turbo"}', encoding="utf-8")
    assert ov.load_settings()["mode"] == "quality"


def test_quality_keeps_fp32_on_cpu():
    assert ov._cpu_dtype("quality") is torch.float32


def test_fast_uses_bf16_only_with_avx512(monkeypatch):
    monkeypatch.setattr(torch.backends.cpu, "get_cpu_capability", lambda: "AVX512")
    assert ov._cpu_dtype("fast") is torch.bfloat16
    monkeypatch.setattr(torch.backends.cpu, "get_cpu_capability", lambda: "AVX2")
    assert ov._cpu_dtype("fast") is torch.float32
