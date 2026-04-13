type PerfCounter = {
  count: number;
  maxMs: number;
  totalMs: number;
};

type PerfStore = {
  counters: Record<string, PerfCounter>;
  lastFlushAt: number;
};

declare global {
  interface Window {
    __SENSE1_DEBUG_PERF__?: boolean;
    __SENSE1_PERF__?: PerfStore;
  }
}

const PERF_FLUSH_INTERVAL_MS = 2000;

function isPerfDebugEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  if (window.__SENSE1_DEBUG_PERF__ === true) {
    return true;
  }

  try {
    return window.localStorage.getItem("sense1:debug-perf") === "1";
  } catch {
    return false;
  }
}

function getPerfStore(): PerfStore {
  if (!window.__SENSE1_PERF__) {
    window.__SENSE1_PERF__ = {
      counters: {},
      lastFlushAt: Date.now(),
    };
  }
  return window.__SENSE1_PERF__;
}

function flushPerfCounters(force = false): void {
  if (!isPerfDebugEnabled()) {
    return;
  }

  const store = getPerfStore();
  const now = Date.now();
  if (!force && now - store.lastFlushAt < PERF_FLUSH_INTERVAL_MS) {
    return;
  }

  const counters = Object.entries(store.counters)
    .filter(([, value]) => value.count > 0)
    .sort((left, right) => {
      const durationDelta = right[1].totalMs - left[1].totalMs;
      if (durationDelta !== 0) {
        return durationDelta;
      }
      return right[1].count - left[1].count;
    })
    .slice(0, 12)
    .map(([name, value]) => ({
      name,
      avgMs: value.count > 0 ? Number((value.totalMs / value.count).toFixed(2)) : 0,
      count: value.count,
      maxMs: Number(value.maxMs.toFixed(2)),
      totalMs: Number(value.totalMs.toFixed(2)),
    }));

  if (counters.length > 0) {
    console.info("[sense1:perf]", counters);
  }

  store.lastFlushAt = now;
}

export function perfCount(name: string): void {
  if (!isPerfDebugEnabled()) {
    return;
  }

  const store = getPerfStore();
  const counter = store.counters[name] ?? {
    count: 0,
    maxMs: 0,
    totalMs: 0,
  };
  counter.count += 1;
  store.counters[name] = counter;
  flushPerfCounters();
}

export function perfMeasure<T>(name: string, fn: () => T): T {
  if (!isPerfDebugEnabled()) {
    return fn();
  }

  const startedAt = performance.now();
  try {
    return fn();
  } finally {
    const store = getPerfStore();
    const counter = store.counters[name] ?? {
      count: 0,
      maxMs: 0,
      totalMs: 0,
    };
    const durationMs = performance.now() - startedAt;
    counter.count += 1;
    counter.maxMs = Math.max(counter.maxMs, durationMs);
    counter.totalMs += durationMs;
    store.counters[name] = counter;
    flushPerfCounters();
  }
}

