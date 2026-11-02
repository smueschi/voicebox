import type { LanguageCode } from '@/lib/constants/languages';

/**
 * Texts to read aloud when recording a reference sample. Each takes about
 * 15–20 seconds at a natural pace and covers a wide range of sounds, so the
 * clone hears ä/ö/ü, ch, sch, r, s and long and short vowels. Because the text
 * is given, the transcript is exact without transcription.
 */
export interface ReadAloudText {
  id: string;
  /** Whisper language for the check; undefined lets Whisper detect it. */
  language?: LanguageCode;
  text: string;
}

export const READ_ALOUD_TEXTS: ReadAloudText[] = [
  {
    id: 'calm',
    language: 'de',
    text:
      'Heute schauen wir uns in Ruhe an, wie das eigentlich funktioniert. Zuerst die Grundlagen, ' +
      'danach ein Beispiel aus dem Alltag. Nimm dir Zeit, es ist einfacher, als es auf den ersten ' +
      'Blick aussieht. Am Schluss weisst du genau, worauf du achten musst und welche Fehler du ' +
      'vermeiden kannst.',
  },
  {
    id: 'excited',
    language: 'de',
    text:
      'Das ist wirklich spannend! Ich habe es selbst kaum geglaubt, aber die Ergebnisse sprechen ' +
      'für sich. Stell dir vor, du sparst jeden Monat ein bisschen und nach ein paar Jahren ' +
      'schaust du zurück und staunst. Genau darum geht es in diesem Video, also bleib dran!',
  },
  {
    id: 'serious',
    language: 'de',
    text:
      'Bevor wir weitermachen, ein wichtiger Hinweis. Jede Entscheidung hat Folgen, und nicht ' +
      'jede Chance passt zu jeder Situation. Prüfe deshalb sorgfältig, welche Kosten entstehen, ' +
      'wie lange du dich bindest und was passiert, wenn sich die Lage plötzlich ändert.',
  },
  {
    id: 'english',
    language: 'en',
    text:
      "Let's take a closer look at how this works in practice. First, we'll go through the basics, " +
      "then I'll show you a real example. By the end of this video, you'll know exactly which " +
      'questions to ask and which mistakes to avoid. It is easier than it looks.',
  },
  {
    id: 'filipino',
    text:
      'Magandang araw sa inyong lahat! Ngayon, pag-uusapan natin kung paano ito gumagana. ' +
      'Una, titingnan natin ang mga pangunahing bagay, at pagkatapos ay magbibigay ako ng isang ' +
      'halimbawa. Sa dulo, malalaman mo kung ano ang dapat mong gawin at kung ano ang dapat ' +
      'mong iwasan.',
  },
];

function words(text: string): string[] {
  return (
    text
      .toLowerCase()
      .replace(/ß/g, 'ss')
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

/** Word-level edit distance between the given text and what Whisper heard. */
export function countWordDifferences(
  expected: string,
  heard: string,
): { errors: number; words: number } {
  const a = words(expected);
  const b = words(heard);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return { errors: prev[b.length], words: a.length };
}
