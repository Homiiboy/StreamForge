/**
 * Helpers for StreamForge's separated HLS TS/AAC pipeline.
 * They are intentionally side-effect free so the batching/alignment logic can
 * be tested outside Chrome.
 */

const EPSILON_SECONDS = 0.001;

function bounds(segment = {}) {
  const start = Number(segment?.start || 0);
  const duration = Math.max(0, Number(segment?.duration || 0));
  const rawEnd = Number(segment?.end);
  const end = Number.isFinite(rawEnd) ? rawEnd : start + duration;
  return { start, end: Math.max(start, end), duration };
}

function overlapSeconds(a, b) {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

/**
 * Pairs HLS video intervals with audio playlist intervals by timeline.
 *
 * Important: an audio segment is downloaded only once, but it may cover more
 * than one video segment. In that case the first matching video pair owns the
 * audio request and later video pairs are marked as already covered. This is
 * different from a strict 1:1 segment mapping and matches how real HLS
 * packagers often cut audio/video at different boundaries.
 *
 * A very small trailing duration mismatch is accepted only at the end of the
 * video track. This avoids aborting a complete movie because the audio
 * playlist ends a few milliseconds before the final video segment boundary,
 * while still detecting genuine missing audio in the middle of a stream.
 */
export function pairHlsSegments(videoSegments = [], audioSegments = [], options = {}) {
  const tailToleranceSeconds = Math.max(0, Number(options.tailToleranceSeconds ?? 0.75));
  const usedAudio = new Set();
  const pairs = [];
  const audioBounds = audioSegments.map(bounds);
  const maxAudioEnd = audioBounds.length ? Math.max(...audioBounds.map(x => x.end)) : 0;

  for (let i = 0; i < videoSegments.length; i++) {
    const video = bounds(videoSegments[i]);
    const overlapping = [];

    for (let j = 0; j < audioBounds.length; j++) {
      const overlap = overlapSeconds(video, audioBounds[j]);
      if (overlap > EPSILON_SECONDS) overlapping.push({ index: j, overlap });
    }

    const alreadyOwned = overlapping.filter(x => usedAudio.has(x.index)).map(x => x.index);
    const audioIndexes = overlapping.filter(x => !usedAudio.has(x.index)).map(x => x.index);
    for (const j of audioIndexes) usedAudio.add(j);

    // Only the last video segment may tolerate a tiny playlist-end drift. The
    // gap is measured from the end of the audio timeline to the beginning of
    // the final video interval, not across arbitrary holes in the middle.
    const isLastVideo = i === videoSegments.length - 1;
    const tailGap = Math.max(0, video.start - maxAudioEnd);
    const tailGapAccepted = isLastVideo && !overlapping.length && audioBounds.length > 0 && maxAudioEnd <= video.start + EPSILON_SECONDS && tailGap <= tailToleranceSeconds;
    const hasAudioCoverage = overlapping.length > 0 || tailGapAccepted;

    pairs.push({
      videoIndex: i,
      audioIndexes,
      hasAudioCoverage,
      coveredByPrevious: alreadyOwned.length > 0,
      coveringAudioIndexes: overlapping.map(x => x.index),
      tailGapAccepted,
      tailGapSeconds: tailGapAccepted ? tailGap : 0
    });
  }

  return pairs;
}

export function pairRequestCost(pair) {
  return 1 + Math.max(0, Number(pair?.audioIndexes?.length || 0));
}

/**
 * Selects as many ordered video/audio pairs as possible without intentionally
 * exceeding the current network request budget. A single pair is always
 * allowed so unusual playlists with multiple audio pieces cannot deadlock.
 */
export function takePairBatch(pairs = [], startIndex = 0, requestBudget = 1) {
  const start = Math.max(0, Number(startIndex || 0));
  const budget = Math.max(1, Number(requestBudget || 1));
  const items = [];
  let requests = 0;

  for (let i = start; i < pairs.length; i++) {
    const pair = pairs[i];
    const cost = pairRequestCost(pair);
    if (items.length && requests + cost > budget) break;
    items.push(pair);
    requests += cost;
    if (requests >= budget) break;
  }

  return {
    items,
    requestCount: requests,
    nextIndex: start + items.length
  };
}
