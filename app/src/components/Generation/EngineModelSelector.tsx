import { useEffect } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { FormControl } from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { VoiceProfileResponse } from '@/lib/api/types';
import { engineBestFor } from '@/lib/constants/engineGuide';
import { getLanguageOptionsForEngine, type LanguageCode } from '@/lib/constants/languages';
import type { GenerationFormValues } from '@/lib/hooks/useGenerationForm';
import { useGpuQwenAvailable } from '@/lib/hooks/useGpuQwen';
import { useUpdateProfile } from '@/lib/hooks/useProfiles';

/**
 * Engine/model options and their display metadata.
 * Adding a new engine means adding one entry here.
 */
const ENGINE_OPTIONS = [
  { value: 'qwen:1.7B', label: 'Qwen3-TTS 1.7B', engine: 'qwen' },
  { value: 'qwen:0.6B', label: 'Qwen3-TTS 0.6B', engine: 'qwen' },
  { value: 'qwen_cpp:1.7B', label: 'Qwen3-TTS 1.7B (GPU)', engine: 'qwen_cpp' },
  { value: 'qwen_cpp:0.6B', label: 'Qwen3-TTS 0.6B (GPU)', engine: 'qwen_cpp' },
  { value: 'qwen_custom_voice:1.7B', label: 'Qwen CustomVoice 1.7B', engine: 'qwen_custom_voice' },
  { value: 'qwen_custom_voice:0.6B', label: 'Qwen CustomVoice 0.6B', engine: 'qwen_custom_voice' },
  { value: 'qwen_voice_design', label: 'Qwen VoiceDesign 1.7B', engine: 'qwen_voice_design' },
  { value: 'luxtts', label: 'LuxTTS', engine: 'luxtts' },
  { value: 'chatterbox', label: 'Chatterbox', engine: 'chatterbox' },
  { value: 'chatterbox_turbo', label: 'Chatterbox Turbo', engine: 'chatterbox_turbo' },
  { value: 'tada:1B', label: 'TADA 1B', engine: 'tada' },
  { value: 'tada:3B', label: 'TADA 3B Multilingual', engine: 'tada' },
  { value: 'kokoro', label: 'Kokoro 82M', engine: 'kokoro' },
  { value: 'omnivoice', label: 'OmniVoice (non-commercial)', engine: 'omnivoice' },
] as const;

/** Engines that only support English and should force language to 'en' on select. */
const ENGLISH_ONLY_ENGINES = new Set(['luxtts', 'chatterbox_turbo']);

/** Engines that support cloned (reference audio) profiles. */
const CLONING_ENGINES = new Set([
  'qwen',
  'qwen_cpp',
  'luxtts',
  'chatterbox',
  'chatterbox_turbo',
  'tada',
  'omnivoice',
]);

/** Engines that synthesise a voice from a written description. */
export const DESIGN_ENGINES = new Set(['qwen_voice_design']);

function getAvailableOptions(selectedProfile?: VoiceProfileResponse | null) {
  if (!selectedProfile) return ENGINE_OPTIONS;
  return ENGINE_OPTIONS.filter((opt) => isProfileCompatibleWithEngine(selectedProfile, opt.engine));
}

function getSelectValue(engine: string, modelSize?: string): string {
  if (engine === 'qwen') return `qwen:${modelSize || '1.7B'}`;
  if (engine === 'qwen_custom_voice') return `qwen_custom_voice:${modelSize || '1.7B'}`;
  if (engine === 'qwen_cpp') return `qwen_cpp:${modelSize || '1.7B'}`;
  if (engine === 'tada') return `tada:${modelSize || '1B'}`;
  return engine;
}

export function applyEngineSelection(form: UseFormReturn<GenerationFormValues>, value: string) {
  if (value.startsWith('qwen_cpp:')) {
    const [, modelSize] = value.split(':');
    form.setValue('engine', 'qwen_cpp');
    form.setValue('modelSize', modelSize as '1.7B' | '0.6B');
    const currentLang = form.getValues('language');
    const available = getLanguageOptionsForEngine('qwen_cpp');
    if (!available.some((l) => l.value === currentLang)) {
      form.setValue('language', available[0]?.value ?? 'en');
    }
  } else if (value.startsWith('qwen_custom_voice:')) {
    const [, modelSize] = value.split(':');
    form.setValue('engine', 'qwen_custom_voice');
    form.setValue('modelSize', modelSize as '1.7B' | '0.6B');
    const currentLang = form.getValues('language');
    const available = getLanguageOptionsForEngine('qwen_custom_voice');
    if (!available.some((l) => l.value === currentLang)) {
      form.setValue('language', available[0]?.value ?? 'en');
    }
  } else if (value.startsWith('qwen:')) {
    const [, modelSize] = value.split(':');
    form.setValue('engine', 'qwen');
    form.setValue('modelSize', modelSize as '1.7B' | '0.6B');
    // Validate language is supported by Qwen
    const currentLang = form.getValues('language');
    const available = getLanguageOptionsForEngine('qwen');
    if (!available.some((l) => l.value === currentLang)) {
      form.setValue('language', available[0]?.value ?? 'en');
    }
  } else if (value.startsWith('tada:')) {
    const [, modelSize] = value.split(':');
    form.setValue('engine', 'tada');
    form.setValue('modelSize', modelSize as '1B' | '3B');
    // TADA 1B is English-only; 3B is multilingual
    if (modelSize === '1B') {
      form.setValue('language', 'en');
    } else {
      const currentLang = form.getValues('language');
      const available = getLanguageOptionsForEngine('tada');
      if (!available.some((l) => l.value === currentLang)) {
        form.setValue('language', available[0]?.value ?? 'en');
      }
    }
  } else {
    form.setValue('engine', value as GenerationFormValues['engine']);
    form.setValue('modelSize', undefined as unknown as '1.7B' | '0.6B');
    if (ENGLISH_ONLY_ENGINES.has(value)) {
      form.setValue('language', 'en');
    } else {
      // If current language isn't supported by the new engine, reset to first available
      const currentLang = form.getValues('language');
      const available = getLanguageOptionsForEngine(value);
      if (!available.some((l) => l.value === currentLang)) {
        form.setValue('language', available[0]?.value ?? 'en');
      }
    }
  }
}

