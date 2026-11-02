import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Toggle } from '@/components/ui/toggle';
import { apiClient } from '@/lib/api/client';
import type {
  AudioFinishSettings,
  QualityCheckSettings,
  QwenCppSettings,
  TextPrepSettings,
} from '@/lib/api/types';
import { SettingRow, SettingSection } from './SettingRow';

const TEXT_PREP_KEY = ['settings', 'text-prep'];
const QWEN_CPP_KEY = ['settings', 'qwen-cpp'];
const QUALITY_CHECK_KEY = ['settings', 'quality-check'];
const AUDIO_FINISH_KEY = ['settings', 'audio-finish'];

/** Spoken-form text preparation: numbers, currencies, pronunciation dictionary. */
export function TextPrepSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: TEXT_PREP_KEY, queryFn: () => apiClient.getTextPrepSettings() });
  const mutation = useMutation({
    mutationFn: (patch: Partial<TextPrepSettings>) => apiClient.updateTextPrepSettings(patch),
    onSuccess: (next) => queryClient.setQueryData(TEXT_PREP_KEY, next),
  });
  const [dictionary, setDictionary] = useState('');
  const [sample, setSample] = useState("Ein ETF kostet 0,2 % – bei CHF 10'000 also z.B. 20 Franken.");
  const [spoken, setSpoken] = useState<string | null>(null);
  useEffect(() => setDictionary(data?.dictionary ?? ''), [data?.dictionary]);

  const dirty = data !== undefined && dictionary !== data.dictionary;

  return (
    <SettingSection
      title={t('settings.textPrep.title')}
      description={t('settings.textPrep.description')}
    >
      <SettingRow
        title={t('settings.textPrep.enabled.title')}
        description={t('settings.textPrep.enabled.description')}
        htmlFor="textPrepEnabled"
        action={
          <Toggle
            id="textPrepEnabled"
            checked={data?.enabled ?? true}
            onCheckedChange={(v) => mutation.mutate({ enabled: v })}
          />
        }
      />
      <SettingRow
        title={t('settings.textPrep.dictionary.title')}
        description={t('settings.textPrep.dictionary.description')}
        action={
          <Button
            variant="outline"
            size="sm"
            disabled={!dirty || mutation.isPending}
            onClick={() => mutation.mutate({ dictionary })}
          >
            {t('settings.textPrep.dictionary.save')}
          </Button>
        }
      >
        <Textarea
          value={dictionary}
          onChange={(e) => setDictionary(e.target.value)}
          rows={10}
          spellCheck={false}
          className="font-mono text-xs"
        />
      </SettingRow>
      <SettingRow
        title={t('settings.textPrep.preview.title')}
        description={t('settings.textPrep.preview.description')}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={async () => setSpoken((await apiClient.previewTextPrep(sample, 'de')).spoken)}
          >
            {t('settings.textPrep.preview.run')}
          </Button>
        }
      >
        <Textarea value={sample} onChange={(e) => setSample(e.target.value)} rows={2} />
        {spoken !== null && <p className="text-sm text-muted-foreground mt-2">{spoken}</p>}
      </SettingRow>
    </SettingSection>
  );
}

