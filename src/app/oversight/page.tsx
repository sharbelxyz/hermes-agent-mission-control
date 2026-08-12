"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Files,
  Gauge,
  RefreshCw,
  ShieldCheck,
  TimerReset,
} from "lucide-react";
import { EmptyState, Eyebrow, Panel, Pill, SectionHeader, Skeleton, rise } from "@/components/ui/kit";

type SuccessLadder = {
  firstTry: number;
  secondAttempt: number;
  thirdPlus: number;
  cloudAssisted: number;
  neverWon: number;
};

type WeeklyPoint = {
  week: string;
  goals: number;
  firstTryPct: number;
  localWinPct: number;
  cloudSharePct: number;
};

type ModelWinRate = { model: string; wins: number; total: number; pct: number };
type TimeStats = { medianMin: number; p90Min: number; maxMin: number };
type DifficultyRow = { bucket: "1 file" | "2-3" | "4-6" | "7+"; n: number; medianMin: number };
type FailureRow = { kind: string; count: number };
type StrengthRow = { prefix: string; goals: number; firstTryPct: number };

type OversightPayload = {
  generatedAt: string;
  empty?: boolean;
  totals?: { goals: number; runs: number; wins: number };
  successLadder?: SuccessLadder;
  weekly?: WeeklyPoint[];
  modelWinRate?: ModelWinRate[];
  time?: TimeStats;
  difficulty?: DifficultyRow[];
  failureMix?: FailureRow[];
  strengths?: StrengthRow[];
};

async function getJSON<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function fmtPct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

