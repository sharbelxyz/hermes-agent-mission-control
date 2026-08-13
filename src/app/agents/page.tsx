"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  Cloud,
  Cpu,
  Eye,
  Gauge,
  LockKeyhole,
  Radio,
  ShieldCheck,
} from "lucide-react";
import { EmptyState, Eyebrow, Panel, Pill, SectionHeader, Skeleton, rise } from "@/components/ui/kit";

type AgentStatus = "running" | "on-demand" | "stopped";

interface Agent {
  id: string;
  profile: string;
  name: string;
  role: string;
  modelClass: "local" | "cloud";
  model: string;
  provider: string;
  status: AgentStatus;
  capabilities: string[];
  forbiddenActions: string[];
  cloudOrchestratorCallWhen: string | null;
  langfuseCoverage: string;
  compressionPolicy: string;
  contextLength: number | null;
  statusNote: string;
}

const STATUS_TONE: Record<AgentStatus, "up" | "warn" | "neutral"> = {
  running: "up",
  "on-demand": "warn",
  stopped: "neutral",
};

function fmtContext(value: number | null) {
  if (!value) return "not declared";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return value.toLocaleString("en-US");
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

function AgentGlyph({ agent }: { agent: Agent }) {
  const cloud = agent.modelClass === "cloud";
  const Icon = cloud ? Cloud : Cpu;
  return (
    <div
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--r-md)] border"
      style={{
        background: cloud
          ? "color-mix(in srgb, var(--accent) 12%, transparent)"
          : "color-mix(in srgb, var(--up) 10%, transparent)",
        borderColor: cloud
          ? "color-mix(in srgb, var(--accent) 28%, transparent)"
          : "color-mix(in srgb, var(--up) 22%, transparent)",
      }}
    >
      <Icon className="h-5 w-5 text-[var(--text-2)]" />
    </div>
  );
}

