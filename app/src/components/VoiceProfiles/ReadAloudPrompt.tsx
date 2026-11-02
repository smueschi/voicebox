import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { LanguageCode } from '@/lib/constants/languages';
import { useTranscription } from '@/lib/hooks/useTranscription';
import {
  BUILDER_LANGUAGES,
  type BuilderLanguage,
  buildReadAloudText,
  READ_ALOUD_STYLES,
  type ReadAloudStyle,
} from '@/lib/readAloudBuilder';
import { countWordDifferences, READ_ALOUD_TEXTS } from '@/lib/readAloudTexts';

const NONE = 'none';
const STYLE_PREFIX = 'style:';

interface ReadAloudPromptProps {
  /** The recorded or uploaded sample; checked against the text once it changes. */
  file?: File | null;
  /** The profile language; generated texts are written in it when available. */
  language: LanguageCode;
  /** Called with the chosen text so it becomes the reference transcript. */
  onUseText: (text: string) => void;
}

type Check =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'done'; errors: number; words: number }
  | { state: 'failed' };

interface Current {
  text: string;
  language?: LanguageCode;
  style?: ReadAloudStyle;
  estSeconds?: number;
}

/** Shows a text to read aloud while recording, then checks the recording with Whisper. */
export function ReadAloudPrompt({ file, language, onUseText }: ReadAloudPromptProps) {
  const { t } = useTranslation();
  const transcribe = useTranscription();
  const [selectedId, setSelectedId] = useState(NONE);
  // A different starting text each time the form opens; "New text" moves on from there.
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const [check, setCheck] = useState<Check>({ state: 'idle' });

  const builderLanguage: BuilderLanguage = BUILDER_LANGUAGES.includes(language as BuilderLanguage)
    ? (language as BuilderLanguage)
    : 'en';
  const usesFallbackLanguage = builderLanguage !== language;

  const current = useMemo<Current | null>(() => {
    if (selectedId.startsWith(STYLE_PREFIX)) {
      const style = selectedId.slice(STYLE_PREFIX.length) as ReadAloudStyle;
      const built = buildReadAloudText(builderLanguage, style, seed);
      return { text: built.text, language: built.language, style, estSeconds: built.estSeconds };
    }
    const entry = READ_ALOUD_TEXTS.find((e) => e.id === selectedId);
    return entry ? { text: entry.text, language: entry.language } : null;
  }, [selectedId, builderLanguage, seed]);

  // Every new text becomes the reference transcript; onUseText changes identity every render.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    if (current) onUseText(current.text);
  }, [current?.text]);

  // Re-check only when a new recording arrives or the text changes;
  // `transcribe` and `current` change identity on every render.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    if (!file || !current) {
      setCheck({ state: 'idle' });
      return;
    }
    let cancelled = false;
    setCheck({ state: 'checking' });
    transcribe
      .mutateAsync({ file, language: current.language })
      .then((result) => {
        if (!cancelled)
          setCheck({ state: 'done', ...countWordDifferences(current.text, result.text) });
      })
      .catch(() => {
        if (!cancelled) setCheck({ state: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [file, current?.text]);

  const ok = check.state === 'done' && check.errors <= Math.max(1, Math.round(check.words * 0.05));

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm">
          <div className="font-medium">{t('readAloud.title')}</div>
          <div className="text-muted-foreground">{t('readAloud.description')}</div>
        </div>
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger className="w-[190px] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t('readAloud.none')}</SelectItem>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>{t('readAloud.generated')}</SelectLabel>
              {READ_ALOUD_STYLES.map((style) => (
                <SelectItem key={style} value={`${STYLE_PREFIX}${style}`}>
                  {t(`readAloud.styles.${style}`)}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>{t('readAloud.templates')}</SelectLabel>
              {READ_ALOUD_TEXTS.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {t(`readAloud.texts.${entry.id}`)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {current && (
        <p className="text-lg leading-relaxed rounded-md bg-muted/50 p-3">{current.text}</p>
      )}

      {current?.style && (
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground space-y-0.5">
            <div>
              <span className="font-medium text-foreground">{t('readAloud.howToRead')}</span>{' '}
              {t(`readAloud.directions.${current.style}`)}
            </div>
            <div>{t('readAloud.duration', { seconds: current.estSeconds })}</div>
            {usesFallbackLanguage && <div>{t('readAloud.languageFallback')}</div>}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => setSeed((s) => s + 1)}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            {t('readAloud.newText')}
          </Button>
        </div>
      )}

      {current && check.state === 'checking' && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('readAloud.checking')}
        </p>
      )}
      {current && check.state === 'done' && ok && (
        <p className="flex items-center gap-2 text-sm text-green-600 dark:text-green-500">
          <CheckCircle2 className="h-4 w-4" />
          {t('readAloud.ok')}
        </p>
      )}
      {current && check.state === 'done' && !ok && (
        <p className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-500">
          <AlertTriangle className="h-4 w-4" />
          {t('readAloud.mismatch', { count: check.errors })}
        </p>
      )}
      {current && check.state === 'failed' && (
        <p className="text-sm text-muted-foreground">{t('readAloud.failed')}</p>
      )}
    </div>
  );
}
