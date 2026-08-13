import { readDataStore } from "./hermes-native-mirror";

type Status = "ok" | "warning" | "error";

type RunsPayload = {
  index?: Array<{ goal?: string }>;
  graphs?: Record<string, unknown>;
  syncedAt?: string;
};

export interface GraphRagObservability {
  status: Status;
  source: "hermes-runs";
  key: "hermes-runs";
  checkedAt: string;
  syncedAt: string | null;
  stale: boolean;
  ageMs: number | null;
  indexCount: number;
  graphCount: number;
  coveragePct: number;
  missingGraphs: number;
  message: string;
}

const DEFAULT_STALE_MS = 5 * 60_000;

export function buildGraphRagObservability(payload: RunsPayload | null, now = new Date()): GraphRagObservability {
  const checkedAt = now.toISOString();
  if (!payload) {
    return {
      status: "error",
      source: "hermes-runs",
      key: "hermes-runs",
      checkedAt,
      syncedAt: null,
      stale: true,
      ageMs: null,
      indexCount: 0,
      graphCount: 0,
      coveragePct: 0,
      missingGraphs: 0,
      message: "GraphRAG unavailable: hermes-runs payload missing",
    };
  }

  const index = Array.isArray(payload.index) ? payload.index : [];
  const graphCount = payload.graphs && typeof payload.graphs === "object"
    ? Object.keys(payload.graphs).length
    : 0;
  const indexCount = index.length;
  const missingGraphs = Math.max(0, indexCount - graphCount);
  const coveragePct = indexCount > 0 ? Math.round((Math.min(graphCount, indexCount) / indexCount) * 100) : 0;

  const syncedAt = safeIso(payload.syncedAt);
  const ageMs = syncedAt ? Math.max(0, now.getTime() - Date.parse(syncedAt)) : null;
  const stale = ageMs == null || ageMs > staleMs();

  let status: Status = "ok";
  let message = "GraphRAG healthy";

  if (indexCount === 0) {
    status = stale ? "error" : "warning";
    message = stale
      ? "GraphRAG unavailable: run index missing and payload is stale"
      : "GraphRAG warning: run index is empty";
  } else if (graphCount === 0) {
    status = stale ? "error" : "warning";
    message = stale
      ? "GraphRAG unavailable: no run graphs and payload is stale"
      : "GraphRAG warning: no run graphs indexed yet";
  } else if (stale || coveragePct < 80) {
    status = "warning";
    message = stale
      ? `GraphRAG warning: stale mirror (${Math.round((ageMs ?? 0) / 1000)}s old)`
      : `GraphRAG warning: partial graph coverage (${coveragePct}%)`;
  }

  return {
    status,
    source: "hermes-runs",
    key: "hermes-runs",
    checkedAt,
    syncedAt,
    stale,
    ageMs,
    indexCount,
    graphCount,
    coveragePct,
    missingGraphs,
    message,
  };
}

export async function collectGraphRagObservability(now = new Date()): Promise<GraphRagObservability> {
  const payload = await readDataStore<RunsPayload>("hermes-runs").catch(() => null);
  return buildGraphRagObservability(payload, now);
}

function staleMs() {
  const parsed = Number(process.env.HERMES_BRIDGE_STALE_MS ?? DEFAULT_STALE_MS);
  return Number.isFinite(parsed) && parsed >= 10_000 ? parsed : DEFAULT_STALE_MS;
}

function safeIso(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