/** Whisper check per chunk: retries chunks with missing or extra words. */
export function QualityCheckSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: QUALITY_CHECK_KEY,
    queryFn: () => apiClient.getQualityCheckSettings(),
  });
  const mutation = useMutation({
    mutationFn: (patch: Partial<QualityCheckSettings>) => apiClient.updateQualityCheckSettings(patch),
    onSuccess: (next) => queryClient.setQueryData(QUALITY_CHECK_KEY, next),
  });
  const [maxWer, setMaxWer] = useState(data?.max_wer ?? 0.1);
  useEffect(() => setMaxWer(data?.max_wer ?? 0.1), [data?.max_wer]);
  const enabled = (data?.enabled ?? true) && (data?.available ?? true);

  return (
    <SettingSection
      title={t('settings.qualityCheck.title')}
      description={t('settings.qualityCheck.description')}
    >
      <SettingRow
        title={t('settings.qualityCheck.enabled.title')}
        description={
          data && !data.available
            ? t('settings.qualityCheck.enabled.unavailable')
            : t('settings.qualityCheck.enabled.description')
        }
        htmlFor="qualityCheckEnabled"
        action={
          <Toggle
            id="qualityCheckEnabled"
            checked={enabled}
            disabled={data !== undefined && !data.available}
            onCheckedChange={(v) => mutation.mutate({ enabled: v })}
          />
        }
      />
      {enabled && (
        <>
          <SettingRow
            title={t('settings.qualityCheck.maxWer.title')}
            description={t('settings.qualityCheck.maxWer.description')}
            action={
              <span className="text-sm tabular-nums text-muted-foreground">{Math.round(maxWer * 100)} %</span>
            }
          >
            <Slider
              value={[maxWer]}
              onValueChange={([v]) => setMaxWer(v)}
              onValueCommit={([v]) => mutation.mutate({ max_wer: v })}
              min={0.05}
              max={0.3}
              step={0.05}
              aria-label={t('settings.qualityCheck.maxWer.title')}
            />
          </SettingRow>
          <SettingRow
            title={t('settings.qualityCheck.attempts.title')}
            description={t('settings.qualityCheck.attempts.description')}
            action={
              <Select
                value={String(data?.max_attempts ?? 3)}
                onValueChange={(v) => mutation.mutate({ max_attempts: Number(v) })}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2, 3, 4, 5].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {t('settings.qualityCheck.attempts.option', { count: n })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />
          <SettingRow
            title={t('settings.qualityCheck.bestOf.title')}
            description={t('settings.qualityCheck.bestOf.description')}
            htmlFor="qualityCheckBestOf"
            action={
              <Toggle
                id="qualityCheckBestOf"
                checked={(data?.best_of ?? 1) >= 2}
                onCheckedChange={(v) => mutation.mutate({ best_of: v ? 2 : 1 })}
              />
            }
          />
        </>
      )}
    </SettingSection>
  );
}

const LOUDNESS_OPTIONS: { value: number; key: string }[] = [
  { value: -14, key: 'youtube' },
  { value: -16, key: 'podcast' },
  { value: -20, key: 'quiet' },
  { value: 0, key: 'off' },
];

