# Qwen3-TTS on any GPU (qwentts.cpp engine)

The `qwen_cpp` engine ("Qwen3-TTS (GPU)" in the model picker) runs the Qwen3-TTS
Base checkpoints through [qwentts.cpp](https://github.com/ServeurpersoCom/qwentts.cpp),
a C++/GGML port. GGML uses **Vulkan** on Windows/Linux and **Metal** on macOS, so
GPUs that PyTorch cannot use on Windows — AMD Radeon (including integrated
Radeon 780M/880M/890M), Intel Arc/Xe — get hardware acceleration.

Measured on a Ryzen AI 9 365 laptop (Radeon 880M iGPU), Qwen3-TTS 1.7B, German,
voice cloning:

| Engine | Device | Real-time factor |
|---|---|---|
| `qwen` (PyTorch) | CPU | ~10× slower than real time |
| `qwen_cpp` (Q8_0) | Vulkan, 880M | ~1.0–1.3× |

## Setup

1. Build `tts-server` (Windows example, needs VS 2022 Build Tools, CMake, Ninja, Vulkan SDK):

   ```powershell
   git clone --recurse-submodules https://github.com/ServeurpersoCom/qwentts.cpp
   cmake -S qwentts.cpp -B qwentts.cpp/build -G "Ninja Multi-Config" -DGGML_VULKAN=ON
   cmake --build qwentts.cpp/build --config Release
   ```

   macOS: `-DGGML_METAL=ON` instead of Vulkan.

2. Point Voicebox at the binary: set `VOICEBOX_QWENTTS_DIR` to the folder containing
   `tts-server(.exe)` (and its `ggml*.dll`), or copy that folder to `<data dir>/qwentts`.

3. Pick **Qwen3-TTS 1.7B (GPU)** in the generation box. The GGUF weights
   (`Serveurperso/Qwen3-TTS-GGUF`) download on first use.

## Settings (Settings → Generation → Qwen GPU engine)

- **Expressiveness (temperature)** — default 0.9, the Qwen library default.
- **Speech model / audio decoder precision** — `Q8_0` (fast) or `BF16`/`F32`.
- **Device** — automatic (Metal on macOS, Vulkan when available, else CPU).

Stored in `<data dir>/qwen_cpp.json`; top_k, top_p, repetition_penalty and the
sub-talker values can be edited there as well.

## Related additions in this fork

- **Text preparation** (Settings → Generation): numbers, currencies (CHF, €, %) and
  abbreviations are spoken out in German/English before synthesis, plus a
  user pronunciation dictionary (`<data dir>/pronunciation.txt`).
- **Subtitles**: History → ⋯ → *Export subtitles (SRT)*, one cue per sentence.
