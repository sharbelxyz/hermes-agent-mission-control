"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bot, CheckCircle2, CircleDollarSign, Gauge, Radio, Wrench } from "lucide-react";
import { Button, EmptyState, Eyebrow, Panel, Pill, SectionHeader, Skeleton, rise } from "@/components/ui/kit";

type GoalState = "ready" | "running" | "done" | "failed";

interface Agent {
  id: string;
  name: string;
  modelClass: "local" | "cloud";
  status: "running" | "on-demand" | "stopped";
}

interface OperatorTask {
  id: string;
  title: string;
  status: "in_progress" | "pending" | "done" | "blocked";
  priority: "high" | "medium" | "low";
}

interface GoalSummary {
  id: string;
  title: string;
  state: GoalState;
  status: string | null;
  updatedAt: string | null;
}

interface NativeSnapshot {
  source: {
    status: "ok" | "warning" | "error";
    message: string;
    warnings: string[];
    checkedAt: string;
  };
  policy: {
    runtimeNote: string;
  };
  agents: Agent[];
  operatorTasks: {
    tasks: OperatorTask[];
    counts: Record<string, number>;
  };
  goals: {
    counts: Record<GoalState, number>;
    current: GoalSummary | null;
    recentFailed: GoalSummary[];
  };
  archive: {
    counts: { done: number; failed: number; total: number };
    artifact_counts: { done: number; failed: number; total: number };
  };
}

interface Observability {
  source: {
    status: "ok" | "warning" | "error";
    message: string;
    warning?: string;
    rows: number;
    filteredRows: number;
    truncated: boolean;
  };
  totals: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    reportedCost: number;
    effectiveCost: number;
    costBasis: string;
    totalCost: number;
    generationCalls: number;
    toolCalls: number;
    uniqueTraces: number;
    errors: number;
  } | null;
  tools: {
    repeated: { name: string; count: number }[];
  };
  wasteFlags: { label: string; detail: string; severity: "warn" | "down" }[];
}

async function getJSON<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function fmtTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  return value.toLocaleString("en-US");
}

function fmtUsd(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function timeAgo(d: string | null): string {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  if (Number.isNaN(diff)) return "—";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function Metric({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon: React.ReactNode }) {
  return (
    <Panel className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Eyebrow>{label}</Eyebrow>
        <span className="text-[var(--text-3)]">{icon}</span>
      </div>
      <div className="num text-[32px] font-semibold leading-none tracking-[-0.02em] text-[var(--text)]">{value}</div>
      {sub && <p className="mt-2 text-[12px] text-[var(--text-3)]">{sub}</p>}
    </Panel>
  );
}

function TaskRow({ task }: { task: OperatorTask }) {
  const tone = task.status === "blocked" ? "down" : task.status === "done" ? "up" : task.status === "in_progress" ? "accent" : "neutral";
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] py-3 last:border-0">
      <p className="text-[13px] leading-snug text-[var(--text-2)]">{task.title}</p>
      <Pill tone={tone} className="shrink-0 !py-0.5 !text-[10px]">{task.status.replace("_", " ")}</Pill>
    </div>
  );
}

