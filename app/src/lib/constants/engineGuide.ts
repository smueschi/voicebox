/**
 * What each engine is best at, shown in the engine dropdowns and the
 * "Which engine?" panel of the profile form.
 */
export interface EngineGuideEntry {
  label: string;
  bestFor: string;
  /** Clones a voice from a reference recording. */
  cloning: boolean;
  nonCommercial?: boolean;
}

export const ENGINE_GUIDE: Record<string, EngineGuideEntry> = {
  qwen_cpp: {
    label: 'Qwen TTS (GPU)',
    bestFor: 'Best all-round voice cloning. Same model as Qwen3-TTS, runs on the graphics chip',
    cloning: true,
  },
  qwen: {
    label: 'Qwen3-TTS',
    bestFor: 'Same voice quality as the GPU version, slower without a supported GPU',
    cloning: true,
  },
  chatterbox: {
    label: 'Chatterbox',
    bestFor: 'Cloning in 23 languages, including ones Qwen lacks (Dutch, Swedish, Hebrew …)',
    cloning: true,
  },
  chatterbox_turbo: {
    label: 'Chatterbox Turbo',
    bestFor: 'Fast English cloning with [laugh] and [cough] tags',
    cloning: true,
  },
  tada: {
    label: 'TADA',
    bestFor: 'Long texts in one go, e.g. audiobooks (700 s+ of coherent audio)',
    cloning: true,
  },
  luxtts: {
    label: 'LuxTTS',
    bestFor: 'Fast English cloning',
    cloning: true,
  },
  omnivoice: {
    label: 'OmniVoice',
    bestFor: 'Rare languages such as Filipino. Non-commercial use only',
    cloning: true,
    nonCommercial: true,
  },
  qwen_custom_voice: {
    label: 'Qwen CustomVoice',
    bestFor: '9 ready-made voices you can direct with instructions, no cloning',
    cloning: false,
  },
  qwen_voice_design: {
    label: 'Qwen VoiceDesign',
    bestFor: 'Invents a new voice from a written description',
    cloning: false,
  },
  kokoro: {
    label: 'Kokoro',
    bestFor: 'Very fast and small, ready-made voices, no cloning',
    cloning: false,
  },
};

export function engineBestFor(engine: string): string {
  return ENGINE_GUIDE[engine]?.bestFor ?? '';
}
