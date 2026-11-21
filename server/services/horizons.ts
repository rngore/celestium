import type { DataSourceStatus, Vector3D } from '../../src/shared/types.ts';

export interface HorizonsVectorSample {
  target: string;
  targetName: string;
  sourceDescriptor: string;
  epochTdb: string;
  jdTdb: number;
  positionAU: Vector3D;
  velocityAUPerDay: Vector3D;
  retrievedAt: string;
  referenceFrame: string;
}

interface CacheEntry {
  data: HorizonsVectorSample | null;
  error?: string;
  expiresAt: number;
}

const HORIZONS_BASE_URL = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const DEFAULT_CACHE_TTL_MS = Number(process.env.HORIZONS_CACHE_TTL_MS) || 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<HorizonsVectorSample | null>>();

const providerTelemetry = {
  lastSuccessfulRequest: null as string | null,
  lastError: null as string | null,
  consecutiveFailures: 0,
  totalSuccesses: 0,
};

// Simple sequential rate limiter so parallel UI refreshes don't trip JPL Horizons WAF
let queueTail: Promise<void> = Promise.resolve();
function enqueueRateLimited<T>(task: () => Promise<T>): Promise<T> {
  const run = queueTail.then(async () => {
    const res = await task();
    await new Promise((r) => setTimeout(r, 120));
    return res;
  });
  queueTail = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function nextDayIso(dateStr: string): string {
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '2026-11-22';
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function parseHorizonsVectors(
  rawResult: string,
  targetId: string
): HorizonsVectorSample | null {
  const soeIndex = rawResult.indexOf('$$SOE');
  const eoeIndex = rawResult.indexOf('$$EOE');
  if (soeIndex === -1 || eoeIndex === -1 || eoeIndex <= soeIndex) {
    return null;
  }

  const block = rawResult.slice(soeIndex + 5, eoeIndex).trim();
  const targetLine = rawResult.match(/Target body name:\s*([^\n]+)/)?.[1]?.trim() ?? targetId;
  const sourceDescriptor = targetLine.match(/\{source:\s*([^}]+)\}/)?.[1]?.trim() ?? 'JPL Horizons';
  const targetName = targetLine.replace(/\{source:[^}]+\}/, '').trim();

  // Extract first epoch header line inside $$SOE..$$EOE
  const jdMatch = block.match(/(\d+\.\d+)\s*=\s*A\.D\.\s*([^\n]+?)\s*TDB/);
  const xMatch = block.match(/X\s*=\s*([+-]?\d+\.\d+(?:E[+-]?\d+)?)/i);
  const yMatch = block.match(/Y\s*=\s*([+-]?\d+\.\d+(?:E[+-]?\d+)?)/i);
  const zMatch = block.match(/Z\s*=\s*([+-]?\d+\.\d+(?:E[+-]?\d+)?)/i);
  const vxMatch = block.match(/VX\s*=\s*([+-]?\d+\.\d+(?:E[+-]?\d+)?)/i);
  const vyMatch = block.match(/VY\s*=\s*([+-]?\d+\.\d+(?:E[+-]?\d+)?)/i);
  const vzMatch = block.match(/VZ\s*=\s*([+-]?\d+\.\d+(?:E[+-]?\d+)?)/i);

  if (!xMatch || !yMatch || !zMatch || !vxMatch || !vyMatch || !vzMatch) {
    return null;
  }

  return {
    target: targetId,
    targetName,
    sourceDescriptor,
    epochTdb: jdMatch ? `${jdMatch[2].trim()} TDB` : 'J2000 TDB',
    jdTdb: jdMatch ? Number(jdMatch[1]) : 2451545.0,
    positionAU: {
      x: Number(xMatch[1]),
      y: Number(yMatch[1]),
      z: Number(zMatch[1]),
    },
    velocityAUPerDay: {
      x: Number(vxMatch[1]),
      y: Number(vyMatch[1]),
      z: Number(vzMatch[1]),
    },
    retrievedAt: new Date().toISOString(),
    referenceFrame: 'Heliocentric Ecliptic J2000 (ICRF)',
  };
}

