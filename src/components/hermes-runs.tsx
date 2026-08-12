"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FlaskConical,
  Gauge,
  Layers3,
  Link2,
  LineChart,
  ListChecks,
} from "lucide-react";
import { Panel, SectionHeader, Pill, EmptyState, Eyebrow } from "@/components/ui/kit";
import type {
  AccountingSummary,
  CorrelationCoverage,
  CorrelationStatus,
  OperationAggregate as OperationUsage,
} from "@/lib/langfuse-observability";

// ── Types ─────────────────────────────────────────────────
type RunStatus =
  | "queued"
  | "awaiting_approval"
  | "approved"
  | "running"
  | "done"
  | "failed"
  | "rejected";

interface Req {
  id: string;
  origin: string;
  kind: string;
  title: string;
  prompt: string | null;
  sideEffecting: boolean;
  status: RunStatus;
  result: string | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

type ObservabilityWindow = "24h" | "7d";
type ValueState = "known" | "partial" | "unknown";
type CostBasis =
  | "anthropic_claude_opus_4_6_estimate_cache_write_5m_assumed"
  | "local_zero"
  | "reported_only_unknown_cloud"
  | "reported_only_unknown"
  | "mixed";

interface CostRange {
  low: number;
  high: number;
  basis: string;
}

interface SourceHealth {
  status: "ok" | "warning" | "error";
  message: string;
  warning?: string;
  lastSync: string | null;
  window: ObservabilityWindow;
  rows: number;
  filteredRows: number;
  includedRows: number;
  truncated: boolean;
}

interface ObservabilityTotals {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reportedCost: number;
  estimatedCost: number | null;
  effectiveCost: number;
  costBasis: CostBasis;
  estimatedCostRange?: CostRange;
  totalCost: number;
  generationCalls: number;
  toolCalls: number;
  uniqueTraces: number;
  uniqueSessions: number;
  errors: number;
  latestTimestamp: string | null;
}

interface ModelUsage {
  model: string;
  provider: string | null;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reportedCost: number;
  estimatedCost: number | null;
  effectiveCost: number;
  costBasis: CostBasis;
  estimatedCostRange?: CostRange;
  cost: number;
}

interface SessionTrace {
  id: string;
  sessionId: string | null;
  traceId: string | null;
  parentObservationIds: string[];
  startTime: string | null;
  endTime: string | null;
  durationMs: number | null;
  models: string[];
  provider: string | null;
  platform: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reportedCost: number;
  estimatedCost: number | null;
  effectiveCost: number;
  costBasis: CostBasis;
  tokenState: ValueState;
  costState: ValueState;
  estimatedCostRange?: CostRange;
  cost: number;
  toolCallCount: number;
  errorCount: number;
  status: "ok" | "error";
  latestTimestamp: string | null;
}

interface ObservabilityCompleteness {
  sessionRows: number;
  missingSessionIdRows: number;
  missingTraceIdRows: number;
  unknownTokenRows: number;
  unknownCostRows: number;
  partialCostRows: number;
  parentEdges: number;
  logicalRootCount: number;
  includedObservations: number;
}

interface ToolUsage {
  name: string;
  count: number;
  latestTimestamp: string | null;
}

interface WorkflowSummary {
  langGraphDetected: boolean;
  message: string;
  observationTypes: Record<string, number>;
  parentEdges: number;
  rootNodes: number;
  modelGenerations: number;
  toolCalls: number;
  errorNodes: number;
  avgLatencyMs: number | null;
  maxLatencyMs: number | null;
}

interface ProviderUsage {
  provider: string;
  modelClass: "local" | "cloud" | "unknown";
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reportedCost: number;
  estimatedCost: number | null;
  effectiveCost: number;
  costBasis: CostBasis;
  estimatedCostRange?: CostRange;
  cost: number;
}

interface AmplificationMetrics {
  inputOutputRatio: number | null;
  contextAmplification: number | null;
  cacheReadRatio: number | null;
  cacheWriteRatio: number | null;
  deterministicFlags: string[];
}

interface WasteFlag {
  kind: "largest_token_session" | "repeated_tool" | "high_input_output_ratio";
  severity: "warn" | "down";
  label: string;
  detail: string;
  sessionId?: string | null;
  traceId?: string | null;
}

interface Observability {
  source: SourceHealth;
  totals: ObservabilityTotals | null;
  completeness: ObservabilityCompleteness | null;
  byModel: ModelUsage[];
  byProvider: ProviderUsage[];
  correlationCoverage: CorrelationCoverage;
  operations: OperationUsage[];
  accounting: AccountingSummary;
  workflow: WorkflowSummary | null;
  amplification: AmplificationMetrics | null;
  sessions: SessionTrace[];
  tools: {
    recent: ToolUsage[];
    repeated: ToolUsage[];
  };
  topExpensiveTraces: SessionTrace[];
  topLargeTraces: SessionTrace[];
  wasteFlags: WasteFlag[];
  recommendations: string[];
}

interface ResourceHealth {
  status: "ok" | "unavailable" | "error";
  message: string;
  rows: number;
  pages: number;
  truncated: boolean;
  checkedAt: string | null;
}

interface ScoreAggregate {
  key: string;
  name: string;
  source: "API" | "ANNOTATION" | "EVAL" | "UNKNOWN";
  dataType: "NUMERIC" | "BOOLEAN" | "CATEGORICAL" | "TEXT" | "UNKNOWN";
  count: number;
  targetCount: number;
  latestTimestamp: string | null;
  numeric: { avg: number; min: number; max: number } | null;
  boolean: { trueCount: number; falseCount: number; trueRate: number | null } | null;
  categorical: Array<{ value: string; count: number }>;
  textCount: number;
  langfusePath: string | null;
}

interface PromptRegistryEntry {
  key: string;
  name: string;
  family: string | null;
  type: string | null;
  version: number | string | null;
  hash: string | null;
  labels: string[];
  createdAt: string | null;
  updatedAt: string | null;
  usageCount: number | null;
  linkedScoreNames: string[];
  langfusePath: string | null;
}

interface EvaluatorStatus {
  key: string;
  name: string;
  type: string | null;
  status: "available" | "unavailable";
  sampling: string | null;
  scoreName: string | null;
  latestTimestamp: string | null;
}

interface DatasetStatus {
  key: string;
  name: string;
  itemCount: number | null;
  latestTimestamp: string | null;
  langfusePath: string | null;
}

interface ExperimentStatus {
  key: string;
  name: string;
  datasetName: string | null;
  status: string | null;
  latestTimestamp: string | null;
  langfusePath: string | null;
}

interface EvaluationControl {
  source: {
    status: "ok" | "unavailable" | "error";
    window: ObservabilityWindow;
    message: string;
    checkedAt: string;
  };
  scores: {
    health: ResourceHealth;
    data: {
      aggregates: ScoreAggregate[];
      totalScores: number;
      uniqueTargets: number;
      traceTargets: number;
      sessionTargets: number;
      observationTargets: number;
      datasetRunTargets: number;
    };
  };
  prompts: {
    health: ResourceHealth;
    data: {
      prompts: PromptRegistryEntry[];
      families: number;
      versions: number;
    };
  };
  evaluators: { health: ResourceHealth; data: EvaluatorStatus[] };
  datasets: { health: ResourceHealth; data: DatasetStatus[] };
  experiments: { health: ResourceHealth; data: ExperimentStatus[] };
}

// ── Helpers ───────────────────────────────────────────────
function timeAgo(d: string | null): string {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  if (Number.isNaN(diff)) return "—";
  const s = Math.floor(diff / 1000);
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

function duration(start: string | null, finish: string | null): string {
  if (!start || !finish) return "—";
  const ms = new Date(finish).getTime() - new Date(start).getTime();
  if (Number.isNaN(ms) || ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const totalS = Math.round(ms / 1000);
  const m = Math.floor(totalS / 60);
  const s = totalS % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return n.toLocaleString("en-US");
}

function fmtKnownTokens(n: number, state: ValueState | undefined): string {
  if (state === "unknown") return "Unknown";
  const suffix = state === "partial" ? " +" : "";
  return `${fmtTokens(n)}${suffix}`;
}

function fmtUsd(n: number): string {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: n < 100 ? 2 : 0,
    maximumFractionDigits: n < 100 ? 2 : 0,
  })}`;
}

function fmtKnownUsd(n: number, state: ValueState | undefined): string {
  if (state === "unknown") return "Unknown";
  const suffix = state === "partial" ? " +" : "";
  return `${fmtUsd(n)}${suffix}`;
}

function fmtDurationMs(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const totalS = Math.round(ms / 1000);
  const m = Math.floor(totalS / 60);
  const s = totalS % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function fmtRatio(value: number | null): string {
  return value == null ? "—" : `${value}x`;
}

function fmtPct(value: number | null): string {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

function fmtCostBasis(value: CostBasis | undefined): string {
  switch (value) {
    case "anthropic_claude_opus_4_6_estimate_cache_write_5m_assumed":
      return "Anthropic estimate; cache writes assumed 5m";
    case "local_zero":
      return "Local zero estimate";
    case "reported_only_unknown_cloud":
      return "Unknown cloud pricing; Langfuse reported only";
    case "reported_only_unknown":
      return "Unknown pricing; reported only";
    case "mixed":
      return "Mixed cost bases";
    default:
      return "Cost basis unavailable";
  }
}

function fmtCoverageStatus(status: CorrelationStatus | undefined): string {
  switch (status) {
    case "observed":
      return "Observed";
    case "partial":
      return "Partial";
    case "invalid":
      return "Invalid";
    case "missing":
      return "Missing";
    default:
      return "Loading";
  }
}

function coverageTone(status: CorrelationStatus | undefined): Tone {
  switch (status) {
    case "observed":
      return "up";
    case "partial":
      return "warn";
    case "invalid":
      return "down";
    case "missing":
      return "neutral";
    default:
      return "neutral";
  }
}

function fmtRunRate(total: number, window: ObservabilityWindow | undefined): string {
  const days = window === "7d" ? 7 : 1;
  return `${fmtUsd((total / days) * 30)} / 30d`;
}

function shortId(id: string | null): string {
  if (!id) return "—";
  if (id.length <= 13) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function knownOrUnknown(value: string | null | undefined): string {
  return value || "Unknown";
}

function resourceTone(status: ResourceHealth["status"] | undefined): Tone {
  if (status === "ok") return "up";
  if (status === "error") return "down";
  return "warn";
}

function scoreValue(score: ScoreAggregate): string {
  if (score.numeric) return `avg ${score.numeric.avg}`;
  if (score.boolean) return `${Math.round((score.boolean.trueRate ?? 0) * 100)}% true`;
  if (score.categorical[0]) return `${score.categorical[0].value} ×${score.categorical[0].count}`;
  if (score.textCount) return `${score.textCount} text values hidden`;
  return "No aggregate";
}

async function getJSON<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const on = () => setReduce(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduce;
}

// ── Status → tone / dot ───────────────────────────────────
type Tone = "neutral" | "up" | "down" | "warn" | "accent";
const STATUS_TONE: Record<RunStatus, Tone> = {
  queued: "neutral",
  awaiting_approval: "warn",
  approved: "accent",
  running: "accent",
  done: "up",
  failed: "down",
  rejected: "neutral",
};
const STATUS_LABEL: Record<RunStatus, string> = {
  queued: "Queued",
  awaiting_approval: "Awaiting approval",
  approved: "Approved",
  running: "Running",
  done: "Done",
  failed: "Failed",
  rejected: "Rejected",
};
function toneVar(t: Tone): string {
  return t === "neutral" ? "var(--text-3)" : `var(--${t})`;
}

// ── Status dot ────────────────────────────────────────────
function StatusDot({ status, reduce }: { status: RunStatus; reduce: boolean }) {
  const tone = STATUS_TONE[status];
  const color = toneVar(tone);
  const pulse = status === "running" && !reduce;
  return (
    <span className="relative flex w-1.5 h-1.5 shrink-0">
      {pulse && (
        <span
          className="absolute inline-flex h-full w-full rounded-full animate-ping"
          style={{ background: `color-mix(in srgb, ${color} 60%, transparent)` }}
        />
      )}
      <span
        className="relative inline-flex w-1.5 h-1.5 rounded-full"
        style={{ background: color }}
      />
    </span>
  );
}

// ── Langfuse observability ────────────────────────────────
function SourceBadge({ source }: { source: SourceHealth | null }) {
  const status = source?.status ?? "warning";
  const tone = status === "ok" ? "up" : status === "error" ? "down" : "warn";
  const Icon = status === "ok" ? CheckCircle2 : AlertTriangle;
  const label =
    status === "ok"
      ? "Langfuse live"
      : status === "error"
        ? "Langfuse warning"
        : "Langfuse capped";

  return (
    <Pill tone={tone} className="!py-1">
      <Icon className="w-3 h-3" />
      {label}
      {source?.lastSync && (
        <span className="num text-[10px] text-[var(--text-3)]">
          {timeAgo(source.lastSync)}
        </span>
      )}
    </Pill>
  );
}

function WindowToggle({
  value,
  onChange,
}: {
  value: ObservabilityWindow;
  onChange: (value: ObservabilityWindow) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-[var(--line)] p-0.5">
      {(["24h", "7d"] as const).map((window) => {
        const active = value === window;
        return (
          <button
            key={window}
            type="button"
            onClick={() => onChange(window)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
              active
                ? "bg-[var(--surface-2)] text-[var(--text)]"
                : "text-[var(--text-3)] hover:text-[var(--text-2)]"
            }`}
          >
            {window}
          </button>
        );
      })}
    </div>
  );
}

