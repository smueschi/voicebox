/**
 * Builds reference texts to read aloud for voice cloning. A good reference
 * runs 20–25 seconds, contains every important sound of the language, mixes
 * statements with a question and an exclamation (so the clone hears rising
 * and falling intonation), and is spoken in the tone the voice will be used
 * for. Sentences come from a hand-written bank per language and style; no
 * names, numbers or abbreviations, since people read those differently and
 * Whisper checks them poorly.
 */

export type ReadAloudStyle = 'explain' | 'sales' | 'conversation' | 'story';
export type BuilderLanguage = 'de' | 'en';

export const READ_ALOUD_STYLES: ReadAloudStyle[] = ['explain', 'sales', 'conversation', 'story'];
export const BUILDER_LANGUAGES: BuilderLanguage[] = ['de', 'en'];

export const TARGET_MIN_SECONDS = 20;
export const TARGET_MAX_SECONDS = 25;

/** Syllables per second at the pace each style is read. */
const SYLLABLE_RATE: Record<ReadAloudStyle, number> = {
  explain: 4.3,
  sales: 4.8,
  conversation: 4.6,
  story: 3.7,
};
/** Breath between sentences. */
const SENTENCE_PAUSE_SECONDS = 0.4;

/** Sounds the clone should hear at least once, matched on the lowercased sentence. */
const SOUNDS: Record<BuilderLanguage, Record<string, RegExp>> = {
  de: {
    ä: /ä/,
    ö: /ö/,
    ü: /ü/,
    'ich-Laut': /(?<!s)(?:[eiäöüy]|[lnr])ch/,
    'ach-Laut': /(?<!s)[aou]ch/,
    sch: /sch/,
    'st/sp': /\bs[tp]/,
    pf: /pf/,
    z: /z/,
    ng: /ng/,
    'ei/ai': /ei|ai/,
    'eu/äu': /eu|äu/,
    au: /(?<![äe])au/,
    'langer Vokal': /ie|ah|eh|oh|uh|ee|oo|aa/,
    'kurzer Vokal': /[aeiou](?:ss|ll|mm|nn|tt|ff|pp|ck)/,
    w: /w/,
    j: /\bj/,
    'h am Wortanfang': /\bh/,
  },
  en: {
    th: /th/,
    w: /\bw/,
    v: /v/,
    r: /r/,
    l: /l/,
    ng: /ng\b/,
    sh: /sh|tion/,
    ch: /ch/,
    j: /j|dge|\bge/,
    'long ee': /ee|ea/,
    oo: /oo/,
    'ou/ow': /ou|ow/,
    'ai/ay': /ai|ay/,
    'oi/oy': /oi|oy/,
    'h at start': /\bh/,
    'y at start': /\by/,
    'st/sp/sk': /\bs[tpkl]/,
    z: /z|\bis\b|\bas\b/,
  },
};

