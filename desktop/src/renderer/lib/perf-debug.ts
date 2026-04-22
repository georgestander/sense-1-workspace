type PerfCounter = {
  count: number;
  maxMs: number;
  totalMs: number;
};

type PerfStore = {
  counters: Record<string, PerfCounter>;
  lastFlushAt: number;
};

type PerfTraceEvent = {
  at: string;
  details?: Record<string, unknown>;
  level: "info" | "warn";
  name: string;
};

type PerfMeasureOptions = {
  details?: Record<string, unknown> | (() => Record<string, unknown>);
  logThresholdMs?: number;
};

type PerfTraceOptions = {
  level?: "info" | "warn";
  minIntervalMs?: number;
  throttleKey?: string;
};

declare global {
  interface Window {
    __SENSE1_DEBUG_PERF__?: boolean;
    __SENSE1_PERF__?: PerfStore;
    __SENSE1_PERF_TRACE__?: PerfTraceEvent[];
    __SENSE1_PERF_TRACE_LAST_AT__?: Record<string, number>;
    __SENSE1_TRACE_PERF__?: boolean;
  }
}

const PERF_FLUSH_INTERVAL_MS = 2000;
const PERF_TRACE_BUFFER_LIMIT = 200;

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

export function isPerfTraceEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  if (window.__SENSE1_TRACE_PERF__ === true || window.__SENSE1_DEBUG_PERF__ === true) {
    return true;
  }

  try {
    if (window.localStorage.getItem("sense1:trace-perf") === "1") {
      return true;
    }
  } catch {
    // Ignore localStorage access failures and fall back to runtime heuristics.
  }

  return false;
}

function getPerfTraceBuffer(): PerfTraceEvent[] {
  if (!window.__SENSE1_PERF_TRACE__) {
    window.__SENSE1_PERF_TRACE__ = [];
  }
  return window.__SENSE1_PERF_TRACE__;
}

function getPerfTraceThrottleStore(): Record<string, number> {
  if (!window.__SENSE1_PERF_TRACE_LAST_AT__) {
    window.__SENSE1_PERF_TRACE_LAST_AT__ = {};
  }
  return window.__SENSE1_PERF_TRACE_LAST_AT__;
}

function resolvePerfDetails(
  details: PerfMeasureOptions["details"],
): Record<string, unknown> | undefined {
  if (!details) {
    return undefined;
  }

  try {
    return typeof details === "function" ? details() : details;
  } catch (error) {
    return {
      detailError: error instanceof Error ? error.message : String(error),
    };
  }
}

function maybeTraceSlowPerf(
  name: string,
  durationMs: number,
  options?: PerfMeasureOptions,
): void {
  const thresholdMs = options?.logThresholdMs;
  if (typeof thresholdMs !== "number" || durationMs < thresholdMs) {
    return;
  }

  tracePerfEvent("slow", {
    durationMs: Number(durationMs.toFixed(2)),
    source: name,
    ...(resolvePerfDetails(options?.details) ?? {}),
  }, {
    level: "warn",
  });
}

export function tracePerfEvent(
  name: string,
  details?: Record<string, unknown>,
  options: PerfTraceOptions = {},
): void {
  if (!isPerfTraceEnabled()) {
    return;
  }

  const throttleKey = options.throttleKey ?? name;
  const minIntervalMs = options.minIntervalMs ?? 0;
  const now = Date.now();
  if (minIntervalMs > 0) {
    const traceThrottleStore = getPerfTraceThrottleStore();
    const lastLoggedAt = traceThrottleStore[throttleKey] ?? 0;
    if (now - lastLoggedAt < minIntervalMs) {
      return;
    }
    traceThrottleStore[throttleKey] = now;
  }

  const event: PerfTraceEvent = {
    at: new Date(now).toISOString(),
    details,
    level: options.level ?? "info",
    name,
  };

  const traceBuffer = getPerfTraceBuffer();
  traceBuffer.push(event);
  if (traceBuffer.length > PERF_TRACE_BUFFER_LIMIT) {
    traceBuffer.splice(0, traceBuffer.length - PERF_TRACE_BUFFER_LIMIT);
  }

  const traceLabel = event.level === "warn" ? "[sense1:perf:warn]" : "[sense1:perf:trace]";
  if (event.level === "warn") {
    console.warn(traceLabel, event);
    return;
  }

  console.info(traceLabel, event);
}

export function installPerfTraceMonitor(getContext?: () => Record<string, unknown>): () => void {
  if (!isPerfTraceEnabled() || typeof window === "undefined") {
    return () => {};
  }

  const resolveContext = (): Record<string, unknown> => {
    if (!getContext) {
      return {};
    }

    try {
      return getContext();
    } catch (error) {
      return {
        contextError: error instanceof Error ? error.message : String(error),
      };
    }
  };

  tracePerfEvent("monitor-started", {
    hostname: window.location.hostname,
    ...resolveContext(),
  });

  let cancelled = false;
  let frameRequestId: number | null = null;

  const performanceObserver = typeof PerformanceObserver === "function"
    ? new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration < 50) {
            continue;
          }

          tracePerfEvent("longtask", {
            durationMs: Number(entry.duration.toFixed(2)),
            entryName: entry.name,
            entryType: entry.entryType,
            startTimeMs: Number(entry.startTime.toFixed(2)),
            ...resolveContext(),
          }, {
            level: "warn",
            minIntervalMs: 250,
            throttleKey: "longtask",
          });
        }
      })
    : null;

  try {
    performanceObserver?.observe({ entryTypes: ["longtask"] });
  } catch {
    performanceObserver?.disconnect();
  }

  if (typeof window.requestAnimationFrame === "function") {
    let previousFrameAt = performance.now();
    const trackFrame = (now: number) => {
      if (cancelled) {
        return;
      }

      const frameGapMs = now - previousFrameAt;
      previousFrameAt = now;
      if (frameGapMs >= 120) {
        tracePerfEvent("frame-gap", {
          frameGapMs: Number(frameGapMs.toFixed(2)),
          ...resolveContext(),
        }, {
          level: "warn",
          minIntervalMs: 500,
          throttleKey: "frame-gap",
        });
      }

      frameRequestId = window.requestAnimationFrame(trackFrame);
    };

    frameRequestId = window.requestAnimationFrame(trackFrame);
  }

  return () => {
    cancelled = true;
    if (frameRequestId !== null && typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(frameRequestId);
    }
    performanceObserver?.disconnect();
  };
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

export function perfMeasure<T>(name: string, fn: () => T, options?: PerfMeasureOptions): T {
  const shouldCollectCounters = isPerfDebugEnabled();
  const startedAt = performance.now();
  try {
    return fn();
  } finally {
    const durationMs = performance.now() - startedAt;
    maybeTraceSlowPerf(name, durationMs, options);

    if (shouldCollectCounters) {
      const store = getPerfStore();
      const counter = store.counters[name] ?? {
        count: 0,
        maxMs: 0,
        totalMs: 0,
      };
      counter.count += 1;
      counter.maxMs = Math.max(counter.maxMs, durationMs);
      counter.totalMs += durationMs;
      store.counters[name] = counter;
      flushPerfCounters();
    }
  }
}