async function fetchHorizonsWithRetry(
  targetId: string,
  dateIso: string,
  attempts = 2
): Promise<{ sample: HorizonsVectorSample | null; reason?: string }> {
  const startDate = dateIso.slice(0, 10);
  const stopDate = nextDayIso(startDate);

  const params = new URLSearchParams({
    format: 'json',
    COMMAND: `'${targetId}'`,
    OBJ_DATA: "'NO'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'VECTORS'",
    CENTER: "'500@10'",
    REF_PLANE: "'ECLIPTIC'",
    REF_SYSTEM: "'ICRF'",
    START_TIME: `'${startDate}'`,
    STOP_TIME: `'${stopDate}'`,
    STEP_SIZE: "'1 d'",
    OUT_UNITS: "'AU-D'",
    VEC_TABLE: "'2'",
  });

  const url = `${HORIZONS_BASE_URL}?${params.toString()}`;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'CELESTIUM-Aerospace-Platform/1.0' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from JPL Horizons`);
      }

      const contentType = response.headers.get('content-type') || '';
      const rawText = await response.text();
      if (!contentType.includes('json') && rawText.trim().startsWith('<')) {
        throw new Error('JPL Horizons returned non-JSON HTML response');
      }

      const payload = JSON.parse(rawText) as { result?: string; error?: string };
      if (payload.error) {
        return { sample: null, reason: payload.error };
      }

      const resultText = payload.result ?? '';
      const sample = parseHorizonsVectors(resultText, targetId);
      if (!sample) {
        const reasonLine = resultText
          .split('\n')
          .find(
            (line) =>
              line.includes('No ephemeris') ||
              line.includes('Cannot') ||
              line.includes('Ambiguous')
          )
          ?.trim();
        return { sample: null, reason: reasonLine || 'Target ephemeris unavailable for epoch' };
      }

      providerTelemetry.lastSuccessfulRequest = new Date().toISOString();
      providerTelemetry.consecutiveFailures = 0;
      providerTelemetry.totalSuccesses++;
      return { sample };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < attempts) {
        await new Promise((r) => setTimeout(r, 350 * attempt));
        continue;
      }
      providerTelemetry.consecutiveFailures++;
      providerTelemetry.lastError = msg;
      return { sample: null, reason: msg };
    }
  }

  return { sample: null, reason: 'Horizons request exhausted retries' };
}

export async function getHorizonsVector(
  targetId: string,
  dateIso: string,
  forceRefresh = false
): Promise<{ sample: HorizonsVectorSample | null; cached: boolean; error?: string }> {
  const key = `${targetId}:${dateIso.slice(0, 10)}`;
  const now = Date.now();

  if (!forceRefresh) {
    const existing = cache.get(key);
    if (existing && existing.expiresAt > now) {
      return { sample: existing.data, cached: true, error: existing.error };
    }
  }

  const existingInflight = inflight.get(key);
  if (existingInflight) {
    const sample = await existingInflight;
    return { sample, cached: false };
  }

  const job = enqueueRateLimited(async () => {
    const { sample, reason } = await fetchHorizonsWithRetry(targetId, dateIso);
    // Cache successful samples for TTL; cache unsupported-target negatives for 1 hour to avoid hammering
    const ttl = sample ? DEFAULT_CACHE_TTL_MS : 10 * 60 * 1000;
    cache.set(key, {
      data: sample,
      error: reason,
      expiresAt: Date.now() + ttl,
    });
    return sample;
  }).finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, job);
  const sample = await job;
  const cachedEntry = cache.get(key);
  return { sample, cached: false, error: cachedEntry?.error };
}

export function clearHorizonsCache(): void {
  cache.clear();
}

export function getHorizonsProviderStatus(): DataSourceStatus {
  let status: DataSourceStatus['status'] = 'OFFLINE';
  if (providerTelemetry.lastSuccessfulRequest) {
    status = providerTelemetry.consecutiveFailures >= 3 ? 'DEGRADED' : 'CONNECTED';
  } else if (providerTelemetry.consecutiveFailures > 0) {
    status = 'OFFLINE';
  }

  return {
    id: 'jpl-horizons',
    provider: 'NASA / JPL Horizons Ephemeris System',
    categories: ['Planetary State Vectors', 'Supported Deep-Space Spacecraft Ephemerides'],
    officialUrl: 'https://ssd-api.jpl.nasa.gov/doc/horizons.html',
    status,
    lastSuccessfulRequest: providerTelemetry.lastSuccessfulRequest,
    cacheEntries: cache.size,
    cacheTtlSeconds: Math.round(DEFAULT_CACHE_TTL_MS / 1000),
    lastError: providerTelemetry.lastError,
    notes:
      'Queried via https://ssd.jpl.nasa.gov/api/horizons.api (Heliocentric Ecliptic J2000, AU-D). Unsupported or historical-only missions fall back to verified epoch or documented orbital models.',
  };
}