// Sentence banks. A leading `^` marks an opener, `$` a closer; the kind
// (statement, question, exclamation) follows from the punctuation.
const BANK: Record<BuilderLanguage, Record<ReadAloudStyle, string[]>> = {
  de: {
    explain: [
      '^Heute schauen wir uns gemeinsam an, wie das Ganze eigentlich funktioniert.',
      '^Willkommen zurück, schön, dass du wieder dabei bist.',
      '^In diesem Video erkläre ich dir Schritt für Schritt, worauf es wirklich ankommt.',
      'Zuerst klären wir die Grundlagen, danach folgt ein praktisches Beispiel aus dem Alltag.',
      'Viele machen hier den gleichen Fehler, und zwar ganz am Anfang.',
      'Stell dir vor, du hättest jeden Monat ein bisschen mehr übrig.',
      'Warum ist das so wichtig?',
      'Was passiert eigentlich, wenn die Zinsen plötzlich steigen?',
      'Das klingt kompliziert, ist aber viel einfacher, als es auf den ersten Blick aussieht.',
      'Entscheidend ist nicht die Höhe, sondern die Regelmässigkeit.',
      'Schreib dir diesen Punkt am besten gleich auf.',
      'Genau hier liegt der Unterschied zwischen Theorie und Praxis!',
      'Und das Schöne daran: Du brauchst dafür keine teure Software!',
      'Achte besonders auf die Gebühren, denn die fressen langfristig einen grossen Teil der Rendite.',
      'Ein kurzer Blick in die Übersicht zeigt sofort, wo du stehst.',
      'Wie viel Zeit musst du dafür ungefähr einplanen?',
      'Pflanzen wachsen ja auch nicht über Nacht, und beim Sparen ist es genauso.',
      'Lass dich nicht von kurzfristigen Schwankungen verunsichern.',
      'Das hat mich am Anfang selbst ziemlich überrascht!',
      'Wer früh beginnt, profitiert am meisten vom Zinseszins.',
      'Prüfe deshalb regelmässig, ob deine Ziele noch zu deiner Lebenssituation passen.',
      'Klingt logisch, oder?',
      'Gerade am Wochenende findet man oft die nötige Ruhe dafür.',
      'Neugierig, wie das in der Praxis aussieht?',
      'Jeder Schritt zählt, auch wenn er am Anfang klein wirkt.',
      '$Wenn dir das geholfen hat, freue ich mich über deine Rückmeldung in den Kommentaren.',
      '$Im nächsten Teil gehen wir noch einen Schritt weiter.',
      '$Probier es einfach einmal aus, du wirst sehen, wie gut es funktioniert!',
    ],
    sales: [
      '^Kennst du das Gefühl, wenn einfach alles zusammenpasst?',
      '^Stopp, bevor du weiterscrollst, hör kurz zu!',
      '^Endlich gibt es eine Lösung, die wirklich hält, was sie verspricht.',
      'Schluss mit komplizierten Formularen und endlosen Wartezeiten!',
      'Mit nur wenigen Klicks ist alles erledigt.',
      'Spare Zeit, Nerven und jede Menge Geld.',
      'Warum noch länger warten?',
      'Überzeuge dich selbst und teste es völlig unverbindlich.',
      'Unsere Kundinnen und Kunden sind begeistert, und das jeden Tag aufs Neue.',
      'Das Beste daran: Es funktioniert auf jedem Gerät, ob zu Hause oder unterwegs!',
      'Frische Ideen, ehrliche Preise und ein Service, der wirklich zuhört.',
      'Stell dir vor, wie viel leichter dein Alltag plötzlich wird.',
      'Was wäre, wenn du schon morgen damit anfangen könntest?',
      'Qualität aus der Schweiz, entwickelt mit Leidenschaft und Präzision.',
      'Zögere nicht, das Angebot gilt nur für kurze Zeit!',
      'Jetzt zugreifen und von exklusiven Vorteilen profitieren!',
      'Kein Risiko, keine versteckten Kosten, keine bösen Überraschungen.',
      'Pünktlich, zuverlässig und überraschend günstig.',
      'Wer einmal gewechselt hat, will nie wieder zurück.',
      'Klingt zu gut, um wahr zu sein?',
      'Hunderte zufriedene Nutzer können sich nicht irren!',
      'Sichere dir deinen Platz, solange der Vorrat reicht!',
      'Pflegeleicht, durchdacht und schnell eingerichtet.',
      '$Worauf wartest du noch? Klick jetzt auf den Link und leg gleich los!',
      '$Probier es aus, du wirst es nicht bereuen!',
      '$Mehr erfährst du direkt auf unserer Webseite.',
    ],
    conversation: [
      '^Hey, schön, dass du da bist!',
      '^Na, wie war dein Tag bisher?',
      '^Ach, gut, dass du fragst, darüber wollte ich sowieso mit dir reden.',
      'Ehrlich gesagt habe ich das am Anfang auch nicht ganz verstanden.',
      'Moment, lass mich kurz überlegen.',
      'Weisst du, was mir gestern passiert ist?',
      'Ich sass im Zug, und plötzlich fiel mir ein, dass ich meinen Schlüssel vergessen hatte!',
      'Das kenne ich, das ist mir auch schon öfter passiert.',
      'Hast du Lust, am Wochenende zusammen etwas zu unternehmen?',
      'Vielleicht gehen wir in die Berge, falls das Wetter mitspielt.',
      'Klar, kein Problem, ich schicke dir die Details später.',
      'Echt jetzt? Das hätte ich nie gedacht!',
      'Hmm, ich glaube, da hast du recht.',
      'Sag mal, trinkst du lieber Kaffee oder Tee?',
      'Zum Glück hat am Ende doch noch alles geklappt.',
      'Das ist eine ziemlich gute Frage, ehrlich.',
      'Ich muss zugeben, das hat mich echt gefreut!',
      'Kein Stress, wir finden bestimmt eine Lösung.',
      'Übrigens, hast du schon von der neuen Bäckerei an der Ecke gehört?',
      'Die frischen Brötchen dort sind wirklich fantastisch!',
      'Manchmal ist weniger eben doch mehr.',
      'Lass uns das einfach Schritt für Schritt angehen.',
      'Pfeif drauf, das schaffen wir schon!',
      'Ja, genau so habe ich mir das vorgestellt.',
      '$Also, wir hören uns, mach es gut!',
      '$Melde dich einfach, wenn du noch Fragen hast.',
      '$Bis später, und pass auf dich auf!',
    ],
    story: [
      '^Es war ein kühler Morgen im Spätherbst, als alles begann.',
      '^Lange bevor die Stadt erwachte, lag Nebel über dem stillen See.',
      '^Niemand im Dorf ahnte, was in jener Nacht geschehen würde.',
      'Die alte Brücke knarrte leise unter ihren Schritten.',
      'Irgendwo in der Ferne bellte ein Hund, dann wurde es wieder still.',
      'Sie zog den Mantel enger um die Schultern und ging weiter.',
      'Warum hatte er ihr nie davon erzählt?',
      'Zwischen den Bäumen schimmerte ein schwaches, flackerndes Licht.',
      'Ihr Herz klopfte schneller, doch sie blieb ruhig stehen.',
      'Der Duft von frischem Brot wehte aus der kleinen Bäckerei herüber.',
      'Was, wenn sie sich die ganze Zeit geirrt hatte?',
      'Plötzlich hörte sie hinter sich ein Geräusch!',
      'Langsam drehte sie sich um und hielt den Atem an.',
      'Auf dem Tisch lag ein Brief, sorgfältig gefaltet und versiegelt.',
      'Draussen peitschte der Regen gegen die Fensterscheiben.',
      'Jahre später würde sie sich noch genau an diesen Augenblick erinnern.',
      'Wie seltsam das Leben manchmal spielt!',
      'Die Glocken der Kirche läuteten zur Mittagszeit.',
      'Er lächelte, als hätte er die Antwort längst gekannt.',
      'Über den Gipfeln zogen dunkle Wolken auf.',
      'Was für eine Überraschung!',
      'Mit zitternden Händen öffnete sie die schwere Holztür.',
      'Im Garten blühten die Apfelbäume, und die Luft roch nach Pflaumen.',
      'Jeden Frühling sangen die Kinder am alten Brunnen.',
      'Ein junger Fremder stand stumm vor dem Eingang.',
      '$Und so begann eine Geschichte, die alles verändern sollte.',
      '$Am nächsten Morgen war von alldem keine Spur mehr zu sehen.',
      '$Doch das ist eine andere Geschichte.',
    ],
  },
  en: {
    explain: [
      "^Today we're going to take a closer look at how this actually works.",
      "^Welcome back, it's great to have you here again.",
      "^In this video, I'll walk you through everything step by step.",
      "First, we'll cover the basics, and then I'll show you a real example.",
      'Most people make the same mistake right at the beginning.',
      'Imagine having a little more money left over every single month.',
      'Why does this matter so much?',
      'What happens when interest rates suddenly change?',
      "It sounds complicated, but it's much easier than it looks.",
      'What really counts is consistency, not the amount.',
      "Write this point down, because we'll need it later.",
      'This is exactly where theory and practice go their separate ways!',
      "And the best part: you don't need any expensive tools!",
      'Watch out for hidden fees, they quietly eat into your returns.',
      'A quick glance at the overview shows you where you stand.',
      'How much time should you set aside for this?',
      "Plants don't grow overnight, and saving works the same way.",
      "Don't let short-term ups and downs throw you off.",
      'Honestly, that surprised me too when I first found out!',
      'Whoever starts early benefits the most from compound growth.',
      'Check regularly whether your goals still fit your life.',
      "Makes sense, doesn't it?",
      'Think of it like a garden: a little care each week goes a long way.',
      'Just remember, the journey matters more than the destination.',
      'Enjoy the process and adjust your plan when things change.',
      '$If this helped you, let me know in the comments below.',
      "$In the next part, we'll go one step further.",
      "$Just give it a try, you'll be surprised how well it works!",
    ],
    sales: [
      '^You know that feeling when everything just clicks?',
      '^Stop scrolling for a second and listen to this!',
      "^Finally, there's a solution that actually delivers on its promise.",
      'Say goodbye to confusing forms and endless waiting!',
      "With just a few clicks, you're all set.",
      'Save time, save energy, and save a lot of money.',
      'Why wait any longer?',
      'See for yourself and try it completely free.',
      'Our customers love it, and they tell us every single day.',
      'The best thing is, it works on every device, at home or on the go!',
      'Fresh ideas, honest prices, and a team that truly listens.',
      'Imagine how much lighter your daily routine could feel.',
      'What if you could start as early as tomorrow?',
      'Crafted with passion, precision, and attention to detail.',
      "Don't hesitate, this offer is only available for a short time!",
      'Join now and enjoy exclusive benefits!',
      'No risk, no hidden costs, no unpleasant surprises.',
      'Fast, reliable, and surprisingly affordable.',
      "Once you switch, you'll never want to go back.",
      'Sounds too good to be true?',
      "Thousands of happy users can't be wrong!",
      "Grab your spot while it's still available!",
      'Your choice, your rules, your way.',
      '$What are you waiting for? Click the link and get started today!',
      "$Try it out, you won't regret it!",
      '$Find out more on our website.',
    ],
    conversation: [
      '^Hey, good to see you!',
      "^So, how's your day been so far?",
      "^Oh, I'm glad you asked, I was just thinking about that.",
      "To be honest, I didn't really get it at first either.",
      'Wait, let me think about that for a second.',
      'Do you know what happened to me yesterday?',
      "I was on the train when I suddenly realized I'd forgotten my keys!",
      "Yeah, I know that feeling, it's happened to me more than once.",
      'Do you feel like doing something together this weekend?',
      'Maybe we could go hiking in the mountains if the weather holds up.',
      "Sure, no problem, I'll send you the details later.",
      'Seriously? I would never have guessed that!',
      'Hmm, I think you might be right about that.',
      'By the way, do you prefer coffee or tea?',
      'Luckily, everything worked out in the end.',
      "That's actually a pretty good question.",
      'I have to admit, that really made my day!',
      "No stress, we'll figure something out.",
      'Have you heard about the new bakery around the corner?',
      'Their fresh bread is absolutely amazing!',
      'Sometimes less really is more.',
      "Let's just take it one step at a time.",
      'Oh boy, that was a journey!',
      "Let's grab a quick lunch and catch up properly.",
      'Which one did you choose in the end?',
      '$Alright, talk to you soon, take care!',
      '$Just let me know if you have any other questions.',
      '$See you later, and enjoy the rest of your day!',
    ],
    story: [
      '^It was a cold morning in late autumn when it all began.',
      '^Long before the city woke up, a thick fog lay over the quiet lake.',
      '^Nobody in the village knew what would happen that night.',
      'The old wooden bridge creaked softly beneath her feet.',
      'Somewhere in the distance a dog barked, and then everything was still again.',
      'She pulled her coat tighter around her shoulders and kept walking.',
      'Why had he never told her about it?',
      'Between the trees, a faint and flickering light was shining.',
      'Her heart was beating faster, but she stood there calmly.',
      'The smell of fresh bread drifted over from the little bakery.',
      'What if she had been wrong the whole time?',
      'Suddenly, she heard a noise behind her!',
      'Slowly, she turned around and held her breath.',
      'On the table lay a letter, carefully folded and sealed.',
      'Outside, the rain was lashing against the windows.',
      'Years later, she would still remember this very moment.',
      'How strange life can be sometimes!',
      'The church bells rang out at noon.',
      'He smiled, as if he had known the answer all along.',
      'Dark clouds were gathering over the mountain peaks.',
      'What a surprise that was!',
      'With trembling hands, she pushed open the heavy door.',
      'The boy enjoyed the noisy joy of the village fair.',
      "Yesterday's adventure was just the beginning of a much stranger journey.",
      'Each child watched the jars of jam sparkle in the window.',
      'Young as she was, she knew the forest by heart.',
      'Was this the room she had seen in her dreams?',
      '$And that was how a story began that would change everything.',
      '$By the next morning, there was no trace of any of it.',
      '$But that is another story.',
    ],
  },
};

