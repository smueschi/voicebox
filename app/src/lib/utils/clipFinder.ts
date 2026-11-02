/**
 * Finds the best short clips in a long recording for use as a voice-cloning
 * reference. Works on a decoded AudioBuffer, so it runs in the browser without
 * a backend round trip.
 */

/** Analysis resolution: one frame per 100 ms. */
const FRAME_SECONDS = 0.1;
/** Candidate windows start every second. */
const STEP_FRAMES = 10;
/** Start and end may move this far to land in a pause instead of mid-word. */
const SNAP_FRAMES = 10;
/** A frame this close to full scale counts as clipped. */
const CLIP_PEAK = 0.98;
/** Suggestions after the first need at least this score (roughly: 25 % speech). */
const MIN_EXTRA_SCORE = 0.25;
/** Bars in the overview strip. */
const OVERVIEW_BARS = 120;

export interface ClipRange {
  start: number;
  end: number;
}

export interface ClipCandidate extends ClipRange {
  /** Share of the clip that is speech, 0..1. */
  speechRatio: number;
  score: number;
}

export interface AudioAnalysis {
  duration: number;
  /** Level per overview bar, 0..1, for drawing. */
  overview: number[];
  /** Per-frame data the candidate search works on. */
  frames: FrameData;
}

interface FrameData {
  db: Float32Array;
  speech: Uint8Array;
  clipped: Uint8Array;
}

export function analyzeAudio(buffer: AudioBuffer): AudioAnalysis {
  const frameLength = Math.max(1, Math.round(buffer.sampleRate * FRAME_SECONDS));
  const frameCount = Math.floor(buffer.length / frameLength);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
    buffer.getChannelData(c),
  );

  const db = new Float32Array(frameCount);
  const clipped = new Uint8Array(frameCount);
  for (let f = 0; f < frameCount; f++) {
    let sum = 0;
    let peak = 0;
    const from = f * frameLength;
    for (const data of channels) {
      for (let i = from; i < from + frameLength; i++) {
        const s = data[i];
        sum += s * s;
        const a = Math.abs(s);
        if (a > peak) peak = a;
      }
    }
    const rms = Math.sqrt(sum / (frameLength * channels.length));
    db[f] = 20 * Math.log10(rms + 1e-9);
    clipped[f] = peak >= CLIP_PEAK ? 1 : 0;
  }

  // Speech is anything well above the noise floor and not far below the loud parts.
  const sorted = Array.from(db).sort((a, b) => a - b);
  const noiseFloor = percentile(sorted, 0.1);
  const loud = percentile(sorted, 0.95);
  const threshold = Math.max(noiseFloor + 10, loud - 35, -55);
  const speech = new Uint8Array(frameCount);
  for (let f = 0; f < frameCount; f++) speech[f] = db[f] >= threshold ? 1 : 0;

  return {
    duration: buffer.duration,
    overview: buildOverview(db, noiseFloor, loud),
    frames: { db, speech, clipped },
  };
}

/** Best non-overlapping clips of roughly `clipSeconds`, best first. */
export function findClipCandidates(
  analysis: AudioAnalysis,
  clipSeconds: number,
  count = 4,
): ClipCandidate[] {
  const { speech } = analysis.frames;
  const windowFrames = Math.round(clipSeconds / FRAME_SECONDS);
  if (speech.length <= windowFrames) {
    return [scoreRange(analysis, 0, speech.length)];
  }

  const scored: ClipCandidate[] = [];
  for (let start = 0; start + windowFrames <= speech.length; start += STEP_FRAMES) {
    scored.push(scoreRange(analysis, start, start + windowFrames));
  }
  scored.sort((a, b) => b.score - a.score);

  const picked: ClipCandidate[] = [];
  for (const candidate of scored) {
    if (picked.length >= count) break;
    // Past the best one, only offer clips that are worth listening to.
    if (picked.length > 0 && candidate.score < MIN_EXTRA_SCORE) break;
    const snapped = snapToPauses(analysis, candidate, clipSeconds);
    if (picked.some((p) => snapped.start < p.end && p.start < snapped.end)) continue;
    picked.push(snapped);
  }
  return picked;
}

/** A clip of `clipSeconds` starting near `time`, snapped to pauses. */
export function clipAt(analysis: AudioAnalysis, time: number, clipSeconds: number): ClipCandidate {
  const windowFrames = Math.round(clipSeconds / FRAME_SECONDS);
  const total = analysis.frames.speech.length;
  const start = clamp(Math.round(time / FRAME_SECONDS), 0, Math.max(0, total - windowFrames));
  return snapToPauses(
    analysis,
    scoreRange(analysis, start, Math.min(total, start + windowFrames)),
    clipSeconds,
  );
}

function scoreRange(analysis: AudioAnalysis, from: number, to: number): ClipCandidate {
  const { db, speech, clipped } = analysis.frames;
  let speechFrames = 0;
  let clippedFrames = 0;
  let sum = 0;
  let sumSq = 0;
  for (let f = from; f < to; f++) {
    clippedFrames += clipped[f];
    if (speech[f]) {
      speechFrames++;
      sum += db[f];
      sumSq += db[f] * db[f];
    }
  }
  const length = Math.max(1, to - from);
  const speechRatio = speechFrames / length;
  const clipRatio = clippedFrames / length;
  // Large level swings within the speech hint at music, shouting or a second speaker.
  const mean = speechFrames ? sum / speechFrames : 0;
  const spread = speechFrames ? Math.sqrt(Math.max(0, sumSq / speechFrames - mean * mean)) : 0;
  const score = speechRatio - 3 * clipRatio - 0.02 * Math.max(0, spread - 6);
  return {
    start: from * FRAME_SECONDS,
    end: to * FRAME_SECONDS,
    speechRatio,
    score,
  };
}

/** Moves start and end into the nearest pause so the clip doesn't cut a word. */
function snapToPauses(
  analysis: AudioAnalysis,
  range: ClipCandidate,
  clipSeconds: number,
): ClipCandidate {
  const { speech } = analysis.frames;
  const startFrame = nearestPause(speech, Math.round(range.start / FRAME_SECONDS));
  const maxEnd = Math.min(speech.length, startFrame + Math.round(clipSeconds / FRAME_SECONDS));
  let endFrame = nearestPause(speech, Math.round(range.end / FRAME_SECONDS));
  // Never run past the requested length; that keeps every clip under the 30 s limit.
  if (endFrame > maxEnd || endFrame <= startFrame) endFrame = maxEnd;
  return { ...scoreRange(analysis, startFrame, endFrame), score: range.score };
}

function nearestPause(speech: Uint8Array, frame: number): number {
  for (let d = 0; d <= SNAP_FRAMES; d++) {
    for (const f of [frame - d, frame + d]) {
      if (f >= 0 && f < speech.length && !speech[f]) return f;
    }
  }
  return clamp(frame, 0, speech.length);
}

function buildOverview(db: Float32Array, floor: number, loud: number): number[] {
  const bars = Math.min(OVERVIEW_BARS, db.length);
  const range = Math.max(1, loud - floor);
  const overview: number[] = [];
  for (let b = 0; b < bars; b++) {
    const from = Math.floor((b * db.length) / bars);
    const to = Math.max(from + 1, Math.floor(((b + 1) * db.length) / bars));
    let max = -Infinity;
    for (let f = from; f < to; f++) if (db[f] > max) max = db[f];
    overview.push(clamp((max - floor) / range, 0, 1));
  }
  return overview;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return -100;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