interface EngineModelSelectorProps {
  form: UseFormReturn<GenerationFormValues>;
  compact?: boolean;
  selectedProfile?: VoiceProfileResponse | null;
}

export function EngineModelSelector({ form, compact, selectedProfile }: EngineModelSelectorProps) {
  const engine = form.watch('engine') || 'qwen';
  const modelSize = form.watch('modelSize');
  const selectValue = getSelectValue(engine, modelSize);
  const availableOptions = getAvailableOptions(selectedProfile);

  const currentEngineAvailable = availableOptions.some((opt) => opt.value === selectValue);

  useEffect(() => {
    if (!currentEngineAvailable && availableOptions.length > 0) {
      applyEngineSelection(form, availableOptions[0].value);
    }
  }, [availableOptions, currentEngineAvailable, form]);

  const itemClass = compact ? 'text-xs text-muted-foreground' : undefined;
  const triggerClass = compact
    ? 'h-8 text-xs bg-card border-border rounded-full hover:bg-background/50 transition-all'
    : undefined;

  return (
    <Select value={selectValue} onValueChange={(v) => applyEngineSelection(form, v)}>
      <FormControl>
        <SelectTrigger className={triggerClass}>
          <SelectValue />
        </SelectTrigger>
      </FormControl>
      <SelectContent side={compact ? 'top' : undefined}>
        {availableOptions.map((opt) => (
          <SelectItem
            key={opt.value}
            value={opt.value}
            className={itemClass}
            description={engineBestFor(opt.engine)}
          >
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface GpuEngineHintProps {
  form: UseFormReturn<GenerationFormValues>;
  selectedProfile?: VoiceProfileResponse | null;
}

/**
 * Shown while the CPU build of Qwen is selected but the GPU build (qwen_cpp)
 * is installed: same model, about three times faster here.
 */
export function GpuEngineHint({ form, selectedProfile }: GpuEngineHintProps) {
  const { t } = useTranslation();
  const gpuQwen = useGpuQwenAvailable();
  const updateProfile = useUpdateProfile();
  const engine = form.watch('engine') || 'qwen';
  if (!gpuQwen || engine !== 'qwen') return null;

  const switchToGpu = () => applyEngineSelection(form, `qwen_cpp:${form.getValues('modelSize') || '1.7B'}`);
  const canSaveToProfile =
    selectedProfile &&
    (selectedProfile.voice_type ?? 'cloned') === 'cloned' &&
    selectedProfile.default_engine !== 'qwen_cpp';

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-accent/30 bg-accent/5 px-3 py-1.5 text-xs">
      <span className="text-muted-foreground">{t('generation.gpuHint.text')}</span>
      <Button type="button" size="sm" variant="secondary" className="h-6 text-xs" onClick={switchToGpu}>
        {t('generation.gpuHint.useNow')}
      </Button>
      {canSaveToProfile && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 text-xs"
          disabled={updateProfile.isPending}
          onClick={async () => {
            await updateProfile.mutateAsync({
              profileId: selectedProfile.id,
              data: {
                name: selectedProfile.name,
                description: selectedProfile.description,
                language: selectedProfile.language as LanguageCode,
                default_engine: 'qwen_cpp',
                personality: selectedProfile.personality ?? undefined,
              },
            });
            switchToGpu();
          }}
        >
          {t('generation.gpuHint.saveToProfile')}
        </Button>
      )}
    </div>
  );
}

/** Returns what the engine is best at, for hints next to the engine picker. */
export function getEngineDescription(engine: string): string {
  return engineBestFor(engine);
}

/**
 * Check if a profile is compatible with the currently selected engine.
 * Useful for UI hints.
 */
export function isProfileCompatibleWithEngine(
  profile: VoiceProfileResponse,
  engine: string,
): boolean {
  const voiceType = profile.voice_type || 'cloned';
  if (voiceType === 'preset') return profile.preset_engine === engine;
  if (voiceType === 'cloned') return CLONING_ENGINES.has(engine);
  if (voiceType === 'designed') return DESIGN_ENGINES.has(engine);
  return true;
}
