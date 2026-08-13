import { NextResponse } from "next/server";
import {
  collectHermesObservability,
  type HermesObservability,
  parseObservabilityWindow,
  type ObservabilityWindow,
} from "@/lib/langfuse-observability";

// Window-specific timeout and collection limits
const WINDOW_CONFIG: Record<ObservabilityWindow, {
  timeoutMs: number;
  maxPages: number;
  maxRows: number;
}> = {
  "24h": {
    timeoutMs: 10000,   // 10s for 24h: faster query
    maxPages: 5,        // Limit to 5 pages
    maxRows: 5000,      // Limit to 5000 rows
  },
  "7d": {
    timeoutMs: 5000,    // 5s for 7d: ultra-fast collection with safety margin
    maxPages: 1,        // Single page only: no pagination overhead
    maxRows: 1000,      // Minimal rows: 1000 max for fast aggregation
  },
};

const CACHE_MS = 7000;
const REQUEST_TIMEOUT_MS = 12000; // 12s hard timeout on HTTP request

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

    // Get window-specific config
    const config = WINDOW_CONFIG[window];

    // Wrap collectHermesObservability with window-specific timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let payload: HermesObservability;
    try {
      payload = await Promise.race([
        collectHermesObservability(window, {
          maxPages: config.maxPages,
          maxRows: config.maxRows,
          timeoutMs: config.timeoutMs,
        }),
        new Promise<HermesObservability>((_, reject) =>
          controller.signal.addEventListener("abort", () =>
            reject(new Error("REQUEST_TIMEOUT"))
          )
        ),
      ]);
    } catch (collectionError) {
      clearTimeout(timeoutId);
      
      // If we have stale cached data, return it instead of failing
      if (cached && cached.expiresAt <= now) {
        return NextResponse.json(cached.payload, { headers: CORS_HEADERS });
      }
      
      // If no cached data, return a degraded but valid response
      const errorMessage =
        collectionError instanceof Error ? collectionError.message : "Unknown error";
      
      // Return a partial/degraded response that still provides structure
      const now_iso = new Date().toISOString();
      const degradedPayload: HermesObservability = (({
        status: "partial",
        error: errorMessage,
        source: {
          status: "warning",
          source: "langfuse",
          message: `Collection timeout after ${config.timeoutMs}ms - returning empty set`,
          warning: "Timeout occurred during data collection",
          lastSync: null,
          window,
          fromStartTime: now_iso,
          toStartTime: now_iso,
          rows: 0,
          filteredRows: 0,
          includedRows: 0,
          pages: 0,
          truncated: false,
        },
        health: {
          status: "warning",
          ok: false,
        },
        health_summary: {
          status: "warning",
          ok: false,
          liveController: false,
          traceRunning: false,
        },
        totals: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          reportedCost: 0,
          estimatedCost: null,
          effectiveCost: 0,
          costBasis: "local_zero",
          totalCost: 0,
          generationCalls: 0,
          toolCalls: 0,
          uniqueTraces: 0,
          uniqueSessions: 0,
          errors: 0,
          latestTimestamp: null,
        },
        byModel: [],
        byProvider: [],
        completeness: null,
        timeSeries: {} as any,
        correlationCoverage: { status: "missing", totalObservations: 0, eligibleObservations: 0, withOperationId: 0, withGoalId: 0, withRunId: 0, withStageId: 0, invalidIdentifierObservations: 0, fullyCorrelatedObservations: 0, operationCount: 0, fullyCorrelatedOperations: 0, percentage: null },
        operations: [],
        accounting: { operationCount: 0, rowCap: 0, returnedOperations: 0, truncatedOperations: false, reportedCost: 0, estimatedCost: null, effectiveCost: 0, costBasis: "local_zero", reconciliation: "missing", warnings: [] },
        graftCohort: { status: "missing", signalObservations: 0, signalOperations: 0, graft: { platform: "unknown", provider: "unknown", model: "unknown", cost: { low: 0, high: 0, basis: "unknown" }, generation: { tokens: { low: 0, high: 0 }, calls: { low: 0, high: 0 } }, tokenDist: [], toolCalls: [] }, baseline: { platform: "unknown", provider: "unknown", model: "unknown", cost: { low: 0, high: 0, basis: "unknown" }, generation: { tokens: { low: 0, high: 0 }, calls: { low: 0, high: 0 } }, tokenDist: [], toolCalls: [] }, delta: { costPercentChange: null, tokensPercentChange: null, toolsAdded: [], toolsRemoved: [] } },
        workflow: null,
        amplification: null,
        sessions: [],
        tools: { recent: [], repeated: [] },
        topExpensiveTraces: [],
        topLargeTraces: [],
        wasteFlags: [],
        recommendations: [],
        observationsByTrace: {},
        traceCount: 0,
        sessionCount: 0,
        // Mark as partial so consumers know this is degraded
        isPartial: true,
        partialReason: "Collection timeout - returning empty set",
      } as any)) as HermesObservability;
      
      return NextResponse.json(degradedPayload, { status: 200, headers: CORS_HEADERS });
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
