import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranscription } from '@/lib/hooks/useTranscription';
import { countWordDifferences, READ_ALOUD_TEXTS } from '@/lib/readAloudTexts';

const NONE = 'none';

interface ReadAloudPromptProps {
  /** The recorded or uploaded sample; checked against the text once it changes. */
  file?: File | null;
  /** Called with the chosen text so it becomes the reference transcript. */
  onUseText: (text: string) => void;
}

type Check =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'done'; errors: number; words: number }
  | { state: 'failed' };

/** Shows a text to read aloud while recording, then checks the recording with Whisper. */
export function ReadAloudPrompt({ file, onUseText }: ReadAloudPromptProps) {
  const { t } = useTranslation();
  const transcribe = useTranscription();
  const [selectedId, setSelectedId] = useState(NONE);
  const [check, setCheck] = useState<Check>({ state: 'idle' });
  const selected = READ_ALOUD_TEXTS.find((entry) => entry.id === selectedId);

  // Re-check only when a new recording arrives or another text is chosen;
  // `transcribe` and `selected` change identity on every render.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    if (!file || !selected) {
      setCheck({ state: 'idle' });
      return;
    }
    let cancelled = false;
    setCheck({ state: 'checking' });
    transcribe
      .mutateAsync({ file, language: selected.language })
      .then((result) => {
        if (!cancelled)
          setCheck({ state: 'done', ...countWordDifferences(selected.text, result.text) });
      })
      .catch(() => {
        if (!cancelled) setCheck({ state: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [file, selectedId]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    const entry = READ_ALOUD_TEXTS.find((e) => e.id === id);
    if (entry) onUseText(entry.text);
  };

  const ok = check.state === 'done' && check.errors <= Math.max(1, Math.round(check.words * 0.05));

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm">
          <div className="font-medium">{t('readAloud.title')}</div>
          <div className="text-muted-foreground">{t('readAloud.description')}</div>
        </div>
        <Select value={selectedId} onValueChange={handleSelect}>
          <SelectTrigger className="w-[190px] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t('readAloud.none')}</SelectItem>
            {READ_ALOUD_TEXTS.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {t(`readAloud.texts.${entry.id}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selected && (
        <p className="text-lg leading-relaxed rounded-md bg-muted/50 p-3">{selected.text}</p>
      )}

      {selected && check.state === 'checking' && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('readAloud.checking')}
        </p>
      )}
      {selected && check.state === 'done' && ok && (
        <p className="flex items-center gap-2 text-sm text-green-600 dark:text-green-500">
          <CheckCircle2 className="h-4 w-4" />
          {t('readAloud.ok')}
        </p>
      )}
      {selected && check.state === 'done' && !ok && (
        <p className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-500">
          <AlertTriangle className="h-4 w-4" />
          {t('readAloud.mismatch', { count: check.errors })}
        </p>
      )}
      {selected && check.state === 'failed' && (
        <p className="text-sm text-muted-foreground">{t('readAloud.failed')}</p>
      )}
    </div>
  );
}
