"""_kill_leftover must survive non-UTF-8 tasklist output and always drop the pid file."""

import subprocess
import sys
from types import SimpleNamespace

import pytest

from backend.backends import qwen_cpp_backend as qc

pytestmark = pytest.mark.skipif(sys.platform != "win32", reason="tasklist branch is Windows-only")


def _setup(tmp_path, monkeypatch, tasklist_stdout: bytes):
    exe = tmp_path / "tts-server.exe"
    exe.write_bytes(b"")
    qc._pid_file(exe).write_text("42884")
    calls = []

    def fake_run(cmd, **kwargs):
        calls.append(cmd)
        if cmd[0] == "tasklist":
            return SimpleNamespace(stdout=tasklist_stdout, stderr=b"", returncode=0)
        return SimpleNamespace(stdout=b"", stderr=b"", returncode=0)

    monkeypatch.setattr(subprocess, "run", fake_run)
    return exe, calls


def test_german_tasklist_output_does_not_crash(tmp_path, monkeypatch):
    # Real output on a German Windows: "ausgeführt" with ü as CP850 byte 0x81.
    out = b"INFORMATION: Es werden keine Aufgaben mit den angegebenen Kriterien ausgef\x81hrt.\r\n"
    exe, calls = _setup(tmp_path, monkeypatch, out)

    qc._kill_leftover(exe)

    assert not qc._pid_file(exe).exists()
    assert [c[0] for c in calls] == ["tasklist"]


def test_running_leftover_is_killed(tmp_path, monkeypatch):
    out = b'"tts-server.exe","42884","Console","1","1\xff234 K"\r\n'
    exe, calls = _setup(tmp_path, monkeypatch, out)

    qc._kill_leftover(exe)

    assert not qc._pid_file(exe).exists()
    assert [c[0] for c in calls] == ["tasklist", "taskkill"]


def test_unexpected_error_still_removes_pid_file(tmp_path, monkeypatch):
    exe, _ = _setup(tmp_path, monkeypatch, b"")

    def boom(cmd, **kwargs):
        raise AttributeError("'NoneType' object has no attribute 'lower'")

    monkeypatch.setattr(subprocess, "run", boom)
    qc._kill_leftover(exe)
    assert not qc._pid_file(exe).exists()
