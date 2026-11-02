import { Loader2, Play, Scissors, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api/client';
import { encodeWavRange, formatAudioDuration } from '@/lib/utils/audio';
import {
  type AudioAnalysis,
  type ClipCandidate,
  type ClipRange,
  analyzeAudio,
  clipAt,
  findClipCandidates,
} from '@/lib/utils/clipFinder';

const CLIP_LENGTHS = [10, 15, 20, 25] as const;
const DEFAULT_CLIP_LENGTH = 20;

interface ClipPickerProps {
  /** The upload that is too long to use as is. */
  source: File;
  /** Called with a WAV file holding the chosen clip. */
  onClip: (clip: File) => void;
}

type State =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; buffer: AudioBuffer; analysis: AudioAnalysis };

/** Suggests the best clips of a long upload and lets the user pick one. */
export function ClipPicker({ source, onClip }: ClipPickerProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [clipLength, setClipLength] = useState<number>(DEFAULT_CLIP_LENGTH);
  const [candidates, setCandidates] = useState<ClipCandidate[]>([]);
  const [custom, setCustom] = useState<ClipCandidate | null>(null);
  const [selected, setSelected] = useState<ClipRange | null>(null);
  const [playing, setPlaying] = useState<ClipRange | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    const context = new AudioContext();
    contextRef.current = context;
    const decode = async (file: Blob) => context.decodeAudioData(await file.arrayBuffer());
    // Some browsers can read a file's length but not decode it; the server converts those.
    decode(source)
      .catch(async () => decode(await apiClient.convertAudio(source)))
      .then((buffer) => {
        if (!cancelled) setState({ status: 'ready', buffer, analysis: analyzeAudio(buffer) });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'failed' });
      });
    return () => {
      cancelled = true;
      sourceNodeRef.current?.stop();
      sourceNodeRef.current = null;
      contextRef.current = null;
      void context.close();
    };
  }, [source]);

  // New suggestions whenever the file or the clip length changes; the best one is used right away.
  // biome-ignore lint/correctness/useExhaustiveDependencies: choose/onClip change identity every render
  useEffect(() => {
    if (state.status !== 'ready') return;
    const found = findClipCandidates(state.analysis, clipLength);
    setCandidates(found);
    setCustom(null);
    if (found[0]) choose(found[0]);
  }, [state, clipLength]);

  function choose(range: ClipRange) {
    if (state.status !== 'ready') return;
    setSelected(range);
    const base = source.name.replace(/(\.[^.]+)+$/, '');
    const name = `${base}-clip-${Math.floor(range.start / 60)}m${Math.floor(range.start % 60)
      .toString()
      .padStart(2, '0')}s.wav`;
    onClip(
      new File([encodeWavRange(state.buffer, range.start, range.end)], name, {
        type: 'audio/wav',
      }),
    );
  }

  function togglePlay(range: ClipRange) {
    const context = contextRef.current;
    if (state.status !== 'ready' || !context) return;
    sourceNodeRef.current?.stop();
    sourceNodeRef.current = null;
    if (playing && isSame(playing, range)) {
      setPlaying(null);
      return;
    }
    const node = context.createBufferSource();
    node.buffer = state.buffer;
    node.connect(context.destination);
    node.onended = () => {
      if (sourceNodeRef.current === node) {
        sourceNodeRef.current = null;
        setPlaying(null);
      }
    };
    void context.resume();
    node.start(0, range.start, range.end - range.start);
    sourceNodeRef.current = node;
    setPlaying(range);
  }

  if (state.status === 'loading') {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('clipPicker.analyzing')}
      </div>
    );
  }
  if (state.status === 'failed') {
    return (
      <div className="rounded-lg border border-destructive/50 p-4 text-sm text-destructive">
        {t('clipPicker.failed')}
      </div>
    );
  }

  const { analysis } = state;
  const rows: { range: ClipCandidate; label: string }[] = candidates.map((c, i) => ({
    range: c,
    label: t('clipPicker.suggestion', { n: i + 1 }),
  }));
  if (custom) rows.push({ range: custom, label: t('clipPicker.custom') });

  const inRange = (time: number, range: ClipRange | null) =>
    range !== null && time >= range.start && time < range.end;

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-start gap-2">
        <Scissors className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
        <p className="text-sm">
          {t('clipPicker.intro', {
            duration: formatAudioDuration(analysis.duration),
          })}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{t('clipPicker.length')}</span>
        <div className="inline-flex rounded-md border border-border p-0.5 bg-muted/50">
          {CLIP_LENGTHS.map((seconds) => (
            <button
              key={seconds}
              type="button"
              onClick={() => setClipLength(seconds)}
              className={`px-2 py-0.5 text-xs rounded tabular-nums transition-colors ${
                clipLength === seconds
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {seconds} s
            </button>
          ))}
        </div>
      </div>

      {/* Level overview: suggestions are tinted, the chosen clip is highlighted. Click to pick a spot. */}
      <div>
        <div className="flex h-12 items-end gap-px">
          {analysis.overview.map((level, i) => {
            const time = (i / analysis.overview.length) * analysis.duration;
            const color = inRange(time, selected)
              ? 'bg-accent'
              : candidates.some((c) => inRange(time, c))
                ? 'bg-muted-foreground/60'
                : 'bg-muted-foreground/25';
            return (
              <button
                // biome-ignore lint/suspicious/noArrayIndexKey: bars are fixed positions
                key={i}
                type="button"
                aria-label={t('clipPicker.pickAt', { time: formatAudioDuration(time) })}
                onClick={() => {
                  const clip = clipAt(analysis, time, clipLength);
                  setCustom(clip);
                  choose(clip);
                }}
                className="flex-1 h-full flex items-end cursor-pointer hover:opacity-80"
              >
                <span
                  className={`w-full rounded-sm ${color}`}
                  style={{ height: `${Math.max(4, level * 100)}%` }}
                />
              </button>
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums mt-1">
          <span>0:00</span>
          <span>{t('clipPicker.clickHint')}</span>
          <span>{formatAudioDuration(analysis.duration)}</span>
        </div>
      </div>

      <div className="space-y-1.5">
        {rows.map(({ range, label }) => {
          const isSelected = selected !== null && isSame(selected, range);
          const isPlaying = playing !== null && isSame(playing, range);
          return (
            <div
              key={`${label}-${range.start}`}
              className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm ${
                isSelected ? 'border-accent bg-accent/10' : 'border-border'
              }`}
            >
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => togglePlay(range)}
                aria-label={isPlaying ? t('audioSample.pause') : t('audioSample.play')}
              >
                {isPlaying ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </Button>
              <span className="font-medium">{label}</span>
              <span className="tabular-nums text-muted-foreground">
                {formatAudioDuration(range.start)} – {formatAudioDuration(range.end)}
              </span>
              <span className="text-xs text-muted-foreground">
                {t('clipPicker.speech', { percent: Math.round(range.speechRatio * 100) })}
              </span>
              <div className="ml-auto">
                {isSelected ? (
                  <span className="text-xs font-medium text-accent">
                    {t('clipPicker.selected')}
                  </span>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7"
                    onClick={() => choose(range)}
                  >
                    {t('clipPicker.use')}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">{t('clipPicker.transcribeHint')}</p>
    </div>
  );
}

function isSame(a: ClipRange, b: ClipRange): boolean {
  return Math.abs(a.start - b.start) < 0.05 && Math.abs(a.end - b.end) < 0.05;
}