interface Sentence {
  text: string;
  role: 'opener' | 'middle' | 'closer';
  question: boolean;
  exclamation: boolean;
  seconds: number;
  sounds: Set<string>;
}

export interface BuiltText {
  text: string;
  language: BuilderLanguage;
  /** Share of the language's sound list the text contains, 0..1. */
  coverage: number;
  /** Sounds from the list the text does not contain. */
  missing: string[];
  estSeconds: number;
}

/** A text of 20–25 seconds for `language` and `style`. The same seed gives the same text. */
export function buildReadAloudText(
  language: BuilderLanguage,
  style: ReadAloudStyle,
  seed: number,
): BuiltText {
  const sentences = parseBank(language, style);
  const random = mulberry32(seed * 7919 + hash(`${language}:${style}`));
  const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)];

  const opener = pick(sentences.filter((s) => s.role === 'opener'));
  const closer = pick(sentences.filter((s) => s.role === 'closer'));
  const chosen = [opener, closer];
  const covered = new Set<string>();
  for (const s of chosen) for (const sound of s.sounds) covered.add(sound);
  const total = () => chosen.reduce((sum, s) => sum + s.seconds, 0);
  const has = (key: 'question' | 'exclamation') => chosen.some((s) => s[key]);

  const middles = sentences.filter((s) => s.role === 'middle');
  const fits = (s: Sentence) => !chosen.includes(s) && total() + s.seconds <= TARGET_MAX_SECONDS;
  // New sounds count most; the random term keeps texts varied between seeds.
  const value = (s: Sentence) =>
    [...s.sounds].filter((sound) => !covered.has(sound)).length + random() * 1.2;
  const take = (s: Sentence) => {
    chosen.splice(chosen.length - 1, 0, s);
    for (const sound of s.sounds) covered.add(sound);
  };
  const best = (pool: Sentence[]) =>
    pool.reduce<{ s: Sentence; v: number } | null>((top, s) => {
      const v = value(s);
      return top === null || v > top.v ? { s, v } : top;
    }, null)?.s;

  for (const key of ['question', 'exclamation'] as const) {
    if (has(key)) continue;
    const found = best(middles.filter((s) => s[key] && fits(s)));
    if (found) take(found);
  }
  while (total() < TARGET_MIN_SECONDS) {
    const found = best(middles.filter(fits));
    if (!found) break;
    take(found);
  }
  // Use the room left up to the maximum for sounds that are still missing.
  for (;;) {
    const found = best(
      middles.filter((s) => fits(s) && [...s.sounds].some((x) => !covered.has(x))),
    );
    if (!found) break;
    take(found);
  }

  const middle = shuffle(chosen.slice(1, -1), random);
  const ordered = [opener, ...middle, closer];
  const all = Object.keys(SOUNDS[language]);
  return {
    text: ordered.map((s) => s.text).join(' '),
    language,
    coverage: covered.size / all.length,
    missing: all.filter((sound) => !covered.has(sound)),
    estSeconds: Math.round(total()),
  };
}

function parseBank(language: BuilderLanguage, style: ReadAloudStyle): Sentence[] {
  return BANK[language][style].map((raw) => {
    const role = raw.startsWith('^') ? 'opener' : raw.startsWith('$') ? 'closer' : 'middle';
    const text = role === 'middle' ? raw : raw.slice(1);
    const lower = text.toLowerCase();
    const sounds = new Set(
      Object.entries(SOUNDS[language])
        .filter(([, pattern]) => pattern.test(lower))
        .map(([sound]) => sound),
    );
    return {
      text,
      role,
      question: text.includes('?'),
      exclamation: text.includes('!'),
      seconds: countSyllables(lower, language) / SYLLABLE_RATE[style] + SENTENCE_PAUSE_SECONDS,
      sounds,
    };
  });
}

function countSyllables(text: string, language: BuilderLanguage): number {
  const words = text.match(/[\p{L}']+/gu) ?? [];
  let count = 0;
  for (const word of words) {
    let syllables = (word.match(/[aeiouyäöü]+/g) ?? []).length;
    // English silent final e (make, time), but not -le (little).
    if (language === 'en' && /[^aeiouyl]e$/.test(word) && syllables > 1) syllables--;
    count += Math.max(1, syllables);
  }
  return count;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
