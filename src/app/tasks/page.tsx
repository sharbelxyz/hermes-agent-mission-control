"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, CheckCircle2, Circle, Clock3, FileText, Radio, XCircle } from "lucide-react";
import { EmptyState, Eyebrow, Panel, Pill, SectionHeader, Skeleton, rise } from "@/components/ui/kit";

type GoalState = "ready" | "running" | "done" | "failed";

interface OperatorTask {
  id: string;
  title: string;
  status: "in_progress" | "pending" | "done" | "blocked";
  priority: "high" | "medium" | "low";
  updatedAt: string | null;
}

interface GoalSummary {
  id: string;
  title: string;
  state: GoalState;
  source: "live-native" | "archive";
  status: string | null;
  updatedAt: string | null;
  evidence: string[];
  bytes: number;
  sha256?: string;
}

interface TasksPayload {
  source: "native-hermes";
  operatorTasks: {
    updatedAt: string | null;
    tasks: OperatorTask[];
    counts: Record<string, number>;
  };
  goals: {
    live: Record<GoalState, GoalSummary[]>;
    counts: Record<GoalState, number>;
    current: GoalSummary | null;
    recentFailed: GoalSummary[];
  };
  archive: {
    counts: { done: number; failed: number; total: number };
    artifact_counts: { done: number; failed: number; total: number };
    manifestSha256: string | null;
    recent: GoalSummary[];
  };
  sourceHealth: {
    mode?: "local-native" | "bridge-mirror";
    status: "ok" | "warning" | "error";
    message: string;
    warnings: string[];
    errors?: string[];
    stale?: boolean;
  };
}

const GOAL_LABEL: Record<GoalState, string> = {
  running: "Running now",
  ready: "Ready",
  failed: "Recent failed",
  done: "Recent done",
};

const GOAL_TONE: Record<GoalState, "accent" | "neutral" | "up" | "down"> = {
  running: "accent",
  ready: "neutral",
  done: "up",
  failed: "down",
};

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

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
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

function StatusIcon({ status }: { status: OperatorTask["status"] }) {
  if (status === "done") return <CheckCircle2 className="h-4 w-4 text-[var(--up)]" />;
  if (status === "blocked") return <XCircle className="h-4 w-4 text-[var(--down)]" />;
  if (status === "in_progress") return <Clock3 className="h-4 w-4 text-[var(--accent)]" />;
  return <Circle className="h-4 w-4 text-[var(--text-3)]" />;
}

function OperatorTaskRow({ task }: { task: OperatorTask }) {
  const tone = task.status === "done" ? "up" : task.status === "blocked" ? "down" : task.status === "in_progress" ? "accent" : "neutral";
  return (
    <div className="flex items-start gap-3 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-1)] p-3.5">
      <StatusIcon status={task.status} />
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium leading-snug text-[var(--text)]">{task.title}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Pill tone={tone} className="!py-0.5 !text-[10px]">{task.status.replace("_", " ")}</Pill>
          <span className="num text-[10.5px] text-[var(--text-3)]">{task.priority}</span>
          {task.updatedAt && <span className="num text-[10.5px] text-[var(--text-3)]">{timeAgo(task.updatedAt)}</span>}
        </div>
      </div>
    </div>
  );
}