export default function Dashboard() {
  const [native, setNative] = useState<NativeSnapshot | null>(null);
  const [observability, setObservability] = useState<Observability | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [nativeData, obsData] = await Promise.all([
      getJSON<NativeSnapshot>("/api/hermes/native"),
      getJSON<Observability>("/api/hermes/observability?window=24h"),
    ]);
    if (nativeData) setNative(nativeData);
    if (obsData) setObservability(obsData);
    setLoaded(true);
  }, []);

  useEffect(() => {
    const firstLoad = setTimeout(() => {
      void load();
    }, 0);
    const interval = setInterval(load, 30_000);
    return () => {
      clearTimeout(firstLoad);
      clearInterval(interval);
    };
  }, [load]);

  const fleet = useMemo(() => {
    const agents = native?.agents ?? [];
    return {
      total: agents.length,
      running: agents.filter((agent) => agent.status === "running").length,
      onDemand: agents.filter((agent) => agent.status === "on-demand").length,
      local: agents.filter((agent) => agent.modelClass === "local").length,
      cloud: agents.filter((agent) => agent.modelClass === "cloud").length,
    };
  }, [native]);

  const activeBlockers = useMemo(() => {
    const blockedTasks = native?.operatorTasks.tasks.filter((task) => task.status === "blocked") ?? [];
    const failedGoals = native?.goals.recentFailed ?? [];
    const waste = observability?.wasteFlags.filter((flag) => flag.severity === "down") ?? [];
    return { blockedTasks, failedGoals, waste };
  }, [native, observability]);

  const totals = observability?.totals ?? null;

  return (
    <div className="relative z-10 w-full mx-auto pb-16">
      <div className="hq-rise pt-4 pb-10 flex flex-wrap items-end justify-between gap-6" style={rise(0)}>
        <div>
          <Eyebrow>Phillip&apos;s Mission Control</Eyebrow>
          <h1 className="mt-2.5 text-[40px] font-semibold tracking-[-0.025em] leading-none text-[var(--hq-text)]">
            Developer cockpit
          </h1>
          <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-[var(--hq-text-ghost)]">
            Current operator work, native runtime state, fleet routing, and 24h Langfuse pressure from safe metadata only.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={native?.source.status === "ok" ? "up" : "warn"}>
            <Radio className="h-3 w-3" />
            {native?.source.message ?? "native source loading"}
          </Pill>
          <Pill tone={observability?.source.status === "ok" ? "up" : "warn"}>
            <Gauge className="h-3 w-3" />
            {observability?.source.message ?? "Langfuse loading"}
          </Pill>
        </div>
      </div>

      {!loaded ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-36" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
            <Metric
              label="24h tokens"
              value={totals ? fmtTokens(totals.totalTokens) : "—"}
              sub={totals ? `${fmtTokens(totals.inputTokens)} in · ${fmtTokens(totals.outputTokens)} out` : observability?.source.warning}
              icon={<Gauge className="h-4 w-4" />}
            />
            <Metric
              label="24h cost"
              value={totals ? fmtUsd(totals.effectiveCost) : "—"}
              sub={totals ? `reported ${fmtUsd(totals.reportedCost)} · ${totals.generationCalls} model calls` : "Langfuse totals unavailable"}
              icon={<CircleDollarSign className="h-4 w-4" />}
            />
            <Metric
              label="Tools / traces"
              value={totals ? `${totals.toolCalls} / ${totals.uniqueTraces}` : "—"}
              sub={totals ? `${totals.errors} error nodes` : `${observability?.source.rows ?? 0} rows`}
              icon={<Wrench className="h-4 w-4" />}
            />
            <Metric
              label="Fleet"
              value={`${fleet.running}/${fleet.total}`}
              sub={`${fleet.onDemand} on-demand · ${fleet.local} local · ${fleet.cloud} cloud`}
              icon={<Bot className="h-4 w-4" />}
            />
          </div>

          <div className="mt-4 flex justify-end">
            <Button href="/observability" size="sm">
              View full observability
            </Button>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <Panel className="p-5">
              <SectionHeader
                label="Current work"
                title={native?.goals.current?.title ?? "No live native goal running"}
                action={<Pill tone={native?.goals.current ? "accent" : "neutral"}>{native?.goals.current?.status ?? "empty"}</Pill>}
                className="!mb-0"
              />
              <div className="mt-4 grid grid-cols-4 gap-3 text-center">
                {(["running", "ready", "failed", "done"] as const).map((state) => (
                  <div key={state} className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-1)] p-3">
                    <div className="num text-[22px] font-semibold text-[var(--text)]">{native?.goals.counts[state] ?? 0}</div>
                    <div className="eyebrow mt-1">{state}</div>
                  </div>
                ))}
              </div>
              <div className="mt-5">
                <Eyebrow>Operator tasks</Eyebrow>
                <div className="mt-2">
                  {(native?.operatorTasks.tasks ?? []).slice(0, 6).map((task) => <TaskRow key={task.id} task={task} />)}
                </div>
              </div>
            </Panel>

            <Panel className="p-5">
              <SectionHeader
                label="Active blockers"
                title={`${activeBlockers.blockedTasks.length + activeBlockers.failedGoals.length + activeBlockers.waste.length} signals`}
                action={<AlertTriangle className="h-4 w-4 text-[var(--warn)]" />}
                className="!mb-0"
              />
              <div className="mt-4 space-y-3">
                {activeBlockers.blockedTasks.map((task) => (
                  <div key={task.id} className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-1)] p-3">
                    <Pill tone="down" className="mb-2 !py-0.5 !text-[10px]">blocked task</Pill>
                    <p className="text-[13px] text-[var(--text-2)]">{task.title}</p>
                  </div>
                ))}
                {activeBlockers.failedGoals.slice(0, 3).map((goal) => (
                  <div key={goal.id} className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-1)] p-3">
                    <Pill tone="down" className="mb-2 !py-0.5 !text-[10px]">failed goal</Pill>
                    <p className="text-[13px] text-[var(--text-2)]">{goal.title}</p>
                    <p className="num mt-1 text-[10.5px] text-[var(--text-3)]">{timeAgo(goal.updatedAt)}</p>
                  </div>
                ))}
                {activeBlockers.waste.slice(0, 3).map((flag) => (
                  <div key={`${flag.label}:${flag.detail}`} className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-1)] p-3">
                    <Pill tone="warn" className="mb-2 !py-0.5 !text-[10px]">token pressure</Pill>
                    <p className="text-[13px] text-[var(--text-2)]">{flag.label}: {flag.detail}</p>
                  </div>
                ))}
                {activeBlockers.blockedTasks.length + activeBlockers.failedGoals.length + activeBlockers.waste.length === 0 && (
                  <EmptyState icon={<CheckCircle2 className="h-6 w-6" />} title="No active blockers" hint="No blocked operator task, failed live goal, or high-severity Langfuse waste flag is present." />
                )}
              </div>
            </Panel>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Panel className="p-5">
              <Eyebrow>Source health</Eyebrow>
              <p className="mt-3 text-[13px] leading-relaxed text-[var(--text-2)]">{native?.policy.runtimeNote}</p>
              {(native?.source.warnings ?? []).slice(0, 3).map((warning) => (
                <p key={warning} className="mt-2 text-[12px] text-[var(--warn)]">{warning}</p>
              ))}
            </Panel>
            <Panel className="p-5">
              <Eyebrow>Repeated tools</Eyebrow>
              <div className="mt-3 flex flex-wrap gap-2">
                {(observability?.tools.repeated ?? []).slice(0, 8).map((tool) => (
                  <span key={tool.name} className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[11px] text-[var(--text-2)]">
                    {tool.name}<span className="num ml-1 text-[var(--text-3)]">x{tool.count}</span>
                  </span>
                ))}
                {!observability?.tools.repeated.length && <p className="text-[12.5px] text-[var(--text-3)]">No repeated tool calls in the 24h window.</p>}
              </div>
            </Panel>
            <Panel className="p-5">
              <Eyebrow>Historical archive</Eyebrow>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="num text-[22px] font-semibold text-[var(--up)]">{native?.archive.counts.done ?? 0}</div>
                  <div className="eyebrow mt-1">done</div>
                </div>
                <div>
                  <div className="num text-[22px] font-semibold text-[var(--down)]">{native?.archive.counts.failed ?? 0}</div>
                  <div className="eyebrow mt-1">failed</div>
                </div>
                <div>
                  <div className="num text-[22px] font-semibold text-[var(--text)]">{native?.archive.counts.total ?? 0}</div>
                  <div className="eyebrow mt-1">total</div>
                </div>
              </div>
              <p className="mt-3 text-center text-[11.5px] text-[var(--text-3)]">
                evidence artifacts <span className="num">{native?.archive.artifact_counts.total ?? 0}</span>
              </p>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