function AgentCard({ agent, index }: { agent: Agent; index: number }) {
  return (
    <Panel className="hq-rise flex h-full flex-col p-5" style={rise(index)}>
      <div className="flex items-start gap-3.5">
        <AgentGlyph agent={agent} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[15px] font-semibold text-[var(--text)]">{agent.name}</h3>
            <Pill tone={STATUS_TONE[agent.status]} className="!py-0.5 !text-[10px]">
              {agent.status}
            </Pill>
          </div>
          <p className="mt-1.5 text-[12.5px] leading-snug text-[var(--text-2)]">{agent.role}</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div>
          <Eyebrow>Model</Eyebrow>
          <p className="mt-1 truncate text-[12.5px] font-medium text-[var(--text)]">{agent.model}</p>
          <p className="num mt-0.5 text-[10.5px] text-[var(--text-3)]">
            {agent.provider} · {agent.modelClass}
          </p>
        </div>
        <div>
          <Eyebrow>Context</Eyebrow>
          <p className="num mt-1 text-[12.5px] font-medium text-[var(--text)]">{fmtContext(agent.contextLength)}</p>
          <p className="mt-0.5 truncate text-[10.5px] text-[var(--text-3)]">{agent.compressionPolicy}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-4">
        <div>
          <div className="mb-2 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-[var(--up)]" />
            <Eyebrow>Capabilities</Eyebrow>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {agent.capabilities.slice(0, 6).map((capability) => (
              <span key={capability} className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[11px] text-[var(--text-2)]">
                {capability}
              </span>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-1.5">
            <LockKeyhole className="h-3.5 w-3.5 text-[var(--warn)]" />
            <Eyebrow>Forbidden</Eyebrow>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {agent.forbiddenActions.slice(0, 5).map((action) => (
              <span key={action} className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[11px] text-[var(--text-3)]">
                {action}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-auto pt-5">
        <div className="rule mb-3" />
        <div className="flex items-start gap-2 text-[12px] leading-snug text-[var(--text-3)]">
          <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{agent.langfuseCoverage}</span>
        </div>
        {agent.cloudOrchestratorCallWhen && (
          <p className="mt-2 text-[12px] leading-snug text-[var(--text-2)]">
            {agent.cloudOrchestratorCallWhen}
          </p>
        )}
      </div>
    </Panel>
  );
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const data = await getJSON<Agent[]>("/api/agents");
    if (data) setAgents(data);
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

  const stats = useMemo(() => {
    const running = agents.filter((agent) => agent.status === "running").length;
    const onDemand = agents.filter((agent) => agent.status === "on-demand").length;
    const local = agents.filter((agent) => agent.modelClass === "local").length;
    const cloud = agents.filter((agent) => agent.modelClass === "cloud").length;
    return { running, onDemand, local, cloud };
  }, [agents]);

  return (
    <div className="relative z-10 w-full mx-auto p-8 pb-16 text-[var(--text)]">
      <div className="hq-rise flex flex-wrap items-end justify-between gap-6" style={rise(0)}>
        <div>
          <Eyebrow>Hermes fleet</Eyebrow>
          <h1 className="mt-2.5 text-[40px] font-semibold tracking-[-0.025em] leading-none text-[var(--text)]">
            Developer Mission Control
          </h1>
          <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-[var(--text-3)]">
            Only healthy roster-reported Hermes profiles appear here. Specialists stay on demand so routing remains deliberate and cost stays low.
          </p>
        </div>

        <div className="grid grid-cols-4 gap-3 text-center">
          <div>
            <div className="num text-[24px] font-semibold text-[var(--up)]">{stats.running}</div>
            <div className="eyebrow mt-1">running</div>
          </div>
          <div>
            <div className="num text-[24px] font-semibold text-[var(--warn)]">{stats.onDemand}</div>
            <div className="eyebrow mt-1">on-demand</div>
          </div>
          <div>
            <div className="num text-[24px] font-semibold text-[var(--text)]">{stats.local}</div>
            <div className="eyebrow mt-1">local</div>
          </div>
          <div>
            <div className="num text-[24px] font-semibold text-[var(--accent)]">{stats.cloud}</div>
            <div className="eyebrow mt-1">cloud</div>
          </div>
        </div>
      </div>

      <section className="mt-10">
        <SectionHeader
          label="Operating floor"
          title="Actual Hermes profiles"
          action={
            <div className="flex items-center gap-2 text-[12px] text-[var(--text-3)]">
              <Radio className="h-3.5 w-3.5" />
              metadata-only observability
            </div>
          }
        />

        {!loaded ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <Skeleton key={item} className="h-72 rounded-[var(--r-lg)]" />
            ))}
          </div>
        ) : agents.length === 0 ? (
          <Panel className="p-2">
            <EmptyState
              icon={<Bot className="h-6 w-6" />}
              title="No roster loaded"
              hint="The native roster file is missing or failed schema validation."
            />
          </Panel>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {agents.map((agent, index) => (
              <AgentCard key={agent.id} agent={agent} index={index + 1} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel className="p-5">
          <div className="flex items-center gap-2">
            <Cloud className="h-4 w-4 text-[var(--accent)]" />
            <Eyebrow>Orchestrator lane</Eyebrow>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-[var(--text-2)]">
            The cloud orchestrator owns live coordination, delegation decisions, and Codex implementation/review handoff.
          </p>
        </Panel>
        <Panel className="p-5">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-[var(--up)]" />
            <Eyebrow>Specialist lane</Eyebrow>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-[var(--text-2)]">
            Explorer, architect/reviewer, data auditor, verifier, security, deploy, and cost profiles are evidence lanes, not always-on workers.
          </p>
        </Panel>
        <Panel className="p-5">
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-[var(--warn)]" />
            <Eyebrow>Cost pressure</Eyebrow>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-[var(--text-2)]">
            Model loads are not permitted by roster policy. Compression and Langfuse metadata show when routing needs tightening.
          </p>
        </Panel>
      </section>
    </div>
  );
}