/** Final processing for video use: loudness, de-esser, limiter, speaking rate. */
export function AudioFinishSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: AUDIO_FINISH_KEY,
    queryFn: () => apiClient.getAudioFinishSettings(),
  });
  const mutation = useMutation({
    mutationFn: (patch: Partial<AudioFinishSettings>) => apiClient.updateAudioFinishSettings(patch),
    onSuccess: (next) => queryClient.setQueryData(AUDIO_FINISH_KEY, next),
  });
  const [strength, setStrength] = useState(data?.deesser_strength ?? 0.5);
  const [speed, setSpeed] = useState(data?.speed ?? 1);
  useEffect(() => setStrength(data?.deesser_strength ?? 0.5), [data?.deesser_strength]);
  useEffect(() => setSpeed(data?.speed ?? 1), [data?.speed]);
  const deesser = data?.deesser ?? true;

  return (
    <SettingSection
      title={t('settings.audioFinish.title')}
      description={t('settings.audioFinish.description')}
    >
      <SettingRow
        title={t('settings.audioFinish.loudness.title')}
        description={t('settings.audioFinish.loudness.description')}
        action={
          <Select
            value={String(data?.loudness_lufs ?? -14)}
            onValueChange={(v) => mutation.mutate({ loudness_lufs: Number(v) })}
          >
            <SelectTrigger className="w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOUDNESS_OPTIONS.map((o) => (
                <SelectItem key={o.key} value={String(o.value)}>
                  {t(`settings.audioFinish.loudness.${o.key}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      <SettingRow
        title={t('settings.audioFinish.deesser.title')}
        description={t('settings.audioFinish.deesser.description')}
        htmlFor="audioFinishDeesser"
        action={
          <Toggle
            id="audioFinishDeesser"
            checked={deesser}
            onCheckedChange={(v) => mutation.mutate({ deesser: v })}
          />
        }
      />
      {deesser && (
        <SettingRow
          title={t('settings.audioFinish.strength.title')}
          action={
            <span className="text-sm tabular-nums text-muted-foreground">
              {strength <= 0.5 ? t('settings.audioFinish.strength.light') : t('settings.audioFinish.strength.strong')}{' '}
              ({Math.round(strength * 100)} %)
            </span>
          }
        >
          <Slider
            value={[strength]}
            onValueChange={([v]) => setStrength(v)}
            onValueCommit={([v]) => mutation.mutate({ deesser_strength: v })}
            min={0.1}
            max={1}
            step={0.1}
            aria-label={t('settings.audioFinish.strength.title')}
          />
        </SettingRow>
      )}
      <SettingRow
        title={t('settings.audioFinish.speed.title')}
        description={t('settings.audioFinish.speed.description')}
        action={<span className="text-sm tabular-nums text-muted-foreground">{speed.toFixed(2)}×</span>}
      >
        <Slider
          value={[speed]}
          onValueChange={([v]) => setSpeed(v)}
          onValueCommit={([v]) => mutation.mutate({ speed: v })}
          min={0.85}
          max={1.15}
          step={0.05}
          aria-label={t('settings.audioFinish.speed.title')}
        />
      </SettingRow>
    </SettingSection>
  );
}

const PRECISIONS: QwenCppSettings['talker_precision'][] = ['Q8_0', 'BF16', 'F32'];

/** Tuning for the Qwen GPU engine (qwentts.cpp). */
export function QwenCppSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: QWEN_CPP_KEY, queryFn: () => apiClient.getQwenCppSettings() });
  const mutation = useMutation({
    mutationFn: (patch: Partial<QwenCppSettings>) => apiClient.updateQwenCppSettings(patch),
    onSuccess: (next) => queryClient.setQueryData(QWEN_CPP_KEY, next),
  });
  const [temperature, setTemperature] = useState(data?.temperature ?? 0.9);
  useEffect(() => setTemperature(data?.temperature ?? 0.9), [data?.temperature]);

  const status = !data
    ? '…'
    : !data.server_found
      ? t('settings.qwenCpp.status.missing')
      : data.active_device
        ? t('settings.qwenCpp.status.running', { device: data.active_device })
        : t('settings.qwenCpp.status.idle');

  const precisionSelect = (field: 'talker_precision' | 'codec_precision') => (
    <Select
      value={data?.[field] ?? 'Q8_0'}
      onValueChange={(v) => mutation.mutate({ [field]: v } as Partial<QwenCppSettings>)}
    >
      <SelectTrigger className="w-[150px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PRECISIONS.map((p) => (
          <SelectItem key={p} value={p}>
            {t(`settings.qwenCpp.precision.${p}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <SettingSection title={t('settings.qwenCpp.title')} description={t('settings.qwenCpp.description')}>
      <SettingRow
        title={t('settings.qwenCpp.status.title')}
        description={status}
        action={
          <Select
            value={data?.device ?? 'auto'}
            onValueChange={(v) => mutation.mutate({ device: v })}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['auto', 'Vulkan0', 'MTL0', 'CPU'].map((d) => (
                <SelectItem key={d} value={d}>
                  {t(`settings.qwenCpp.device.${d}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      <SettingRow
        title={t('settings.qwenCpp.temperature.title')}
        description={t('settings.qwenCpp.temperature.description')}
        action={<span className="text-sm tabular-nums text-muted-foreground">{temperature.toFixed(2)}</span>}
      >
        <Slider
          value={[temperature]}
          onValueChange={([v]) => setTemperature(v)}
          onValueCommit={([v]) => mutation.mutate({ temperature: v, subtalker_temperature: v })}
          min={0.3}
          max={1.3}
          step={0.05}
          aria-label={t('settings.qwenCpp.temperature.title')}
        />
      </SettingRow>
      <SettingRow
        title={t('settings.qwenCpp.talker.title')}
        description={t('settings.qwenCpp.talker.description')}
        action={precisionSelect('talker_precision')}
      />
      <SettingRow
        title={t('settings.qwenCpp.codec.title')}
        description={t('settings.qwenCpp.codec.description')}
        action={precisionSelect('codec_precision')}
      />
    </SettingSection>
  );
}