function GoalCard({ goal }: { goal: GoalSummary }) {
  return (
    <div className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-1)] p-3.5">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-[13px] font-medium leading-snug text-[var(--text)]">{goal.title}</p>
        <Pill tone={GOAL_TONE[goal.state]} className="shrink-0 !py-0.5 !text-[10px]">
          {goal.status ?? goal.state}
        </Pill>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 num text-[10.5px] text-[var(--text-3)]">
        <span>{fmtBytes(goal.bytes)}</span>
        <span>{timeAgo(goal.updatedAt)}</span>
        {goal.sha256 && <span>sha {goal.sha256.slice(0, 10)}</span>}
      </div>
      {goal.evidence.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {goal.evidence.map((item) => (
            <span key={item} className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10.5px] text-[var(--text-3)]">
              {item}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TasksPage() {
  const [payload, setPayload] = useState<TasksPayload | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const data = await getJSON<TasksPayload>("/api/tasks");
    if (data) setPayload(data);
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

  const operatorTasks = payload?.operatorTasks.tasks ?? [];
  const liveGoals = payload?.goals.live ?? { ready: [], running: [], done: [], failed: [] };
  const totalLive = payload ? Object.values(payload.goals.counts).reduce((sum, count) => sum + count, 0) : 0;
  const sourceMessage = payload?.sourceHealth.errors?.[0] ?? payload?.sourceHealth.warnings[0] ?? null;

  return (
    <div className="relative z-10 h-full w-full mx-auto pt-4 pb-16">
      <div className="hq-rise mb-10 flex flex-wrap items-end justify-between gap-6" style={rise(0)}>
        <div>
          <Eyebrow>Native work state</Eyebrow>
          <h1 className="mt-2.5 text-[40px] font-semibold tracking-[-0.025em] leading-none text-[var(--text)]">
            Goals &amp; Operator Tasks
          </h1>
          <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-[var(--text-3)]">
            Live native runtime state is read from the new Hermes root. Historical goal files are shown only from the imported archive manifest.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-5 text-center">
          <div>
            <div className="num text-[24px] font-semibold text-[var(--accent)]">{totalLive}</div>
            <div className="eyebrow mt-1">live native</div>
          </div>
          <div>
            <div className="num text-[24px] font-semibold text-[var(--warn)]">{operatorTasks.length}</div>
            <div className="eyebrow mt-1">operator</div>
          </div>
          <div>
            <div className="num text-[24px] font-semibold text-[var(--text)]">{payload?.archive.counts.total ?? 0}</div>
            <div className="eyebrow mt-1">archive</div>
          </div>
        </div>
      </div>

      {!loaded ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      ) : (
        <>
          {sourceMessage ? (
            <Panel className="mb-6 p-4">
              <div className="flex items-start gap-2 text-[12.5px] text-[var(--text-2)]">
                <Radio className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--warn)]" />
                <span>{sourceMessage}</span>
              </div>
            </Panel>
          ) : null}

          <section>
            <SectionHeader
              label="Operator registry"
              title="Current operator tasks"
              action={<Pill tone={payload?.sourceHealth.stale ? "warn" : "accent"}>{payload?.sourceHealth.mode === "bridge-mirror" ? "bridge mirror" : "local native"}</Pill>}
            />
            {operatorTasks.length === 0 ? (
              <Panel className="p-2">
                <EmptyState icon={<FileText className="h-6 w-6" />} title="No operator tasks" hint="The operator task registry is empty." />
              </Panel>
            ) : (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {operatorTasks.map((task) => <OperatorTaskRow key={task.id} task={task} />)}
              </div>
            )}
          </section>

          <section className="mt-12">
            <SectionHeader
              label="Live native runtime"
              title="Goals by fixed runtime folder"
              action={<span className="num text-[11px] text-[var(--text-3)]">read-only display</span>}
            />
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
              {(["running", "ready", "failed", "done"] as const).map((state) => (
                <Panel key={state} className="flex min-h-64 flex-col p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <Eyebrow>{GOAL_LABEL[state]}</Eyebrow>
                    <Pill tone={GOAL_TONE[state]} className="!py-0.5 !text-[10px]">{liveGoals[state].length}</Pill>
                  </div>
                  {liveGoals[state].length === 0 ? (
                    <p className="py-8 text-center text-[12.5px] text-[var(--text-4)]">No live native goals</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {liveGoals[state].map((goal) => <GoalCard key={goal.id} goal={goal} />)}
                    </div>
                  )}
                </Panel>
              ))}
            </div>
          </section>

          <section className="mt-12">
            <SectionHeader
              label="Historical archive"
              title="Imported legacy goal counts"
              action={<Pill tone="neutral">archive only</Pill>}
            />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
              <Panel className="p-5">
                <div className="flex items-center gap-2">
                  <Archive className="h-4 w-4 text-[var(--text-3)]" />
                  <Eyebrow>Manifest</Eyebrow>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="num text-[24px] font-semibold text-[var(--up)]">{payload?.archive.counts.done ?? 0}</div>
                    <div className="eyebrow mt-1">done</div>
                  </div>
                  <div>
                    <div className="num text-[24px] font-semibold text-[var(--down)]">{payload?.archive.counts.failed ?? 0}</div>
                    <div className="eyebrow mt-1">failed</div>
                  </div>
                  <div>
                    <div className="num text-[24px] font-semibold text-[var(--text)]">{payload?.archive.counts.total ?? 0}</div>
                    <div className="eyebrow mt-1">total</div>
                  </div>
                </div>
                {payload?.archive.manifestSha256 && (
                  <p className="num mt-5 break-all text-[10.5px] text-[var(--text-3)]">
                    manifest {payload.archive.manifestSha256.slice(0, 24)}
                  </p>
                )}
                <p className="mt-3 text-[11.5px] text-[var(--text-3)]">
                  evidence artifacts <span className="num">{payload?.archive.artifact_counts.total ?? 0}</span>
                </p>
              </Panel>
              <Panel className="p-4">
                {payload?.archive.recent.length ? (
                  <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                    {payload.archive.recent.slice(0, 10).map((goal) => <GoalCard key={goal.id} goal={goal} />)}
                  </div>
                ) : (
                  <EmptyState icon={<Archive className="h-6 w-6" />} title="No archive manifest rows" hint="Archive files are counted only after import-manifest.json exists." />
                )}
              </Panel>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
