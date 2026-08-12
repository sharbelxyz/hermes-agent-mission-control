import { NextResponse } from "next/server";
import {
  collectHermesObservability,
  type HermesObservability,
  parseObservabilityWindow,
  type ObservabilityWindow,
} from "@/lib/langfuse-observability";

const CACHE_MS = 7000;
const REQUEST_TIMEOUT_MS = 30000; // 30s: allow slower 7d window collection to complete

const cache = new Map<
  ObservabilityWindow,
  {
    expiresAt: number;
    payload: HermesObservability;
  }
>();

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS_HEADERS });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const window = parseObservabilityWindow(
      url.searchParams.get("window") ?? "24h"
    );

    if (!window) {
      return NextResponse.json(
        { error: "Invalid window. Use 24h or 7d.", status: "error" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const now = Date.now();
    const cached = cache.get(window);
    if (cached && cached.expiresAt > now) {
      return NextResponse.json(cached.payload, { headers: CORS_HEADERS });
    }

    // Wrap collectHermesObservability with timeout, but return cached data on timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let payload: HermesObservability;
    try {
      payload = await Promise.race([
        collectHermesObservability(window),
        new Promise<HermesObservability>((_, reject) =>
          controller.signal.addEventListener("abort", () =>
            reject(new Error("OBSERVABILITY_TIMEOUT"))
          )
        ),
      ]);
    } catch (collectionError) {
      clearTimeout(timeoutId);
      
      // If we have stale cached data, return it instead of failing
      if (cached && cached.expiresAt <= now) {
        return NextResponse.json(cached.payload, { headers: CORS_HEADERS });
      }
      
      // If no cached data, re-throw the error
      throw collectionError;
    }
    
    clearTimeout(timeoutId);

    cache.set(window, {
      expiresAt: now + CACHE_MS,
      payload,
    });

    return NextResponse.json(payload, { headers: CORS_HEADERS });
  } catch (error) {
    console.error("[observability] Error collecting observability:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Return a structured error response that the client can handle
    return NextResponse.json(
      {
        status: "error",
        error: errorMessage,
        health: { status: "error", message: errorMessage },
        health_summary: {
          status: "error",
          ok: false,
          liveController: false,
          traceRunning: false,
        },
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
