const DEFAULT_MAX_SAMPLES = 120;
const DEFAULT_MIN_SAMPLES = 8;
const SLOW_FRAME_MS = 1000 / 60;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function percentile(sortedValues, ratio) {
  if (!sortedValues.length) return 0;
  const position = clamp(ratio, 0, 1) * (sortedValues.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = Number(sortedValues[lowerIndex] || 0);
  const upper = Number(sortedValues[upperIndex] || lower);
  return lower + (upper - lower) * (position - lowerIndex);
}

function getFrameKey(stats = null) {
  const frameId = Number(stats?.frameContext?.frameId);
  return Number.isFinite(frameId) ? String(frameId) : "";
}

export function createFramePerformanceWindow({
  maxSamples = DEFAULT_MAX_SAMPLES,
  minSamples = DEFAULT_MIN_SAMPLES,
} = {}) {
  const capacity = Math.max(8, Math.floor(Number(maxSamples) || DEFAULT_MAX_SAMPLES));
  const requiredSamples = Math.max(1, Math.min(capacity, Math.floor(Number(minSamples) || DEFAULT_MIN_SAMPLES)));
  const samples = [];
  let lastFrameKey = "";

  function record(stats = null) {
    const durationMs = Number(stats?.frameDurationMs);
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      return false;
    }
    const frameKey = getFrameKey(stats);
    if (frameKey && frameKey === lastFrameKey) {
      return false;
    }
    if (frameKey) {
      lastFrameKey = frameKey;
    }
    samples.push({
      durationMs: clamp(durationMs, 0, 1000),
      progressivePending: Boolean(stats?.progressiveRender?.pending),
    });
    while (samples.length > capacity) {
      samples.shift();
    }
    return true;
  }

  function getSnapshot() {
    const durations = samples.map((sample) => sample.durationMs).sort((a, b) => a - b);
    const sampleCount = durations.length;
    const p50 = percentile(durations, 0.5);
    const p95 = percentile(durations, 0.95);
    const p99 = percentile(durations, 0.99);
    const slowFrameRatio = sampleCount
      ? samples.filter((sample) => sample.durationMs > SLOW_FRAME_MS).length / sampleCount
      : 0;
    const progressivePendingRatio = sampleCount
      ? samples.filter((sample) => sample.progressivePending).length / sampleCount
      : 0;
    const pressure = sampleCount >= requiredSamples
      ? clamp(Math.max(0, p95 - 12) / 28 + progressivePendingRatio * 0.25, 0, 1)
      : 0;
    return Object.freeze({
      sampleCount,
      capacity,
      ready: sampleCount >= requiredSamples,
      p50Ms: round(p50),
      p95Ms: round(p95),
      p99Ms: round(p99),
      slowFrameRatio: round(slowFrameRatio, 4),
      progressivePendingRatio: round(progressivePendingRatio, 4),
      pressure: round(pressure, 4),
    });
  }

  function clear() {
    samples.length = 0;
    lastFrameKey = "";
  }

  return Object.freeze({ record, getSnapshot, clear });
}
