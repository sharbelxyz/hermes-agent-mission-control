import { NextResponse } from "next/server";
import {
  collectHermesObservability,
  type HermesObservability,
  parseObservabilityWindow,
  type ObservabilityWindow,
} from "@/lib/langfuse-observability";

const CACHE_MS = 7000;

const cache = new Map<
  ObservabilityWindow,
  {
    expiresAt: number;
    payload: HermesObservability;
    cachedAt: number;
  }
>();

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Failed to collect Hermes observability.";
}

function cacheHeaders(cachedAt: number | null, extra?: HeadersInit) {
  return {
    ...(extra ?? {}),
    "X-Cache-Age": cachedAt == null ? "0" : String(Math.max(0, Date.now() - cachedAt)),
  };
}

/**
 * GET /api/hermes/observability
 * 
 * Query params:
 *   - window: "24h" or "7d" (default: "24h")
 * 
 * Response headers:
 *   - X-Cache-Age: milliseconds since cached snapshot was created
 *   - X-Cache-Stale: "1" if data is older than CACHE_MS and being served from fallback
 *   - X-Cache-Error: error message that caused fallback to cached data
 * 
 * Resilience strategy:
 *   1. Return fresh data if available and within CACHE_MS
 *   2. On collection error, return stale cached data (if available) with X-Cache-Stale header
 *   3. If no cached data exists, return 502 with error details and optional lastGoodSnapshot field
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const window = parseObservabilityWindow(url.searchParams.get("window") ?? "24h");

  if (!window) {
    return NextResponse.json(
      { error: "Invalid window. Use 24h or 7d." },
      { status: 400 },
    );
  }

  const now = Date.now();
  const cached = cache.get(window);
  
  // Return cached data if still within TTL
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached.payload, {
      headers: cacheHeaders(cached.cachedAt),
    });
  }

  try {
    // Attempt fresh collection
    const payload = await collectHermesObservability(window);
    const cachedAt = Date.now();
    
    // Update cache with new snapshot
    cache.set(window, {
      expiresAt: cachedAt + CACHE_MS,
      payload,
      cachedAt,
    });

    return NextResponse.json(payload, {
      headers: cacheHeaders(cachedAt),
    });
  } catch (error) {
    // Collection failed — fallback to stale cache or error response
    const message = errorMessage(error);
    
    if (cached) {
      // Fallback: return stale cached data with warning headers
      return NextResponse.json(cached.payload, {
        headers: cacheHeaders(cached.cachedAt, {
          "X-Cache-Stale": "1",
          "X-Cache-Error": message,
        }),
      });
    }

    // No fallback available — return error with optional lastGoodSnapshot
    return NextResponse.json(
      {
        error: message,
        lastGoodSnapshot: null,
      },
      {
        status: 502,
        headers: cacheHeaders(null),
      },
    );
  }
}