function fmtMin(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(value >= 10 ? 0 : 1)}m`;
}

function timeAgo(value: string | null | undefined) {
  if (!value) return "never";
  const diff = Date.now() - Date.parse(value);
  if (!Number.isFinite(diff)) return "never";
  const mins = Math.max(0, Math.floor(diff / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function pct(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

function barStyle(value: number, tint: string): CSSProperties {
  return {
    width: `${Math.max(2, Math.min(100, value))}%`,
    background: tint,
  };
}

function PanelEmpty() {
  return (
    <EmptyState
      icon={<AlertTriangle className="h-5 w-5" />}
      title="No ledger data yet"
      hint="Oversight will populate after the bridge mirrors runs.db."
    />
  );
}

function Header({ data, loading, onRefresh }: { data: OversightPayload | null; loading: boolean; onRefresh: () => void }) {
  return (
    <div className="hq-rise flex flex-wrap items-end justify-between gap-6 pb-10 pt-4" style={rise(0)}>
      <div>
        <Eyebrow>Autonomous loop</Eyebrow>
        <h1 className="mt-2.5 text-[40px] font-semibold leading-none text-[var(--hq-text)]">Oversight</h1>
        <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-[var(--hq-text-ghost)]">
          Success ladder, model win rate, stall mix, completion time, and goal-prefix performance from the conveyor ledger.
        </p>
      </div>
      <div className="flex flex-col items-start gap-2 sm:items-end">
        <button
          type="button"
          onClick={onRefresh}
          className="btn-ghost inline-flex items-center gap-2 px-3 py-2 text-[12px] font-medium"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
        <div className="flex flex-wrap justify-start gap-2 sm:justify-end">
          <Pill tone={data?.empty ? "warn" : "up"}>
            {data?.empty ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
            {data?.empty ? "empty ledger" : "ledger mirrored"}
          </Pill>
          <Pill tone="neutral">
            <RefreshCw className="h-3 w-3" />
            {timeAgo(data?.generatedAt)}
          </Pill>
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value, sub, tone = "neutral" }: { label: string; value: string; sub: string; tone?: "neutral" | "up" | "down" | "warn" | "accent" }) {
  const color = tone === "up" ? "var(--up)" : tone === "down" ? "var(--down)" : tone === "warn" ? "var(--warn)" : tone === "accent" ? "var(--accent)" : "var(--text-2)";
  return (
    <div className="min-w-0 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-1)] p-4">
      <Eyebrow className="!text-[10px]">{label}</Eyebrow>
      <p className="num mt-2 text-[24px] font-semibold leading-none" style={{ color }}>{value}</p>
      <p className="mt-1 truncate text-[11px] text-[var(--text-3)]">{sub}</p>
    </div>
  );
}

function TrendChart({ weekly }: { weekly: WeeklyPoint[] }) {
  const width = 720;
  const height = 210;
  const pad = 28;
  const points = weekly.length ? weekly : [];
  const x = (index: number) => pad + (points.length <= 1 ? 0 : (index / (points.length - 1)) * (width - pad * 2));
  const y = (value: number) => pad + (1 - Math.max(0, Math.min(100, value)) / 100) * (height - pad * 2);
  const line = (key: "firstTryPct" | "localWinPct") => points.map((point, index) => `${x(index)},${y(point[key])}`).join(" ");

  if (!points.length) return <PanelEmpty />;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[240px] w-full overflow-visible">
        <line x1={pad} x2={width - pad} y1={y(50)} y2={y(50)} stroke="var(--line)" strokeDasharray="4 5" />
        <line x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} stroke="var(--line)" />
        {points.map((point, index) => {
          const barWidth = Math.max(8, (width - pad * 2) / Math.max(1, points.length) - 8);
          return (
            <rect
              key={point.week}
              x={x(index) - barWidth / 2}
              y={y(point.cloudSharePct)}
              width={barWidth}
              height={height - pad - y(point.cloudSharePct)}
              rx="3"
              fill="color-mix(in srgb, var(--warn) 22%, transparent)"
            />
          );
        })}
        <polyline points={line("firstTryPct")} fill="none" stroke="var(--up)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={line("localWinPct")} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => (
          <g key={`${point.week}-dot`}>
            <circle cx={x(index)} cy={y(point.firstTryPct)} r="3" fill="var(--up)" />
            <circle cx={x(index)} cy={y(point.localWinPct)} r="3" fill="var(--accent)" />
            {index === 0 || index === points.length - 1 ? (
              <text x={x(index)} y={height - 6} textAnchor={index === 0 ? "start" : "end"} className="fill-[var(--text-3)] text-[10px]">
                {point.week}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      <div className="flex flex-wrap gap-2">
        <Pill tone="up">1st try</Pill>
        <Pill tone="accent">local win</Pill>
        <Pill tone="warn">cloud share bars</Pill>
      </div>
    </div>
  );
}

function SuccessPanel({ data }: { data: OversightPayload | null }) {
  const totals = data?.totals;
  const ladder = data?.successLadder;
  if (data?.empty || !totals || !ladder) {
    return (
      <Panel className="p-5">
        <SectionHeader label="Success ladder" title="Goal outcomes" />
        <PanelEmpty />
      </Panel>
    );
  }

  return (
    <Panel className="p-5">
      <SectionHeader label="Success ladder" title="Is the loop improving?" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile label="1st try" value={fmtPct(pct(ladder.firstTry, totals.goals))} sub={`${ladder.firstTry} goals`} tone="up" />
        <StatTile label="2nd attempt" value={fmtPct(pct(ladder.secondAttempt, totals.goals))} sub={`${ladder.secondAttempt} goals`} tone="accent" />
        <StatTile label="3rd+" value={fmtPct(pct(ladder.thirdPlus, totals.goals))} sub={`${ladder.thirdPlus} goals`} tone="warn" />
        <StatTile label="Cloud assisted" value={fmtPct(pct(ladder.cloudAssisted, totals.goals))} sub="overlaps ladder buckets" tone="neutral" />
        <StatTile label="Never won" value={fmtPct(pct(ladder.neverWon, totals.goals))} sub={`${ladder.neverWon} goals`} tone="down" />
      </div>
      <div className="mt-6">
        <TrendChart weekly={data.weekly ?? []} />
      </div>
    </Panel>
  );
}

function ModelWinPanel({ data }: { data: OversightPayload | null }) {
  const rows = data?.modelWinRate ?? [];
  return (
    <Panel className="p-5">
      <SectionHeader label="Model win-rate" title="Local vs cloud" action={<BrainCircuit className="h-4 w-4 text-[var(--text-3)]" />} />
      {data?.empty ? <PanelEmpty /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[12px]">
            <thead className="text-[10px] uppercase text-[var(--text-4)]">
              <tr className="border-b border-[var(--line)]">
                <th className="py-2 font-semibold">Model</th>
                <th className="py-2 font-semibold">Wins/total</th>
                <th className="py-2 font-semibold">Win%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.model} className="border-b border-[var(--line)] last:border-0">
                  <td className="py-3 text-[var(--text)]">{row.model}</td>
                  <td className="num py-3 text-[var(--text-2)]">{row.wins}/{row.total}</td>
                  <td className="py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-28 rounded-full bg-[var(--surface-2)]">
                        <div className="h-full rounded-full" style={barStyle(row.pct, "var(--accent)")} />
                      </div>
                      <span className="num text-[var(--text)]">{fmtPct(row.pct)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function TimePanel({ data }: { data: OversightPayload | null }) {
  const failures = data?.failureMix ?? [];
  const maxFailure = Math.max(1, ...failures.map((row) => row.count));
  return (
    <Panel className="p-5">
      <SectionHeader label="Time and stall" title="Completion latency and failure mix" action={<TimerReset className="h-4 w-4 text-[var(--text-3)]" />} />
      {data?.empty || !data?.time ? <PanelEmpty /> : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="Median" value={fmtMin(data.time.medianMin)} sub="winning runs" />
            <StatTile label="P90" value={fmtMin(data.time.p90Min)} sub="winning runs" tone="warn" />
            <StatTile label="Max" value={fmtMin(data.time.maxMin)} sub="winning runs" tone="down" />
          </div>
          <div className="mt-5 space-y-3">
            {failures.map((row) => (
              <div key={row.kind}>
                <div className="mb-1 flex items-center justify-between gap-3 text-[12px]">
                  <span className="text-[var(--text-2)]">{row.kind}</span>
                  <span className="num text-[var(--text-3)]">{row.count}</span>
                </div>
                <div className="h-2 rounded-full bg-[var(--surface-2)]">
                  <div className="h-full rounded-full bg-[var(--down)]" style={{ width: `${(row.count / maxFailure) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

function DifficultyPanel({ data }: { data: OversightPayload | null }) {
  return (
    <Panel className="p-5">
      <SectionHeader label="Difficulty vs time" title="Diff-size buckets" action={<Files className="h-4 w-4 text-[var(--text-3)]" />} />
      {data?.empty ? <PanelEmpty /> : (
        <div className="space-y-2">
          {(data?.difficulty ?? []).map((row) => (
            <div key={row.bucket} className="grid grid-cols-[1fr_64px_88px] items-center gap-3 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-1)] px-3 py-2 text-[12px]">
              <span className="text-[var(--text)]">{row.bucket}</span>
              <span className="num text-right text-[var(--text-3)]">{row.n}</span>
              <span className="num text-right text-[var(--text-2)]">{fmtMin(row.medianMin)}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function StrengthList({ title, rows, tone }: { title: string; rows: StrengthRow[]; tone: "up" | "down" }) {
  return (
    <div>
      <Eyebrow>{title}</Eyebrow>
      <div className="mt-3 space-y-2">
        {rows.map((row) => (
          <div key={`${title}-${row.prefix}`} className="grid grid-cols-[1fr_56px_72px] items-center gap-3 text-[12px]">
            <span className="truncate text-[var(--text)]">{row.prefix}</span>
            <span className="num text-right text-[var(--text-3)]">{row.goals}</span>
            <span className={`num text-right ${tone === "up" ? "text-[var(--up)]" : "text-[var(--down)]"}`}>{fmtPct(row.firstTryPct)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StrengthPanel({ data }: { data: OversightPayload | null }) {
  const rows = data?.strengths ?? [];
  const top = rows.slice(0, 5);
  const bottom = rows.slice(-5).reverse();
  return (
    <Panel className="p-5">
      <SectionHeader label="Strengths and weaknesses" title="Goal-prefix first-try rate" action={<ShieldCheck className="h-4 w-4 text-[var(--text-3)]" />} />
      {data?.empty ? <PanelEmpty /> : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <StrengthList title="Top 5" rows={top} tone="up" />
          <StrengthList title="Bottom 5" rows={bottom} tone="down" />
        </div>
      )}
    </Panel>
  );
}

function SummaryTiles({ data }: { data: OversightPayload | null }) {
  const totals = data?.totals;
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
      <Panel className="p-5">
        <div className="flex items-center justify-between gap-3">
          <Eyebrow>Goals</Eyebrow>
          <Gauge className="h-4 w-4 text-[var(--text-3)]" />
        </div>
        <p className="num mt-4 text-[32px] font-semibold leading-none text-[var(--text)]">{totals ? totals.goals.toLocaleString("en-US") : "—"}</p>
      </Panel>
      <Panel className="p-5">
        <div className="flex items-center justify-between gap-3">
          <Eyebrow>Runs</Eyebrow>
          <RefreshCw className="h-4 w-4 text-[var(--text-3)]" />
        </div>
        <p className="num mt-4 text-[32px] font-semibold leading-none text-[var(--text)]">{totals ? totals.runs.toLocaleString("en-US") : "—"}</p>
      </Panel>
      <Panel className="p-5">
        <div className="flex items-center justify-between gap-3">
          <Eyebrow>Wins</Eyebrow>
          <Clock3 className="h-4 w-4 text-[var(--text-3)]" />
        </div>
        <p className="num mt-4 text-[32px] font-semibold leading-none text-[var(--up)]">{totals ? totals.wins.toLocaleString("en-US") : "—"}</p>
      </Panel>
    </div>
  );
}

export default function OversightPage() {
  const [data, setData] = useState<OversightPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const payload = await getJSON<OversightPayload>("/api/oversight");
    setData(payload ?? { generatedAt: new Date().toISOString(), empty: true });
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const content = useMemo(() => {
    if (loading && !data) {
      return (
        <div className="space-y-5">
          <Skeleton className="h-28" />
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      );
    }
    return (
      <div className="space-y-5">
        <SummaryTiles data={data} />
        <SuccessPanel data={data} />
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <ModelWinPanel data={data} />
          <TimePanel data={data} />
          <DifficultyPanel data={data} />
          <StrengthPanel data={data} />
        </div>
      </div>
    );
  }, [data, loading]);

  return (
    <main className="min-h-screen px-4 py-6 md:px-8">
      <Header data={data} loading={loading} onRefresh={load} />
      {content}
    </main>
  );
}