function MetricBlock({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <Eyebrow>{label}</Eyebrow>
      <div className="num font-semibold text-[24px] sm:text-[26px] tracking-[-0.02em] text-[var(--text)] leading-none mt-2">
        {value}
      </div>
      {sub && <div className="num text-[11px] text-[var(--text-3)] mt-1.5 truncate">{sub}</div>}
    </div>
  );
}

function ObservabilityOverview({ data }: { data: Observability | null }) {
  const totals = data?.totals ?? null;
  const completeness = data?.completeness ?? null;
  const byModel = data?.byModel ?? [];
  const max = byModel.reduce((mx, model) => Math.max(mx, model.totalTokens, model.effectiveCost), 0) || 1;
  const sourceWarning = data?.source.warning;
  const filteredRows = data?.source.filteredRows ?? 0;

  if (!data) {
    return (
      <Panel className="p-5">
        <p className="text-[13px] text-[var(--text-3)] flex items-center gap-2">
          <Gauge className="w-3.5 h-3.5" />
          Syncing Langfuse observations…
        </p>
      </Panel>
    );
  }

  return (
    <Panel className="p-5">
      {sourceWarning && (
        <div className="mb-4 flex items-start gap-2 rounded-[8px] border border-[color-mix(in_srgb,var(--warn)_24%,transparent)] bg-[color-mix(in_srgb,var(--warn)_8%,transparent)] p-3 text-[12.5px] text-[var(--text-2)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--warn)]" />
          <span>{sourceWarning}</span>
        </div>
      )}
      {filteredRows > 0 && (
        <div className="mb-4 rounded-[8px] border border-[var(--line)] bg-[var(--surface-2)] p-3 text-[12px] text-[var(--text-3)]">
          Filtered {filteredRows} synthetic/test Langfuse row{filteredRows === 1 ? "" : "s"} from operator totals.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricBlock
          label="Total tokens"
          value={totals ? fmtTokens(totals.totalTokens) : "—"}
          sub={totals ? `${fmtTokens(totals.inputTokens)} in · ${fmtTokens(totals.outputTokens)} out` : undefined}
        />
        <MetricBlock
          label="Effective cloud cost"
          value={totals ? fmtUsd(totals.effectiveCost) : "—"}
          sub={totals ? `${fmtRunRate(totals.effectiveCost, data.source.window)} run-rate` : undefined}
        />
        <MetricBlock
          label="Langfuse reported"
          value={totals ? fmtUsd(totals.reportedCost) : "—"}
          sub={totals ? fmtCostBasis(totals.costBasis) : undefined}
        />
        <MetricBlock
          label="Traces / sessions"
          value={totals ? `${totals.uniqueTraces} / ${totals.uniqueSessions}` : "—"}
          sub={totals?.latestTimestamp ? `latest ${timeAgo(totals.latestTimestamp)}` : undefined}
        />
      </div>
      {completeness && (
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-[var(--line)] pt-4 lg:grid-cols-4">
          <MetricBlock
            label="Missing session IDs"
            value={`${completeness.missingSessionIdRows}/${completeness.sessionRows}`}
            sub="opaque session grouping"
          />
          <MetricBlock
            label="Unknown tokens"
            value={`${completeness.unknownTokenRows}`}
            sub="rows without token evidence"
          />
          <MetricBlock
            label="Unknown cost"
            value={`${completeness.unknownCostRows}`}
            sub={completeness.partialCostRows ? `${completeness.partialCostRows} partial` : "cost evidence gaps"}
          />
          <MetricBlock
            label="Logical roots"
            value={`${completeness.logicalRootCount}`}
            sub={`${completeness.parentEdges} parent edges`}
          />
        </div>
      )}
      {totals?.estimatedCostRange && (
        <p className="mt-3 text-[11.5px] text-[var(--text-3)]">
          Estimated range {fmtUsd(totals.estimatedCostRange.low)}–{fmtUsd(totals.estimatedCostRange.high)}. {totals.estimatedCostRange.basis}
        </p>
      )}

      {byModel.length > 0 && (
        <div className="mt-5 pt-4 border-t border-[var(--line)] flex flex-col gap-2.5">
          <Eyebrow>By model</Eyebrow>
          {byModel.map((model) => {
            const pct = Math.max(3, Math.round((model.totalTokens / max) * 100));
            return (
              <div key={model.model} className="grid grid-cols-[minmax(92px,180px)_1fr_auto] items-center gap-3">
                <div className="min-w-0">
                  <span className="block text-[12px] text-[var(--text-2)] truncate">
                    {model.model}
                  </span>
                  {model.provider && (
                    <span className="block text-[10.5px] text-[var(--text-3)] truncate">
                      {model.provider}
                    </span>
                  )}
                </div>
                <div className="h-[6px] rounded-full bg-[var(--surface-2)] overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      background: "color-mix(in srgb, var(--accent) 70%, transparent)",
                    }}
                  />
                </div>
                <span className="num text-[11px] text-[var(--text-3)] shrink-0 text-right">
                  {fmtTokens(model.totalTokens)} · {fmtUsd(model.effectiveCost)}
                </span>
                <span className="col-span-3 -mt-2 truncate text-[10.5px] text-[var(--text-4)]">
                  reported {fmtUsd(model.reportedCost)} · {fmtCostBasis(model.costBasis)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function ScoreCoveragePanel({
  observability,
  control,
}: {
  observability: Observability | null;
  control: EvaluationControl | null;
}) {
  const scores = control?.scores.data;
  const traces = observability?.totals?.uniqueTraces ?? 0;
  const coverage = traces > 0 && scores ? Math.round((scores.traceTargets / traces) * 100) : null;
  return (
    <Panel className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Eyebrow>Score coverage</Eyebrow>
          <h3 className="mt-1 text-[16px] font-semibold text-[var(--text)]">Evaluated evidence</h3>
        </div>
        <Pill tone={resourceTone(control?.scores.health.status)} className="!py-0.5 !text-[10px]">
          {control?.scores.health.status ?? "loading"}
        </Pill>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-4">
        <MetricBlock label="Scores" value={scores ? String(scores.totalScores) : "—"} />
        <MetricBlock label="Targets" value={scores ? String(scores.uniqueTargets) : "—"} />
        <MetricBlock label="Trace coverage" value={coverage == null ? "Unknown" : `${coverage}%`} />
        <MetricBlock label="Session scores" value={scores ? String(scores.sessionTargets) : "—"} />
      </div>
      <p className="mt-4 text-[12px] leading-snug text-[var(--text-3)]">
        Score comments and judge reasoning are intentionally hidden; only score metadata and aggregates are returned.
      </p>
    </Panel>
  );
}

function WasteFlags({ flags, tools }: { flags: WasteFlag[]; tools: ToolUsage[] }) {
  return (
    <Panel className="p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Eyebrow>Waste signals</Eyebrow>
          <h3 className="mt-1 text-[16px] font-semibold text-[var(--text)]">Token pressure</h3>
        </div>
        <AlertTriangle className="h-4 w-4 text-[var(--text-3)]" />
      </div>

      {flags.length === 0 ? (
        <p className="mt-4 text-[12.5px] text-[var(--text-3)]">No deterministic waste flags in this window.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {flags.map((flag) => (
            <div
              key={`${flag.kind}:${flag.detail}:${flag.sessionId ?? flag.traceId ?? ""}`}
              className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-2)] p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12.5px] font-medium text-[var(--text)]">{flag.label}</span>
                <Pill tone={flag.severity} className="!py-0.5 !text-[10px]">
                  {flag.severity === "down" ? "high" : "watch"}
                </Pill>
              </div>
              <p className="mt-1 text-[12px] text-[var(--text-2)]">{flag.detail}</p>
              {(flag.sessionId || flag.traceId) && (
                <p className="num mt-1 text-[10.5px] text-[var(--text-3)]">
                  {flag.sessionId ? `session ${shortId(flag.sessionId)}` : `trace ${shortId(flag.traceId ?? null)}`}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {tools.length > 0 && (
        <div className="mt-5 pt-4 border-t border-[var(--line)]">
          <Eyebrow>Recent tools</Eyebrow>
          <div className="mt-3 flex flex-wrap gap-2">
            {tools.slice(0, 8).map((tool) => (
              <span
                key={tool.name}
                className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[11px] text-[var(--text-2)]"
              >
                {tool.name}
                <span className="num ml-1 text-[var(--text-3)]">×{tool.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

function WorkflowObservability({ data }: { data: Observability | null }) {
  const workflow = data?.workflow ?? null;
  const amplification = data?.amplification ?? null;
  const providers = data?.byProvider ?? [];
  const recommendations = data?.recommendations ?? [];
  const typeEntries = Object.entries(workflow?.observationTypes ?? {}).slice(0, 8);
  const splitMax = providers.reduce((max, provider) => Math.max(max, provider.totalTokens, provider.effectiveCost), 0) || 1;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
      <Panel className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Eyebrow>Workflow graph</Eyebrow>
            <h3 className="mt-1 text-[16px] font-semibold text-[var(--text)]">
              {workflow?.message ?? "Langfuse workflow loading"}
            </h3>
          </div>
          <Pill tone={workflow?.langGraphDetected ? "up" : "neutral"} className="!py-0.5 !text-[10px]">
            {workflow?.langGraphDetected ? "LangGraph" : "not LangGraph"}
          </Pill>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-5">
          <MetricBlock label="Generations" value={workflow ? String(workflow.modelGenerations) : "—"} />
          <MetricBlock label="Tools" value={workflow ? String(workflow.toolCalls) : "—"} />
          <MetricBlock label="Errors" value={workflow ? String(workflow.errorNodes) : "—"} />
          <MetricBlock label="Parent edges" value={workflow ? String(workflow.parentEdges) : "—"} />
          <MetricBlock label="Max latency" value={workflow ? fmtDurationMs(workflow.maxLatencyMs) : "—"} />
        </div>

        {typeEntries.length > 0 && (
          <div className="mt-5 border-t border-[var(--line)] pt-4">
            <Eyebrow>Observation types</Eyebrow>
            <div className="mt-3 flex flex-wrap gap-2">
              {typeEntries.map(([type, count]) => (
                <span key={type} className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[11px] text-[var(--text-2)]">
                  {type}<span className="num ml-1 text-[var(--text-3)]">×{count}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </Panel>

      <Panel className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Eyebrow>Routing &amp; context</Eyebrow>
            <h3 className="mt-1 text-[16px] font-semibold text-[var(--text)]">Amplification pressure</h3>
          </div>
          <Pill tone={(amplification?.deterministicFlags.length ?? 0) > 0 ? "warn" : "up"} className="!py-0.5 !text-[10px]">
            {amplification?.deterministicFlags.length ?? 0} flags
          </Pill>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4">
          <MetricBlock label="Input/output" value={fmtRatio(amplification?.inputOutputRatio ?? null)} />
          <MetricBlock label="Cache read" value={fmtPct(amplification?.cacheReadRatio ?? null)} />
          <MetricBlock label="Cache write" value={fmtPct(amplification?.cacheWriteRatio ?? null)} />
          <MetricBlock label="Context amp" value={fmtRatio(amplification?.contextAmplification ?? null)} />
        </div>

        {providers.length > 0 && (
          <div className="mt-5 border-t border-[var(--line)] pt-4">
            <Eyebrow>Cloud / local split</Eyebrow>
            <div className="mt-3 flex flex-col gap-2.5">
              {providers.slice(0, 5).map((provider) => {
                const pct = Math.max(3, Math.round((provider.totalTokens / splitMax) * 100));
                return (
                  <div key={provider.provider} className="grid grid-cols-[92px_1fr_auto] items-center gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] text-[var(--text-2)]">{provider.provider}</p>
                      <p className="text-[10.5px] text-[var(--text-3)]">{provider.modelClass}</p>
                    </div>
                    <div className="h-[6px] overflow-hidden rounded-full bg-[var(--surface-2)]">
                      <div className="h-full rounded-full bg-[color-mix(in_srgb,var(--accent)_70%,transparent)]" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="num text-right text-[11px] text-[var(--text-3)]">
                      {fmtTokens(provider.totalTokens)} · {fmtUsd(provider.effectiveCost)}
                    </span>
                    <span className="col-span-3 -mt-2 truncate text-[10.5px] text-[var(--text-4)]">
                      reported {fmtUsd(provider.reportedCost)} · {fmtCostBasis(provider.costBasis)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {recommendations.length > 0 && (
          <div className="mt-5 border-t border-[var(--line)] pt-4">
            <Eyebrow>Recommendations</Eyebrow>
            <div className="mt-3 flex flex-col gap-2">
              {recommendations.map((recommendation) => (
                <p key={recommendation} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-2)] p-2.5 text-[12px] leading-snug text-[var(--text-2)]">
                  {recommendation}
                </p>
              ))}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

function CorrelationAccounting({
  data,
  loaded,
}: {
  data: Observability | null;
  loaded: boolean;
}) {
  const coverage = data?.correlationCoverage ?? null;
  const accounting = data?.accounting ?? null;
  const operations = data?.operations ?? [];
  const warnings = accounting?.warnings ?? [];
  const sourceDown = data?.source.status === "error";

  if (!loaded || !data) {
    return (
      <Panel className="p-2">
        <div className="sk h-72 m-1 rounded-[10px]" />
      </Panel>
    );
  }

  return (
    <Panel className="overflow-hidden p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Eyebrow>Correlation &amp; accounting</Eyebrow>
          <h3 className="mt-1 text-[16px] font-semibold text-[var(--text)]">
            Operation visibility
          </h3>
        </div>
        <Pill tone={coverageTone(coverage?.status)} className="w-fit !py-0.5 !text-[10px]">
          <Link2 className="h-3 w-3" />
          {fmtCoverageStatus(coverage?.status)}
        </Pill>
      </div>

      {(sourceDown || warnings.length > 0) && (
        <div className="mt-4 flex flex-col gap-2">
          {sourceDown && (
            <div className="flex items-start gap-2 rounded-[8px] border border-[color-mix(in_srgb,var(--down)_24%,transparent)] bg-[color-mix(in_srgb,var(--down)_8%,transparent)] p-3 text-[12.5px] text-[var(--text-2)]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--down)]" />
              <span>Langfuse is unavailable; operation accounting is not inferred.</span>
            </div>
          )}
          {warnings.map((warning) => (
            <div
              key={warning}
              className="flex items-start gap-2 rounded-[8px] border border-[color-mix(in_srgb,var(--warn)_24%,transparent)] bg-[color-mix(in_srgb,var(--warn)_8%,transparent)] p-3 text-[12.5px] text-[var(--text-2)]"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--warn)]" />
              <span>{warning}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricBlock
          label="Coverage"
          value={fmtPct(coverage?.percentage ?? null)}
          sub={
            coverage
              ? `${coverage.fullyCorrelatedObservations}/${coverage.eligibleObservations} fully correlated`
              : undefined
          }
        />
        <MetricBlock
          label="Operations"
          value={coverage ? String(coverage.operationCount) : "—"}
          sub={
            coverage
              ? `${coverage.withOperationId}/${coverage.eligibleObservations} with operation ID · ${coverage.fullyCorrelatedOperations} complete ops`
              : undefined
          }
        />
        <MetricBlock
          label="Effective cost"
          value={accounting ? fmtUsd(accounting.effectiveCost) : "—"}
          sub={accounting ? `reported ${fmtUsd(accounting.reportedCost)}` : undefined}
        />
        <MetricBlock
          label="Invalid IDs"
          value={coverage ? String(coverage.invalidIdentifierObservations) : "—"}
          sub={
            coverage
              ? `${coverage.withGoalId}/${coverage.eligibleObservations} goal · ${coverage.withRunId}/${coverage.eligibleObservations} run · ${coverage.withStageId}/${coverage.eligibleObservations} stage`
              : undefined
          }
        />
      </div>

      {accounting?.estimatedCost != null && (
        <p className="mt-3 text-[11.5px] text-[var(--text-3)]">
          Operation estimated {fmtUsd(accounting.estimatedCost)} · {fmtCostBasis(accounting.costBasis)}
        </p>
      )}

      {operations.length === 0 ? (
        <div className="mt-5 border-t border-[var(--line)] pt-4">
          <EmptyState
            icon={<Link2 className="w-6 h-6" />}
            title="No correlated operations"
            hint="Allowlisted operation metadata was not present in this Langfuse window."
          />
        </div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-[8px] border border-[var(--line)]">
          <div className="hidden md:grid grid-cols-[1.15fr_1fr_1fr_0.7fr_0.8fr_0.55fr_0.65fr] gap-3 border-b border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-2 text-[10.5px] uppercase tracking-[0.14em] text-[var(--text-4)]">
            <span>Operation</span>
            <span>Goal / run / stage</span>
            <span>Model</span>
            <span className="text-right">Tokens</span>
            <span className="text-right">Cost</span>
            <span className="text-right">Tools</span>
            <span className="text-right">Status</span>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {operations.map((operation) => (
              <div
                key={operation.operationId}
                className="grid gap-3 px-3.5 py-3 md:grid-cols-[1.15fr_1fr_1fr_0.7fr_0.8fr_0.55fr_0.65fr] md:items-center"
              >
                <div className="min-w-0">
                  <p className="num truncate text-[12.5px] text-[var(--text)]">
                    {shortId(operation.operationId)}
                  </p>
                  <p className="num mt-0.5 truncate text-[10.5px] text-[var(--text-3)]">
                    {operation.traceIds[0]
                      ? `trace ${shortId(operation.traceIds[0])}`
                      : operation.sessionIds[0]
                        ? `session ${shortId(operation.sessionIds[0])}`
                        : "no trace"}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="num truncate text-[12px] text-[var(--text-2)]">
                    {shortId(operation.goalId)}
                  </p>
                  <p className="num mt-0.5 truncate text-[10.5px] text-[var(--text-3)]">
                    {shortId(operation.runId)} · {shortId(operation.stageId)}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[12px] text-[var(--text-2)]">
                    {operation.models[0] ?? "unknown"}
                  </p>
                  <p className="mt-0.5 truncate text-[10.5px] text-[var(--text-3)]">
                    {[operation.providers[0], operation.platforms[0]].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <div className="md:text-right">
                  <p className="num text-[12px] text-[var(--text)]">{fmtTokens(operation.totalTokens)}</p>
                  <p className="num mt-0.5 text-[10.5px] text-[var(--text-3)]">
                    {fmtTokens(operation.inputTokens)} / {fmtTokens(operation.outputTokens)}
                  </p>
                </div>
                <div className="md:text-right">
                  <p className="num text-[12px] text-[var(--text)]">{fmtUsd(operation.effectiveCost)}</p>
                  <p className="num mt-0.5 text-[10.5px] text-[var(--text-3)]">
                    rep {fmtUsd(operation.reportedCost)}
                  </p>
                </div>
                <div className="num flex items-center justify-between gap-3 text-[12px] text-[var(--text-2)] md:block md:text-right">
                  <span className="md:hidden text-[10.5px] uppercase tracking-[0.14em] text-[var(--text-4)]">
                    Tools
                  </span>
                  <span>{operation.toolCalls}</span>
                </div>
                <div className="flex md:justify-end">
                  <Pill tone={operation.status === "ok" ? "up" : "down"} className="!py-0.5 !text-[10px]">
                    {operation.status === "ok" ? "ok" : `${operation.errors} errors`}
                  </Pill>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

function TraceExtremes({ expensive, large }: { expensive: SessionTrace[]; large: SessionTrace[] }) {
  const rows = [
    ...expensive.slice(0, 3).map((trace) => ({ kind: "cost", trace })),
    ...large.slice(0, 3).map((trace) => ({ kind: "tokens", trace })),
  ];

  if (rows.length === 0) return null;

  return (
    <Panel className="p-2 overflow-hidden">
      <div className="divide-y divide-[var(--line)]">
        {rows.map(({ kind, trace }) => (
          <div key={`${kind}:${trace.id}`} className="grid gap-3 px-3.5 py-3 md:grid-cols-[1.2fr_1fr_0.8fr_0.8fr] md:items-center">
            <div className="min-w-0">
              <Pill tone={kind === "cost" ? "warn" : "accent"} className="mb-1 !py-0.5 !text-[10px]">{kind}</Pill>
              <p className="num truncate text-[12.5px] text-[var(--text)]">{shortId(trace.sessionId ?? trace.traceId)}</p>
            </div>
            <p className="truncate text-[12px] text-[var(--text-2)]">{trace.models[0] ?? "unknown"}</p>
            <p className="num text-[12px] text-[var(--text-2)] md:text-right">{fmtTokens(trace.totalTokens)}</p>
            <div className="md:text-right">
              <p className="num text-[12px] text-[var(--text-2)]">{fmtUsd(trace.effectiveCost)}</p>
              <p className="num mt-0.5 text-[10.5px] text-[var(--text-3)]">
                rep {fmtUsd(trace.reportedCost)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function PromptRegistry({ control, loaded }: { control: EvaluationControl | null; loaded: boolean }) {
  const prompts = control?.prompts.data.prompts ?? [];
  const health = control?.prompts.health;

  if (!loaded) {
    return (
      <Panel className="p-2">
        <div className="sk h-56 m-1 rounded-[10px]" />
      </Panel>
    );
  }

  if (health?.status !== "ok") {
    return (
      <Panel className="p-2">
        <EmptyState
          icon={<Layers3 className="w-6 h-6" />}
          title="Prompt registry unavailable"
          hint={health?.message ?? "Langfuse prompt metadata could not be read for this installation."}
        />
      </Panel>
    );
  }

  if (prompts.length === 0) {
    return (
      <Panel className="p-2">
        <EmptyState
          icon={<Layers3 className="w-6 h-6" />}
          title="No prompt registry entries"
          hint="Mission Control has not ingested prompt family/version metadata yet, so prompt-level latency, cost, and score comparisons are not available."
        />
      </Panel>
    );
  }

  return (
    <Panel className="p-2 overflow-hidden">
      <div className="hidden md:grid grid-cols-[1.3fr_0.7fr_0.8fr_1fr_0.8fr] gap-3 px-3.5 py-2 text-[10.5px] uppercase tracking-[0.14em] text-[var(--text-4)]">
        <span>Prompt family/name</span>
        <span>Version</span>
        <span>Type</span>
        <span>Labels</span>
        <span className="text-right">Updated</span>
      </div>
      <div className="divide-y divide-[var(--line)]">
        {prompts.map((prompt) => (
          <div key={prompt.key} className="grid gap-3 px-3.5 py-3 md:grid-cols-[1.3fr_0.7fr_0.8fr_1fr_0.8fr] md:items-center">
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-medium text-[var(--text)]">{prompt.name}</p>
              <p className="mt-0.5 truncate text-[10.5px] text-[var(--text-3)]">
                {knownOrUnknown(prompt.family)}{prompt.hash ? ` · hash ${shortId(prompt.hash)}` : ""}
              </p>
            </div>
            <p className="num text-[12px] text-[var(--text-2)]">{prompt.version ?? "Unknown"}</p>
            <p className="text-[12px] text-[var(--text-2)]">{knownOrUnknown(prompt.type)}</p>
            <div className="flex flex-wrap gap-1.5">
              {prompt.labels.length ? prompt.labels.slice(0, 4).map((label) => (
                <span key={label} className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10.5px] text-[var(--text-3)]">
                  {label}
                </span>
              )) : <span className="text-[12px] text-[var(--text-3)]">Unknown</span>}
            </div>
            <div className="md:text-right">
              <p className="num text-[12px] text-[var(--text-2)]">{timeAgo(prompt.updatedAt)}</p>
              {prompt.linkedScoreNames.length > 0 && (
                <p className="mt-0.5 truncate text-[10.5px] text-[var(--text-3)]">
                  scores {prompt.linkedScoreNames.join(", ")}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ScoresAndEvaluators({ control, loaded }: { control: EvaluationControl | null; loaded: boolean }) {
  const scores = control?.scores.data.aggregates ?? [];
  const evaluators = control?.evaluators.data ?? [];
  const evaluatorHealth = control?.evaluators.health;

  if (!loaded) {
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel className="p-2"><div className="sk h-64 m-1 rounded-[10px]" /></Panel>
        <Panel className="p-2"><div className="sk h-64 m-1 rounded-[10px]" /></Panel>
      </div>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Panel className="p-2 overflow-hidden">
        {scores.length === 0 ? (
          <EmptyState
            icon={<LineChart className="w-6 h-6" />}
            title="No score aggregates"
            hint={control?.scores.health.message ?? "Scores API v3 returned no safe score metadata for this window."}
          />
        ) : (
          <div className="divide-y divide-[var(--line)]">
            {scores.map((score) => (
              <div key={score.key} className="grid gap-3 px-3.5 py-3 md:grid-cols-[1fr_0.75fr_0.6fr_0.8fr] md:items-center">
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-medium text-[var(--text)]">{score.name}</p>
                  <p className="mt-0.5 text-[10.5px] text-[var(--text-3)]">
                    {score.source} · {score.dataType} · latest {timeAgo(score.latestTimestamp)}
                  </p>
                </div>
                <p className="text-[12px] text-[var(--text-2)]">{scoreValue(score)}</p>
                <p className="num text-[12px] text-[var(--text-2)] md:text-right">{score.count} scores</p>
                <p className="num text-[12px] text-[var(--text-2)] md:text-right">{score.targetCount} targets</p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Eyebrow>Evaluators</Eyebrow>
            <h3 className="mt-1 text-[16px] font-semibold text-[var(--text)]">Rules &amp; judges</h3>
          </div>
          <Pill tone={resourceTone(evaluatorHealth?.status)} className="!py-0.5 !text-[10px]">
            {evaluatorHealth?.status ?? "loading"}
          </Pill>
        </div>
        {evaluatorHealth?.status !== "ok" ? (
          <p className="mt-4 text-[12.5px] leading-snug text-[var(--text-3)]">
            {evaluatorHealth?.message ?? "Evaluator API status has not loaded."} Deterministic metadata scores can be shown from Scores API; content-requiring judges need a separate approved evaluation profile.
          </p>
        ) : evaluators.length === 0 ? (
          <p className="mt-4 text-[12.5px] leading-snug text-[var(--text-3)]">
            No evaluator rules were returned. Mission Control will show evaluator sampling/status once Langfuse exposes it for this installation.
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {evaluators.slice(0, 8).map((evaluator) => (
              <div key={evaluator.key} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-2)] p-3">
                <p className="truncate text-[12.5px] font-medium text-[var(--text)]">{evaluator.name}</p>
                <p className="mt-1 text-[11px] text-[var(--text-3)]">
                  {knownOrUnknown(evaluator.type)} · score {knownOrUnknown(evaluator.scoreName)} · sample {knownOrUnknown(evaluator.sampling)}
                </p>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function DatasetExperimentPanel({ control }: { control: EvaluationControl | null }) {
  const datasets = control?.datasets.data ?? [];
  const experiments = control?.experiments.data ?? [];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Eyebrow>Datasets</Eyebrow>
            <h3 className="mt-1 text-[16px] font-semibold text-[var(--text)]">Synthetic fixtures</h3>
          </div>
          <Pill tone={resourceTone(control?.datasets.health.status)} className="!py-0.5 !text-[10px]">
            {control?.datasets.health.status ?? "loading"}
          </Pill>
        </div>
        {datasets.length === 0 ? (
          <p className="mt-4 text-[12.5px] text-[var(--text-3)]">
            {control?.datasets.health.message ?? "Dataset API status has not loaded."}
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {datasets.slice(0, 6).map((dataset) => (
              <div key={dataset.key} className="flex items-center justify-between gap-3 rounded-[8px] border border-[var(--line)] bg-[var(--surface-2)] p-3">
                <span className="truncate text-[12.5px] text-[var(--text-2)]">{dataset.name}</span>
                <span className="num text-[11px] text-[var(--text-3)]">{dataset.itemCount ?? "Unknown"} items</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <Panel className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Eyebrow>Experiments</Eyebrow>
            <h3 className="mt-1 text-[16px] font-semibold text-[var(--text)]">Dataset runs</h3>
          </div>
          <Pill tone={resourceTone(control?.experiments.health.status)} className="!py-0.5 !text-[10px]">
            {control?.experiments.health.status ?? "loading"}
          </Pill>
        </div>
        {experiments.length === 0 ? (
          <p className="mt-4 text-[12.5px] text-[var(--text-3)]">
            {control?.experiments.health.message ?? "Experiment/dataset-run API status has not loaded."}
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {experiments.slice(0, 6).map((experiment) => (
              <div key={experiment.key} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-2)] p-3">
                <p className="truncate text-[12.5px] text-[var(--text-2)]">{experiment.name}</p>
                <p className="mt-1 text-[11px] text-[var(--text-3)]">
                  {knownOrUnknown(experiment.datasetName)} · {knownOrUnknown(experiment.status)}
                </p>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function SessionTraceTable({ sessions, loaded }: { sessions: SessionTrace[]; loaded: boolean }) {
  if (!loaded) {
    return (
      <Panel className="p-2">
        <div className="sk h-56 m-1 rounded-[10px]" />
      </Panel>
    );
  }

  if (sessions.length === 0) {
    return (
      <Panel className="p-2">
        <EmptyState
          icon={<Gauge className="w-6 h-6" />}
          title="No Langfuse sessions"
          hint="No generation or tool observations were returned for this window."
        />
      </Panel>
    );
  }

  return (
    <Panel className="p-2 overflow-hidden">
      <div className="hidden md:grid grid-cols-[1.4fr_1fr_0.8fr_0.8fr_0.6fr_0.7fr_0.7fr] gap-3 px-3.5 py-2 text-[10.5px] uppercase tracking-[0.14em] text-[var(--text-4)]">
        <span>Session / trace</span>
        <span>Model</span>
        <span className="text-right">Tokens</span>
        <span className="text-right">Cost</span>
        <span className="text-right">Tools</span>
        <span className="text-right">Duration</span>
        <span className="text-right">Status</span>
      </div>
      <div className="divide-y divide-[var(--line)]">
        {sessions.map((session) => (
          <div
            key={session.id}
            className="grid gap-3 px-3.5 py-3 md:grid-cols-[1.4fr_1fr_0.8fr_0.8fr_0.6fr_0.7fr_0.7fr] md:items-center"
          >
            <div className="min-w-0">
              <p className="num text-[12.5px] text-[var(--text)] truncate">
                {session.sessionId ? shortId(session.sessionId) : "Unknown session"}
              </p>
              <p className="num mt-0.5 text-[10.5px] text-[var(--text-3)] truncate">
                trace {session.traceId ? shortId(session.traceId) : "Unknown"}
                {session.parentObservationIds.length > 0 ? ` · parent ${shortId(session.parentObservationIds[0])}` : ""}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[12px] text-[var(--text-2)] truncate">
                {session.models[0] ?? "Unknown"}
              </p>
              <p className="mt-0.5 text-[10.5px] text-[var(--text-3)] truncate">
                {[session.provider, session.platform].filter(Boolean).join(" · ") || "Unknown"}
              </p>
            </div>
            <div className="md:text-right">
              <p className="num text-[12px] text-[var(--text)]">{fmtKnownTokens(session.totalTokens, session.tokenState)}</p>
              <p className="num mt-0.5 text-[10.5px] text-[var(--text-3)]">
                {session.tokenState === "unknown" ? "input/output unknown" : `${fmtTokens(session.inputTokens)} / ${fmtTokens(session.outputTokens)}`}
              </p>
            </div>
            <div className="md:text-right">
              <p className="num text-[12px] text-[var(--text)]">{fmtKnownUsd(session.effectiveCost, session.costState)}</p>
              <p className="num mt-0.5 text-[10.5px] text-[var(--text-3)]">
                {session.costState === "unknown" ? "basis unknown" : `rep ${fmtUsd(session.reportedCost)}`}
              </p>
            </div>
            <div className="num text-[12px] text-[var(--text-2)] md:text-right">
              {session.toolCallCount}
            </div>
            <div className="md:text-right">
              <p className="num text-[12px] text-[var(--text-2)]">{fmtDurationMs(session.durationMs)}</p>
              <p className="num mt-0.5 text-[10.5px] text-[var(--text-3)]">
                {timeAgo(session.latestTimestamp)}
              </p>
            </div>
            <div className="flex md:justify-end">
              <Pill tone={session.status === "ok" ? "up" : "down"} className="!py-0.5 !text-[10px]">
                {session.status === "ok" ? "ok" : `${session.errorCount} errors`}
              </Pill>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ── Run row ───────────────────────────────────────────────
function RunRow({ run, reduce }: { run: Req; reduce: boolean }) {
  const [open, setOpen] = useState(false);
  const tone = STATUS_TONE[run.status];
  const body = run.error || run.result;
  const canExpand = !!body;
  const dur = duration(run.startedAt, run.finishedAt);

  return (
    <div className="px-3.5 py-3">
      <button
        type="button"
        onClick={() => canExpand && setOpen((o) => !o)}
        className={`w-full flex items-center gap-3 text-left ${
          canExpand ? "cursor-pointer" : "cursor-default"
        }`}
        aria-expanded={canExpand ? open : undefined}
      >
        <StatusDot status={run.status} reduce={reduce} />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] text-[var(--text)] leading-snug truncate">
            {run.title}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11px] text-[var(--text-3)] truncate">{run.kind}</span>
            <Pill tone={tone} className="!py-0.5 !text-[10px]">
              {STATUS_LABEL[run.status]}
            </Pill>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-4 text-right">
          <div>
            <div className="num text-[12px] text-[var(--text-2)]">{dur}</div>
            <div className="num text-[10.5px] text-[var(--text-3)] mt-0.5">
              {timeAgo(run.finishedAt || run.startedAt || run.createdAt)}
            </div>
          </div>
          {canExpand && (
            <ChevronRight
              className="w-3.5 h-3.5 text-[var(--text-3)] transition-transform"
              style={{ transform: open ? "rotate(90deg)" : "none" }}
            />
          )}
        </div>
      </button>
      {open && body && (
        <p
          className="mt-3 ml-[18px] text-[12.5px] leading-snug whitespace-pre-wrap rounded-[8px] border border-[var(--line)] bg-[var(--surface-2)] p-3"
          style={{ color: run.error ? "var(--down)" : "var(--text-2)" }}
        >
          {body}
        </p>
      )}
    </div>
  );
}

// ── Run history ───────────────────────────────────────────
type Filter = "all" | "running" | "done" | "failed";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "running", label: "running" },
  { key: "done", label: "done" },
  { key: "failed", label: "failed" },
];

type ObservabilityView = "overview" | "sessions" | "prompts" | "scores" | "optimization";
const OBSERVABILITY_VIEWS: Array<{ key: ObservabilityView; label: string; icon: ComponentType<{ className?: string }> }> = [
  { key: "overview", label: "Overview", icon: Gauge },
  { key: "sessions", label: "Sessions", icon: ListChecks },
  { key: "prompts", label: "Prompts", icon: Layers3 },
  { key: "scores", label: "Scores", icon: LineChart },
  { key: "optimization", label: "Optimization", icon: FlaskConical },
];

function ObservabilityTabs({
  value,
  onChange,
}: {
  value: ObservabilityView;
  onChange: (value: ObservabilityView) => void;
}) {
  return (
    <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-[var(--line)] p-0.5">
      {OBSERVABILITY_VIEWS.map((view) => {
        const Icon = view.icon;
        const active = value === view.key;
        return (
          <button
            key={view.key}
            type="button"
            onClick={() => onChange(view.key)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              active
                ? "bg-[var(--surface-2)] text-[var(--text)]"
                : "text-[var(--text-3)] hover:text-[var(--text-2)]"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {view.label}
          </button>
        );
      })}
    </div>
  );
}

function RunHistory({
  runs,
  loaded,
  reduce,
}: {
  runs: Req[];
  loaded: boolean;
  reduce: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = filter === "all" ? runs : runs.filter((r) => r.status === filter);

  const count = (f: Filter) =>
    f === "all" ? runs.length : runs.filter((r) => r.status === f).length;

  return (
    <>
      <SectionHeader
        label="Run history"
        title="Recent runs"
        action={
          <div className="flex items-center gap-1 rounded-lg border border-[var(--line)] p-0.5">
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    active
                      ? "bg-[var(--surface-2)] text-[var(--text)]"
                      : "text-[var(--text-3)] hover:text-[var(--text-2)]"
                  }`}
                >
                  {f.label}
                  <span className="num text-[var(--text-3)] ml-1">{count(f.key)}</span>
                </button>
              );
            })}
          </div>
        }
      />
      {!loaded ? (
        <Panel className="p-2">
          <div className="sk h-40 m-1 rounded-[10px]" />
        </Panel>
      ) : shown.length === 0 ? (
        <Panel className="p-2">
          <EmptyState
            icon={<Activity className="w-6 h-6" />}
            title={filter === "all" ? "No runs yet" : `No ${filter} runs`}
            hint="Runs dispatched to Hermes will show up here with duration and results."
          />
        </Panel>
      ) : (
        <Panel className="p-2">
          <div className="divide-y divide-[var(--line)]">
            {shown.map((r) => (
              <RunRow key={r.id} run={r} reduce={reduce} />
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}

// ── Main ──────────────────────────────────────────────────
export function HermesRuns() {
  const [runs, setRuns] = useState<Req[]>([]);
  const [observability, setObservability] = useState<Observability | null>(null);
  const [evaluationControl, setEvaluationControl] = useState<EvaluationControl | null>(null);
  const [window, setWindow] = useState<ObservabilityWindow>("24h");
  const [view, setView] = useState<ObservabilityView>("overview");
  const [loaded, setLoaded] = useState(false);
  const reduce = usePrefersReducedMotion();
  const mounted = useRef(true);

  const load = useCallback(async () => {
    const [reqs, obs, control] = await Promise.all([
      getJSON<{ requests: Req[]; pending: number }>("/api/hermes/requests?take=60"),
      getJSON<Observability>(`/api/hermes/observability?window=${window}`),
      getJSON<EvaluationControl>(`/api/hermes/evaluation-control?window=${window}`),
    ]);
    if (!mounted.current) return;
    if (reqs) setRuns(reqs.requests ?? []);
    if (obs) setObservability(obs);
    if (control) setEvaluationControl(control);
    setLoaded(true);
  }, [window]);

  const changeWindow = useCallback((nextWindow: ObservabilityWindow) => {
    setWindow(nextWindow);
    setObservability(null);
    setEvaluationControl(null);
    setLoaded(false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    const firstLoad = setTimeout(() => {
      void load();
    }, 0);
    const iv = setInterval(load, 8000);
    return () => {
      mounted.current = false;
      clearTimeout(firstLoad);
      clearInterval(iv);
    };
  }, [load]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Eyebrow>Observability</Eyebrow>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-[24px] font-semibold tracking-[-0.02em] leading-none text-[var(--text)]">
            Runs &amp; usage
          </h2>
          <div className="flex items-center gap-2">
            <SourceBadge source={observability?.source ?? null} />
            <WindowToggle value={window} onChange={changeWindow} />
          </div>
        </div>
      </div>

      <ObservabilityTabs value={view} onChange={setView} />

      {view === "overview" && (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <ObservabilityOverview data={observability} />
            <ScoreCoveragePanel observability={observability} control={evaluationControl} />
          </div>
          <WorkflowObservability data={observability} />
        </>
      )}

      {view === "sessions" && (
        <>
          <div>
            <SectionHeader label="Correlation" title="Operation accounting" />
            <CorrelationAccounting data={observability} loaded={loaded} />
          </div>
          <div>
            <SectionHeader label="Langfuse sessions" title="Trace pressure" />
            <SessionTraceTable sessions={observability?.sessions ?? []} loaded={loaded} />
          </div>
        </>
      )}

      {view === "prompts" && (
        <div>
          <SectionHeader
            label="Prompt management"
            title="Prompt registry metadata"
            action={
              <Pill tone={resourceTone(evaluationControl?.prompts.health.status)}>
                {evaluationControl?.prompts.health.rows ?? 0} rows
              </Pill>
            }
          />
          <PromptRegistry control={evaluationControl} loaded={loaded} />
        </div>
      )}

      {view === "scores" && (
        <div className="flex flex-col gap-4">
          <SectionHeader
            label="Scores & evaluators"
            title="Evaluation metadata"
            action={
              <Pill tone={resourceTone(evaluationControl?.scores.health.status)}>
                {evaluationControl?.scores.data.totalScores ?? 0} scores
              </Pill>
            }
          />
          <ScoresAndEvaluators control={evaluationControl} loaded={loaded} />
          <DatasetExperimentPanel control={evaluationControl} />
        </div>
      )}

      {view === "optimization" && (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <WorkflowObservability data={observability} />
            <WasteFlags
              flags={observability?.wasteFlags ?? []}
              tools={observability?.tools.recent ?? []}
            />
          </div>
          <div>
            <SectionHeader label="Trace extremes" title="Top expensive / large traces" />
            <TraceExtremes
              expensive={observability?.topExpensiveTraces ?? []}
              large={observability?.topLargeTraces ?? []}
            />
          </div>
        </>
      )}

      <div>
        <RunHistory runs={runs} loaded={loaded} reduce={reduce} />
      </div>
    </div>
  );
}
