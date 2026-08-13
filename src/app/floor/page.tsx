"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type ReactFlowInstance,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { Bot, Check, ExternalLink, FileCode2, GitBranch, Info, Radio, RefreshCw, X } from "lucide-react";
import { EmptyState, Eyebrow, Panel, Pill, SectionHeader, Skeleton, rise } from "@/components/ui/kit";

type RunStatusTone = "neutral" | "up" | "down" | "warn" | "accent";
type FileOp = "read" | "patch" | "write" | "delete";

export interface RunIndex {
  goal: string;
  status: string;
  attempts: number;
  liveController?: boolean;
  traceRunning?: boolean;
  rung?: number | null;
  specialist?: string | null;
  shipped_pr?: string | null;
  preview_url?: string | null;
  lastActivity: string | null;
  nodeLabels: string[];
  filesTouched: number;
}

interface RecoveryEvent {
  ts: string;
  gid: string;
  event: string;
  reason?: string;
  detail?: string;
  pr?: string;
}

interface ConveyorActive {
  goalId: string;
  live: boolean;
  status: string | null;
  rung: number | null;
  attempts: number | null;
  pr: string | null;
}
interface ConveyorUpNext {
  goalId: string;
  title: string;
  specialist: string | null;
  dependencyReady?: boolean;
  planRequired?: boolean;
  waitingOn?: string[];
}
interface ConveyorBlocked {
  goalId: string;
  queueState: string;
  blockedBy: string[];
  failedDependencies: string[];
}
interface ConveyorBox {
  label: string;
  host: string;
  reachable: boolean;
  models: string[];
}
interface ConveyorState {
  conveyorOn: boolean;
  controllerPids: number[];
  liveGoals: string[];
  active: ConveyorActive[];
  upNext: ConveyorUpNext[];
  planRequired: { goalId: string; title: string }[];
  blocked: ConveyorBlocked[];
  counts: Record<string, number>;
  focusPrefixes: string[];
  message: string;
  boxes: ConveyorBox[];
  statusAgeSec: number | null;
  statusMissing: boolean;
  syncedAt: string | null;
}

interface RecoverySummary {
  gid: string;
  dispatches: number;
  pr: string | null;
  last: string | null;
  at: string | null;
}

interface AgentTrace {
  id: string;
  label: string;
  model: string | null;
  startedAt: string | null;
  endedAt: string | null;
  modelCalls: number;
  toolCalls: number;
  tools: Record<string, number>;
}

interface FileTrace {
  path: string;
  ops: Record<FileOp, number>;
  total: number;
  lastOp: FileOp | null;
  lastNode: string | null;
}

interface TouchTrace {
  agent: string;
  path: string;
  op: FileOp;
  count: number;
}

interface LearningTrace {
  attempt: number;
  learned: string[];
  inferred: string[];
}

interface CurrentActivity {
  node: string;
  kind: "model" | "tool" | "idle";
  tool: string | null;
  file: string | null;
  at: string | null;
}

interface TimelineEntry {
  seq: number;
  node: string;
  kind: "node_start" | "node_end" | "model" | "tool";
  tool: string | null;
  file: string | null;
  at: string | null;
}

interface RunGraph {
  goal: string;
  attempt: number;
  status: string;
  hasSubstantiveContent?: boolean;
  startedAt: string | null;
  endedAt: string | null;
  running: boolean;
  agents: AgentTrace[];
  files: FileTrace[];
  flow: Array<{ from: string; to: string }>;
  touches: TouchTrace[];
  learnings: LearningTrace[];
  currentAgent?: string | null;
  currentActivity?: CurrentActivity | null;
  timeline?: TimelineEntry[];
  counts: { events: number; modelCalls: number; toolCalls: number };
}

type AgentNodeData = {
  agent: AgentTrace;
  live: boolean;
};

type FileNodeData = {
  file: FileTrace;
  active: boolean;
};

type AgentNode = Node<AgentNodeData, "agent">;
type FileNode = Node<FileNodeData, "file">;
type FloorNode = AgentNode | FileNode;

const OP_COLOR: Record<FileOp, string> = {
  read: "var(--text-3)",
  patch: "var(--accent)",
  write: "var(--up)",
  delete: "var(--down)",
};

const FLOW_COLOR = "color-mix(in srgb, var(--accent) 70%, var(--text) 30%)";

async function getJSON<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function isTrulyRunning(run: Pick<RunIndex, "liveController"> | null | undefined) {
  return run?.liveController === true;
}

export function getRunLiveBadge(run: Pick<RunIndex, "liveController" | "traceRunning"> | null | undefined): {
  tone: RunStatusTone;
  label: "live" | "seen";
} {
  return isTrulyRunning(run) ? { tone: "accent", label: "live" } : { tone: "neutral", label: "seen" };
}

function normalizeStatus(status: string | null | undefined) {
  return String(status || "").toLowerCase();
}

function isFailedStatus(status: string | null | undefined) {
  const normalized = normalizeStatus(status);
  return ["failed", "failure", "crash", "error"].includes(normalized) || normalized.includes("fail");
}

function isTerminalSuccessStatus(status: string | null | undefined) {
  return ["done", "complete", "completed", "passed", "success", "shipped", "merged"].includes(normalizeStatus(status));
}

function isRecoveringActive(active: ConveyorActive) {
  if (active.live) return false;
  const status = normalizeStatus(active.status);
  return status === "running" || status === "recovering" || status === "external_recovery" || status.includes("recover");
}

type ConveyorFloorMode = "loading" | "live" | "recovering" | "on-idle" | "off";

export function getConveyorFloorView(conveyor: ConveyorState | null): {
  mode: ConveyorFloorMode;
  liveActive: ConveyorActive[];
  recoveringActive: ConveyorActive[];
  buildingNow: ConveyorActive[];
  headerConveyorLabel: string;
  headerConveyorTone: RunStatusTone;
  headerCountLabel: string;
  headerCountTone: RunStatusTone;
  headerStatusLabel: string;
  headerStatusTone: RunStatusTone;
  buildingActionLabel: string;
  emptyTitle: string;
  emptyHint: string;
} {
  if (!conveyor) {
    return {
      mode: "loading",
      liveActive: [],
      recoveringActive: [],
      buildingNow: [],
      headerConveyorLabel: "Syncing conveyor",
      headerConveyorTone: "neutral",
      headerCountLabel: "checking active goal",
      headerCountTone: "neutral",
      headerStatusLabel: "syncing status",
      headerStatusTone: "neutral",
      buildingActionLabel: "syncing conveyor",
      emptyTitle: "Syncing conveyor",
      emptyHint: "checking active goal",
    };
  }

  const liveActive = conveyor.active.filter((active) => active.live);
  const recoveringActive = conveyor.active.filter(isRecoveringActive);
  const buildingNow = [...liveActive, ...recoveringActive];
  const statusStale = conveyor.statusAgeSec != null && conveyor.statusAgeSec > 120;
  const headerStatusLabel =
    conveyor.statusAgeSec == null ? "no status" : statusStale ? `stale ${conveyor.statusAgeSec}s` : `${conveyor.statusAgeSec}s ago`;
  const headerStatusTone: RunStatusTone = statusStale ? "down" : "neutral";

  if (liveActive.length > 0) {
    return {
      mode: "live",
      liveActive,
      recoveringActive,
      buildingNow,
      headerConveyorLabel: "Conveyor ON",
      headerConveyorTone: "up",
      headerCountLabel: `${liveActive.length} building now`,
      headerCountTone: "accent",
      headerStatusLabel,
      headerStatusTone,
      buildingActionLabel: "conveyor on",
      emptyTitle: "Conveyor on — nothing dispatched yet",
      emptyHint: conveyor.message || "Waiting for a ready goal to promote.",
    };
  }

  if (recoveringActive.length > 0) {
    return {
      mode: "recovering",
      liveActive,
      recoveringActive,
      buildingNow,
      headerConveyorLabel: "Conveyor recovering",
      headerConveyorTone: "warn",
      headerCountLabel: `${recoveringActive.length} recovering`,
      headerCountTone: "warn",
      headerStatusLabel,
      headerStatusTone,
      buildingActionLabel: "recovering",
      emptyTitle: "Conveyor recovering",
      emptyHint: conveyor.message || "Waiting for the queue timer to restart the controller.",
    };
  }

  if (conveyor.conveyorOn) {
    return {
      mode: "on-idle",
      liveActive,
      recoveringActive,
      buildingNow,
      headerConveyorLabel: "Conveyor ON",
      headerConveyorTone: "up",
      headerCountLabel: "idle",
      headerCountTone: "neutral",
      headerStatusLabel,
      headerStatusTone,
      buildingActionLabel: "conveyor on",
      emptyTitle: "Conveyor on — nothing dispatched yet",
      emptyHint: conveyor.message || "Waiting for a ready goal to promote.",
    };
  }

  return {
    mode: "off",
    liveActive,
    recoveringActive,
    buildingNow,
    headerConveyorLabel: "Conveyor OFF",
    headerConveyorTone: "down",
    headerCountLabel: "idle",
    headerCountTone: "neutral",
    headerStatusLabel,
    headerStatusTone,
    buildingActionLabel: "conveyor off",
    emptyTitle: "Conveyor off",
    emptyHint: conveyor.message || "Start rt-goal-queue.timer to resume dispatch.",
  };
}

function statusTone(status: string, running = false): RunStatusTone {
  const normalized = normalizeStatus(status);
  if (running) return "accent";
  if (isTerminalSuccessStatus(normalized)) return "up";
  if (isFailedStatus(normalized)) return "down";
  if (["shipping", "shipped", "deploying", "merged"].includes(normalized)) return "warn";
  if (normalized.includes("blocked")) return "warn";
  return "neutral";
}

function fmtRelative(value: string | null) {
  if (!value) return "no activity";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "no activity";
  const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return new Date(time).toLocaleDateString();
}

function shortPath(value: string) {
  const parts = value.split("/").filter(Boolean);
  if (parts.length <= 3) return value;
  return `${parts.at(-3)}/${parts.at(-2)}/${parts.at(-1)}`;
}

function safeId(prefix: string, value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return `${prefix}:${hash.toString(16)}`;
}

function AgentTraceNode({ data }: NodeProps<AgentNode>) {
  const toolEntries = Object.entries(data.agent.tools).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const liveBadge = getRunLiveBadge({ liveController: data.live });
  return (
    <div className={`floor-node floor-node-agent ${data.live ? "is-running" : ""}`}>
      <Handle type="target" position={Position.Left} className="floor-handle" />
      <Handle type="source" position={Position.Right} className="floor-handle" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-[var(--accent)]" />
            <h3 className="truncate text-[13px] font-semibold text-[var(--text)]">{data.agent.label}</h3>
          </div>
          <p className="mt-1 truncate text-[11.5px] text-[var(--text-3)]">{data.agent.model || "model pending"}</p>
        </div>
        <Pill tone={liveBadge.tone} className="!py-0.5 !text-[10px]">
          {liveBadge.label}
        </Pill>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div>
          <Eyebrow>Model calls</Eyebrow>
          <p className="num mt-1 text-[18px] font-semibold text-[var(--text)]">{data.agent.modelCalls}</p>
        </div>
        <div>
          <Eyebrow>Tool calls</Eyebrow>
          <p className="num mt-1 text-[18px] font-semibold text-[var(--accent)]">{data.agent.toolCalls}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {toolEntries.length ? toolEntries.map(([tool, count]) => (
          <span key={tool} className="rounded-full border border-[var(--line)] px-2 py-1 text-[10.5px] text-[var(--text-2)]">
            {tool} <span className="num text-[var(--text-3)]">x{count}</span>
          </span>
        )) : (
          <span className="text-[11px] text-[var(--text-4)]">No tool calls yet</span>
        )}
      </div>
    </div>
  );
}

function FileTraceNode({ data }: NodeProps<FileNode>) {
  const op = data.file.lastOp || "read";
  return (
    <div className={`floor-node floor-node-file ${data.active ? "is-active" : ""}`}>
      <Handle type="target" position={Position.Left} className="floor-handle" />
      <div className="flex items-start gap-2.5">
        <FileCode2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: OP_COLOR[op] }} />
        <div className="min-w-0">
          <h3 className="truncate text-[12.5px] font-semibold text-[var(--text)]">{shortPath(data.file.path)}</h3>
          <p className="mt-1 truncate text-[10.5px] text-[var(--text-4)]">{data.file.path}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(["read", "patch", "write", "delete"] as FileOp[]).map((item) => (
          data.file.ops[item] > 0 && (
            <span key={item} className="rounded-full border border-[var(--line)] px-2 py-1 text-[10px]" style={{ color: OP_COLOR[item] }}>
              {item} <span className="num">x{data.file.ops[item]}</span>
            </span>
          )
        ))}
      </div>
    </div>
  );
}

const nodeTypes = {
  agent: AgentTraceNode,
  file: FileTraceNode,
};

function buildGraph(graph: RunGraph, liveController: boolean): { nodes: FloorNode[]; edges: Edge[] } {
  const agentByLabel = new Map(graph.agents.map((agent) => [agent.label, agent]));
  const fileIdByPath = new Map(graph.files.map((file) => [file.path, safeId("file", file.path)]));
  const nodes: FloorNode[] = [];
  const edges: Edge[] = [];

  graph.agents.forEach((agent, index) => {
    const live = liveController && (graph.currentAgent ? agent.label === graph.currentAgent : graph.running && !agent.endedAt);
    nodes.push({
      id: safeId("agent", agent.label),
      type: "agent",
      position: { x: 0, y: index * 168 },
      data: { agent, live },
    });
  });

  graph.files.slice(0, 60).forEach((file, index) => {
    nodes.push({
      id: fileIdByPath.get(file.path) || safeId("file", file.path),
      type: "file",
      position: { x: 480 + (index % 2) * 280, y: Math.floor(index / 2) * 124 },
      data: { file, active: graph.currentActivity?.file === file.path },
    });
  });

  graph.flow.forEach((edge, index) => {
    const source = agentByLabel.has(edge.from) ? safeId("agent", edge.from) : null;
    const target = agentByLabel.has(edge.to) ? safeId("agent", edge.to) : null;
    if (!source || !target) return;
    edges.push({
      id: `flow:${source}:${target}:${index}`,
      source,
      target,
      type: "smoothstep",
      animated: true,
      style: { stroke: FLOW_COLOR, strokeWidth: 1.8 },
      markerEnd: { type: "arrowclosed", color: "var(--accent)" },
    });
  });

  graph.touches.forEach((touch, index) => {
    const source = agentByLabel.has(touch.agent) ? safeId("agent", touch.agent) : null;
    const target = fileIdByPath.get(touch.path);
    if (!source || !target) return;
    edges.push({
      id: `touch:${source}:${target}:${touch.op}:${index}`,
      source,
      target,
      type: "smoothstep",
      label: touch.count > 1 ? String(touch.count) : touch.op,
      style: { stroke: OP_COLOR[touch.op], strokeWidth: touch.op === "patch" || touch.op === "write" ? 2.2 : 1.4 },
      labelStyle: { fill: "var(--text-2)", fontSize: 10 },
      labelBgStyle: { fill: "var(--surface-1)", fillOpacity: 0.92 },
      markerEnd: { type: "arrowclosed", color: OP_COLOR[touch.op] },
    });
  });

  return { nodes, edges };
}

function nodeSignature(node: FloorNode) {
  return JSON.stringify({ type: node.type, data: node.data });
}

function edgeSignature(edge: Edge) {
  return JSON.stringify({ source: edge.source, target: edge.target, label: edge.label, animated: edge.animated, style: edge.style });
}

function mergeNodes(previous: FloorNode[], incoming: FloorNode[]): FloorNode[] {
  const previousById = new Map(previous.map((node) => [node.id, node]));
  return incoming.map((node) => {
    const current = previousById.get(node.id);
    if (!current) return node;
    if (nodeSignature(current) === nodeSignature(node)) return current;
    return { ...current, type: node.type, data: node.data } as FloorNode;
  });
}

function mergeEdges(previous: Edge[], incoming: Edge[]): Edge[] {
  const previousById = new Map(previous.map((edge) => [edge.id, edge]));
  return incoming.map((edge) => {
    const current = previousById.get(edge.id);
    return current && edgeSignature(current) === edgeSignature(edge) ? current : edge;
  });
}

function activityText(graph: RunGraph) {
  const activity = graph.currentActivity;
  const agent = graph.currentAgent || activity?.node || "idle";
  if (!activity) return agent + " · waiting";
  const model = graph.agents.find((item) => item.label === activity.node)?.model;
  const pieces = [agent];
  if (model) pieces.push(model);
  pieces.push(activity.kind === "tool" ? activity.tool || "tool" : activity.kind === "model" ? activity.tool || "MODEL_CALL" : "idle");
  if (activity.file) pieces.push("→ " + shortPath(activity.file));
  pieces.push(fmtRelative(activity.at));
  return pieces.join(" · ");
}

function timelineText(item: TimelineEntry) {
  const action = item.kind === "node_start" ? "NODE_START" : item.kind === "node_end" ? "NODE_END" : item.tool || item.kind.toUpperCase();
  return item.file ? item.node + " → " + action + " " + shortPath(item.file) : item.node + " → " + action;
}

export type RunTab = "queued" | "running" | "done" | "failed";

export type TabCounts = Record<RunTab, number>;

export function runTab(run: RunIndex): RunTab {
  const s = normalizeStatus(run.status);
  if (isFailedStatus(s)) return "failed";
  if (s === "running" || isTrulyRunning(run)) return "running";
  if (s === "queued" || ["pending", "staged", "ready", "blocked", "recovering", "external_recovery"].includes(s)) {
    return "queued";
  }
  if (isTerminalSuccessStatus(s) || s === "shipping") return "done";
  // Superseded / unknown / any other terminal-ish status remains visible under Done,
  // so the four tab counts still account for the full /api/runs dataset.
  return "done";
}

export function computeTabCounts(runs: RunIndex[]): TabCounts {
  const counts: TabCounts = { queued: 0, running: 0, done: 0, failed: 0 };
  for (const run of runs) counts[runTab(run)] += 1;
  return counts;
}

function hasSubstantiveGraph(run: RunIndex) {
  return run.filesTouched > 0 || run.nodeLabels.length > 1;
}

function defaultSelectedGoal(runs: RunIndex[]) {
  // Live floor: a truly-running controller wins, then the newest substantive graph, then newest overall.
  return runs.find(isTrulyRunning)?.goal ?? runs.find(hasSubstantiveGraph)?.goal ?? runs[0]?.goal ?? null;
}

const RUN_TABS: Array<{ key: RunTab; label: string }> = [
  { key: "queued", label: "Queued" },
  { key: "running", label: "Running" },
  { key: "done", label: "Completed" },
  { key: "failed", label: "Failed" },
];

const RECOVERY_LABEL: Record<string, string> = {
  codex_dispatch: "Codex dispatched",
  scope_ok: "Scope gate passed",
  scope_refused: "Scope gate REFUSED",
  acceptance_pass: "Acceptance passed",
  acceptance_fail: "Acceptance failed",
  pr_opened: "PR opened",
  codex_failed: "Codex run failed",
  push_failed: "Push failed",
  skip: "Skipped",
  plan: "Planned (dry)",
};

function recoveryTone(event: string): RunStatusTone {
  if (["acceptance_pass", "pr_opened", "scope_ok"].includes(event)) return "up";
  if (["scope_refused", "acceptance_fail", "codex_failed", "push_failed"].includes(event)) return "down";
  if (event === "codex_dispatch") return "accent";
  return "neutral";
}

function RecoveryLog({ events, forGoal }: { events: RecoveryEvent[]; forGoal: string | null }) {
  const scoped = forGoal ? events.filter((event) => event.gid === forGoal) : events;
  const recent = scoped.slice(-40).reverse();
  if (recent.length === 0) {
    return (
      <div className="mt-3 rounded-[var(--r-md)] border border-dashed border-[var(--line)] px-3 py-4 text-center text-[11px] text-[var(--text-4)]">
        No Codex corrections logged yet. Failed goals stamped eligible are picked up here.
      </div>
    );
  }
  return (
    <div className="mt-3 space-y-1.5">
      <Eyebrow>Codex correction log{forGoal ? "" : " (all goals)"}</Eyebrow>
      {recent.map((event, index) => (
        <div
          key={`${event.gid}:${event.ts}:${index}`}
          className="flex items-start justify-between gap-2 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-1)] px-2.5 py-1.5"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Pill tone={recoveryTone(event.event)} className="!py-0.5 !text-[9.5px]">
                {RECOVERY_LABEL[event.event] || event.event}
              </Pill>
              {!forGoal && <span className="truncate text-[10.5px] text-[var(--text-3)]">{event.gid}</span>}
            </div>
            {(event.reason || event.detail) && (
              <p className="mt-1 truncate text-[10.5px] text-[var(--text-4)]">{event.reason || event.detail}</p>
            )}
            {event.pr && event.pr.startsWith("http") && (
              <a href={event.pr} target="_blank" rel="noreferrer" className="mt-1 block truncate text-[10.5px] text-[var(--accent)] underline">
                {event.pr}
              </a>
            )}
          </div>
          <span className="num shrink-0 text-[10px] text-[var(--text-4)]">{fmtRelative(event.ts)}</span>
        </div>
      ))}
    </div>
  );
}

function RunRail({
  runs,
  selected,
  loaded,
  onSelect,
  recovery,
}: {
  runs: RunIndex[];
  selected: string | null;
  loaded: boolean;
  onSelect: (goal: string) => void;
  recovery: RecoveryEvent[];
}) {
  const [tab, setTab] = useState<RunTab>("queued");

  const tabCounts = useMemo(() => computeTabCounts(runs), [runs]);
  const tabRows = useMemo(() => {
    const groups: Record<RunTab, RunIndex[]> = { queued: [], running: [], done: [], failed: [] };
    for (const run of runs) groups[runTab(run)].push(run);
    groups.queued.sort((a, b) => Date.parse(b.lastActivity || "") - Date.parse(a.lastActivity || ""));
    groups.running.sort((a, b) => Number(isTrulyRunning(b)) - Number(isTrulyRunning(a)) || Date.parse(b.lastActivity || "") - Date.parse(a.lastActivity || ""));
    return groups;
  }, [runs]);

  const visible = tabRows[tab];

  return (
    <Panel className="h-full min-h-[620px] overflow-hidden p-3">
      <SectionHeader
        label="Runs"
        title="Live queue"
        action={<Pill tone={runs.some(isTrulyRunning) ? "accent" : "neutral"}>{runs.length}</Pill>}
      />
      <div className="mb-3 grid grid-cols-4 gap-1 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-1)] p-1">
        {RUN_TABS.map((entry) => {
          const count = tabCounts[entry.key];
          const isActive = tab === entry.key;
          const tone = entry.key === "failed" && count > 0 ? "var(--down)" : entry.key === "running" ? "var(--accent)" : entry.key === "done" ? "var(--up)" : "var(--text-2)";
          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => setTab(entry.key)}
              className={`flex flex-col items-center gap-0.5 rounded-[var(--r-sm)] px-2 py-1.5 text-[11px] font-medium transition ${
                isActive ? "bg-[var(--surface-2)] text-[var(--text)]" : "text-[var(--text-3)] hover:text-[var(--text-2)]"
              }`}
            >
              <span className="flex items-center gap-1.5">
                {entry.label}
                <span className="num rounded-full px-1.5 text-[10px]" style={{ color: count > 0 ? tone : "var(--text-4)" }}>
                  {count}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {!loaded ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-24" />)}
        </div>
      ) : runs.length === 0 ? (
        <EmptyState icon={<GitBranch className="h-6 w-6" />} title="No mirrored runs" hint="The local bridge has not published run traces yet." />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<GitBranch className="h-6 w-6" />}
          title={tab === "failed" ? "No failures" : tab === "done" ? "Nothing completed yet" : tab === "running" ? "Nothing running" : "Nothing queued"}
          hint={tab === "failed" ? "Failed goals will surface here for the Codex recovery lane." : "Runs appear as the conveyor dispatches them."}
        />
      ) : (
        <div className="max-h-[calc(100vh-280px)] space-y-2 overflow-y-auto pr-1">
          {visible.map((run) => {
            const running = isTrulyRunning(run);
            return (
              <button
                key={run.goal}
                type="button"
                onClick={() => onSelect(run.goal)}
                className={`w-full rounded-[var(--r-md)] border p-3 text-left transition ${
                  selected === run.goal
                    ? "border-[var(--line-strong)] bg-[var(--surface-2)]"
                    : "border-[var(--line)] bg-transparent hover:bg-[var(--surface-1)]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-semibold text-[var(--text)]">{run.goal}</p>
                    <p className="num mt-1 text-[10.5px] text-[var(--text-4)]">
                      {fmtRelative(run.lastActivity)} · attempt {run.attempts}
                    </p>
                  </div>
                  <Pill tone={statusTone(run.status, running)} className="!py-0.5 !text-[10px]">
                    {running ? "running" : run.status}
                  </Pill>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {run.nodeLabels.slice(0, 4).map((node) => (
                    <span key={node} className="rounded-full border border-[var(--line)] px-2 py-1 text-[10.5px] text-[var(--text-3)]">
                      {node}
                    </span>
                  ))}
                  <span className="rounded-full border border-[var(--line)] px-2 py-1 text-[10.5px] text-[var(--text-4)]">
                    {run.filesTouched} files
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
      {tab === "failed" && (
        <RecoveryLog events={recovery} forGoal={selected && tabRows.failed.some((r) => r.goal === selected) ? selected : null} />
      )}
    </Panel>
  );
}

function LearningPanel({ graph }: { graph: RunGraph | null }) {
  const latest = graph?.learnings.at(-1);
  return (
    <Panel className="h-full min-h-[620px] overflow-hidden p-5">
      <SectionHeader
        label="Scribe"
        title="Learned / inferred"
        action={graph ? <Pill tone="neutral">attempt {graph.attempt}</Pill> : null}
      />
      {!graph ? (
        <EmptyState icon={<Info className="h-6 w-6" />} title="Select a run" hint="Scribe notes appear beside the execution graph." />
      ) : !latest ? (
        <EmptyState icon={<Info className="h-6 w-6" />} title="No scribe notes" hint="This run has no learned or inferred entries mirrored yet." />
      ) : (
        <div className="max-h-[calc(100vh-250px)] overflow-y-auto pr-1">
          <div>
            <Eyebrow>Learned</Eyebrow>
            <ul className="mt-3 space-y-2">
              {latest.learned.slice(0, 10).map((item) => (
                <li key={item} className="rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-1)] px-3 py-2 text-[12px] leading-relaxed text-[var(--text-2)]">
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-6">
            <Eyebrow>Inferred</Eyebrow>
            <ul className="mt-3 space-y-2">
              {latest.inferred.slice(0, 8).map((item) => (
                <li key={item} className="rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-1)] px-3 py-2 text-[12px] leading-relaxed text-[var(--text-2)]">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Panel>
  );
}

type PipelineStageState = "idle" | "active" | "ok" | "fail" | "building";

function stageTone(state: PipelineStageState): RunStatusTone {
  if (state === "ok") return "up";
  if (state === "fail") return "down";
  if (state === "active" || state === "building") return "accent";
  return "neutral";
}

function stageIcon(state: PipelineStageState) {
  if (state === "ok") return <Check className="h-3 w-3" />;
  if (state === "fail") return <X className="h-3 w-3" />;
  return null;
}

function PipelineStage({
  label,
  state,
  href,
}: {
  label: string;
  state: PipelineStageState;
  href?: string | null;
}) {
  const className = `pipeline-stage ${state === "active" || state === "building" ? "pipeline-glow" : ""}`;
  const pill = (
    <Pill tone={stageTone(state)} className={className}>
      {stageIcon(state)}
      <span>{label}</span>
      {href && <ExternalLink className="h-3 w-3" />}
    </Pill>
  );
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex">
      {pill}
    </a>
  ) : pill;
}

function PipelineStrip({ run }: { run: RunIndex | null }) {
  if (!run) return null;
  const status = normalizeStatus(run.status);
  const rung = run.rung ?? 0;
  const running = isTrulyRunning(run);
  const failed = isFailedStatus(status);
  const terminalSuccess = isTerminalSuccessStatus(status);
  const shipping = ["shipping", "deploying"].includes(status);
  const productionBuilding = shipping;
  const hasPr = Boolean(run.shipped_pr);
  const hasPreview = Boolean(run.preview_url);
  const productionOk = terminalSuccess && hasPr;

  const localState: PipelineStageState =
    failed && rung === 0 ? "fail"
    : running && rung === 0 ? "active"
    : rung > 0 || terminalSuccess || shipping ? "ok"
    : "idle";
  const cloudState: PipelineStageState =
    failed && rung >= 1 ? "fail"
    : running && rung >= 1 ? "active"
    : rung >= 1 && (terminalSuccess || shipping) ? "ok"
    : "idle";
  const gateState: PipelineStageState =
    failed ? "fail"
    : terminalSuccess ? "ok"
    : running ? "active"
    : "idle";
  const previewState: PipelineStageState =
    hasPreview || (terminalSuccess && hasPr) ? "ok"
    : hasPr && !productionOk ? "building"
    : "idle";
  const productionState: PipelineStageState =
    productionOk ? "ok"
    : productionBuilding ? "building"
    : "idle";

  return (
    <div className="pipeline-strip mx-5 mt-3 flex min-w-0 flex-wrap items-center gap-2 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-1)] px-3 py-2">
      <PipelineStage label="Local" state={localState} />
      <PipelineStage label="Cloud (Codex)" state={cloudState} />
      <PipelineStage label="Gate" state={gateState} />
      <PipelineStage label={previewState === "building" ? "Preview building" : "Preview"} state={previewState} href={run.preview_url} />
      <PipelineStage label={productionState === "building" ? "Production building" : "Production"} state={productionState} />
    </div>
  );
}

function graphHasSubstantiveContent(graph: RunGraph, nodeCount: number) {
  if (nodeCount === 0) return false;
  if (graph.hasSubstantiveContent === false) return false;
  return true;
}

function FlowCanvas({ graph, loaded, selectedRun }: { graph: RunGraph | null; loaded: boolean; selectedRun: RunIndex | null }) {
  const selectedRunIsLive = isTrulyRunning(selectedRun);
  const built = useMemo(() => graph ? buildGraph(graph, selectedRunIsLive) : { nodes: [], edges: [] }, [graph, selectedRunIsLive]);
  const [nodes, setNodes, onNodesChange] = useNodesState<FloorNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const flowRef = useRef<ReactFlowInstance<FloorNode, Edge> | null>(null);
  const fittedGoalRef = useRef<string | null>(null);
  const timeline = graph?.timeline?.slice(-15).reverse() ?? [];
  const headerStatus = selectedRun?.status || graph?.status || "unknown";
  const headerRunning = selectedRunIsLive;
  const hasGraphContent = graph ? graphHasSubstantiveContent(graph, built.nodes.length) : false;

  useEffect(() => {
    if (!graph) {
      setNodes([]);
      setEdges([]);
      return;
    }
    setNodes((current) => mergeNodes(current as FloorNode[], built.nodes));
    setEdges((current) => mergeEdges(current, built.edges));
  }, [built.edges, built.nodes, graph, setEdges, setNodes]);

  useEffect(() => {
    if (!graph || nodes.length === 0 || !flowRef.current) return;
    if (fittedGoalRef.current === graph.goal) return;
    fittedGoalRef.current = graph.goal;
    const frame = requestAnimationFrame(() => {
      flowRef.current?.fitView({ padding: 0.16, duration: 360 });
    });
    return () => cancelAnimationFrame(frame);
  }, [graph, nodes.length]);

  return (
    <Panel className="min-h-[620px] overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
        <div className="min-w-0">
          <Eyebrow>Process graph</Eyebrow>
          <h2 className="mt-1 truncate text-[18px] font-semibold text-[var(--text)]">
            {graph?.goal || "No run selected"}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {graph && <Pill tone={statusTone(headerStatus, headerRunning)}>{headerRunning ? "running" : headerStatus}</Pill>}
          {graph && <Pill tone="neutral">{graph.counts.toolCalls} tools</Pill>}
          {graph && <Pill tone="neutral">{graph.files.length} files</Pill>}
        </div>
      </div>

      {graph && <PipelineStrip run={selectedRun} />}

      {graph && (
        <div className="floor-now-strip mx-5 mt-4 flex min-w-0 items-center gap-2 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-1)] px-3 py-2 text-[12px] text-[var(--text-2)]">
          <span className="floor-now-dot" aria-hidden="true" />
          <span className="truncate"><span className="font-semibold text-[var(--text)]">NOW</span> · {activityText(graph)}</span>
        </div>
      )}

      <div className="floor-flow h-[500px]">
        {!loaded ? (
          <div className="p-5">
            <Skeleton className="h-[460px]" />
          </div>
        ) : !graph ? (
          <EmptyState icon={<GitBranch className="h-6 w-6" />} title="No graph loaded" hint="Select a mirrored run from the rail." className="h-full" />
        ) : !hasGraphContent ? (
          <EmptyState
            icon={<Info className="h-6 w-6" />}
            title="No graph data"
            hint="This run has not yet produced a graph. Check back after the run progresses."
            className="h-full"
          />
        ) : headerRunning && graph.files.length === 0 && graph.counts.toolCalls === 0 && nodes.length <= 1 && edges.length === 0 ? (
          <EmptyState
            icon={<Radio className="h-6 w-6 animate-pulse" />}
            title="Planner starting — no steps yet"
            hint="The run just dispatched. Tool calls and touched files will appear here as the agent works."
            className="h-full"
          />
        ) : nodes.length === 0 ? (
          <EmptyState icon={<Bot className="h-6 w-6" />} title="Trace is empty" hint="The mirrored run has no agent or file events." className="h-full" />
        ) : (
          <ReactFlow<FloorNode, Edge>
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onInit={(instance) => { flowRef.current = instance; }}
            nodeTypes={nodeTypes}
            minZoom={0.25}
            maxZoom={1.4}
            nodesDraggable={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="rgba(255,255,255,0.08)" gap={24} size={1} />
            <MiniMap
              pannable
              zoomable
              nodeColor={(node) => node.type === "agent" ? "var(--accent)" : "var(--text-3)"}
              maskColor="rgba(10,11,13,0.68)"
            />
            <Controls showInteractive={false} />
          </ReactFlow>
        )}
      </div>

      {graph && timeline.length > 0 && (
        <div className="border-t border-[var(--line)] px-5 py-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <Eyebrow>Sequence</Eyebrow>
            <Pill tone="neutral" className="!py-0.5 !text-[10px]">last {timeline.length}</Pill>
          </div>
          <ol className="grid max-h-32 gap-1.5 overflow-y-auto pr-1 md:grid-cols-2">
            {timeline.map((item) => (
              <li key={item.seq} className="min-w-0 truncate rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-1)] px-2.5 py-1.5 text-[11px] text-[var(--text-3)]">
                <span className="text-[var(--text-2)]">{timelineText(item)}</span>
                <span className="num ml-2 text-[var(--text-4)]">{fmtRelative(item.at)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Panel>
  );
}

function ConveyorBar({ conveyor, onSelect }: { conveyor: ConveyorState | null; onSelect: (goal: string) => void }) {
  const view = getConveyorFloorView(conveyor);
  const buildingNow = view.buildingNow;
  const upNext = conveyor?.upNext ?? [];
  const blocked = conveyor?.blocked ?? [];
  const blockedCount = conveyor?.counts?.blocked ?? blocked.length;
  const boxes = conveyor?.boxes ?? [];
  const coderModels = boxes.flatMap((b) => b.models).filter((m) => /qwen|coder/i.test(m));
  const plannerModels = boxes.flatMap((b) => b.models).filter((m) => /ornith/i.test(m));

  return (
    <section className="hq-rise mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3" style={rise(1)}>
      {/* BUILDING NOW */}
      <Panel>
        <SectionHeader title="Building now" action={<span className="text-[10px] text-[var(--text-3)]">{view.buildingActionLabel}</span>} />
        {buildingNow.length === 0 ? (
          <EmptyState
            title={view.emptyTitle}
            hint={view.emptyHint}
          />
        ) : (
          <ul className="space-y-2">
            {buildingNow.map((a) => {
              const recovering = isRecoveringActive(a);
              return (
              <li key={a.goalId}>
                <button
                  onClick={() => onSelect(a.goalId)}
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-left transition hover:border-[var(--accent)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12px] font-medium text-[var(--text)]">{a.goalId}</span>
                    <Pill tone={recovering ? "warn" : "accent"} className="!py-0.5 !text-[10px]">
                      {recovering ? "recovering" : "live"}
                    </Pill>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--text-3)]">
                    {a.status ? <span>status {a.status}</span> : null}
                    {a.rung != null ? <span>· rung {a.rung}</span> : null}
                    {a.attempts != null ? <span>· attempt {a.attempts}</span> : null}
                    {a.pr ? <span>· PR {String(a.pr).replace(/^.*\//, "#")}</span> : null}
                  </div>
                </button>
              </li>
            );
            })}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[var(--line)] pt-3 text-[10px] text-[var(--text-3)]">
          {boxes.map((b) => (
            <Pill key={b.host} tone={b.reachable ? "up" : "down"} className="!py-0.5 !text-[10px]">
              {b.label} {b.reachable ? "•" : "×"}
            </Pill>
          ))}
          {plannerModels.length ? <span>planner: {plannerModels[0]}</span> : null}
          {coderModels.length ? <span>· coder: {coderModels[0]}</span> : null}
        </div>
      </Panel>

      {/* UP NEXT — full staged pipeline in promote order (ready at top) */}
      <Panel>
        <SectionHeader
          title="Up next"
          action={
            <span className="text-[10px] text-[var(--text-3)]">
              {`${upNext.filter((g) => g.dependencyReady).length} ready · ${upNext.length} staged`}
            </span>
          }
        />
        {upNext.length === 0 ? (
          <EmptyState
            title="Nothing staged"
            hint={
              blockedCount > 0
                ? `${blockedCount} goal(s) held on failed deps or approval — see Blocked.`
                : "No staged goals in the pipeline."
            }
          />
        ) : (
          <ol className="space-y-2">
            {upNext.slice(0, 25).map((g, i) => (
              <li key={g.goalId}>
                <button
                  onClick={() => onSelect(g.goalId)}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition hover:border-[var(--accent)] ${
                    g.dependencyReady
                      ? "border-[var(--accent)]/40 bg-[var(--surface-2)]"
                      : "border-[var(--line)] bg-[var(--surface-2)] opacity-70"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] tabular-nums text-[var(--text-3)]">{i + 1}</span>
                    <span className="flex-1 truncate text-[12px] text-[var(--text)]">{g.title}</span>
                    {g.dependencyReady ? (
                      <Pill tone="up" className="!py-0.5 !text-[10px]">ready</Pill>
                    ) : g.planRequired ? (
                      <Pill tone="warn" className="!py-0.5 !text-[10px]">plan</Pill>
                    ) : (
                      <Pill tone="neutral" className="!py-0.5 !text-[10px]">waiting</Pill>
                    )}
                    {g.specialist ? <Pill tone="neutral" className="!py-0.5 !text-[10px]">{g.specialist}</Pill> : null}
                  </div>
                  <div className="mt-0.5 truncate pl-5 text-[10px] text-[var(--text-3)]">{g.goalId}</div>
                  {!g.dependencyReady && g.waitingOn && g.waitingOn.length ? (
                    <div className="mt-0.5 truncate pl-5 text-[10px] text-[var(--text-3)]">
                      waiting on: {g.waitingOn.join(", ")}
                    </div>
                  ) : null}
                </button>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      {/* BLOCKED — why the queue can't move */}
      <Panel>
        <SectionHeader title="Blocked" action={<span className="text-[10px] text-[var(--text-3)]">{`${blocked.length} held`}</span>} />
        {blocked.length === 0 ? (
          <EmptyState title="Nothing blocked" hint="All staged goals are ready or in flight." />
        ) : (
          <ul className="space-y-2">
            {blocked.slice(0, 12).map((b) => (
              <li key={b.goalId} className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[12px] text-[var(--text)]">{b.goalId}</span>
                  <Pill tone={b.queueState === "hard_stop" ? "down" : b.queueState === "invalid" ? "warn" : "neutral"} className="!py-0.5 !text-[10px]">
                    {b.queueState}
                  </Pill>
                </div>
                {b.blockedBy.length ? (
                  <div className="mt-1 text-[10px] text-[var(--text-3)]">
                    waiting on: {b.blockedBy.map((d) => (b.failedDependencies.includes(d) ? `${d} (failed)` : d)).join(", ")}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </section>
  );
}

export default function FloorPage() {
  const [runs, setRuns] = useState<RunIndex[]>([]);
  const [runsLoaded, setRunsLoaded] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);
  const [graph, setGraph] = useState<RunGraph | null>(null);
  const [graphLoaded, setGraphLoaded] = useState(false);
  const [recovery, setRecovery] = useState<RecoveryEvent[]>([]);
  const [conveyor, setConveyor] = useState<ConveyorState | null>(null);
  const runsRef = useRef<RunIndex[]>([]);
  const graphRunningRef = useRef(false);

  useEffect(() => {
    runsRef.current = runs;
  }, [runs]);

  useEffect(() => {
    graphRunningRef.current = graph?.running ?? false;
  }, [graph?.running]);

  const loadRuns = useCallback(async () => {
    const data = await getJSON<RunIndex[]>("/api/runs");
    if (data) {
      setRuns(data);
      setSelectedGoal((current) => current && data.some((run) => run.goal === current) ? current : defaultSelectedGoal(data));
    }
    setRunsLoaded(true);
    const rec = await getJSON<{ events?: RecoveryEvent[] }>("/api/recovery");
    if (rec && Array.isArray(rec.events)) setRecovery(rec.events);
    const conv = await getJSON<ConveyorState>("/api/conveyor");
    if (conv) setConveyor(conv);
  }, []);

  const loadGraph = useCallback(async (goal: string) => {
    const data = await getJSON<RunGraph>(`/api/runs/${encodeURIComponent(goal)}`);
    setGraph(data);
    setGraphLoaded(true);
  }, []);

  useEffect(() => {
    void loadRuns();
    const interval = setInterval(loadRuns, 4_000);
    return () => clearInterval(interval);
  }, [loadRuns]);

  useEffect(() => {
    if (!selectedGoal) {
      setGraph(null);
      setGraphLoaded(runsLoaded);
      return;
    }
    setGraphLoaded(false);
    void loadGraph(selectedGoal);
    const interval = setInterval(() => {
      const selectedRun = runsRef.current.find((run) => run.goal === selectedGoal);
      if (selectedRun ? isTrulyRunning(selectedRun) : graphRunningRef.current) void loadGraph(selectedGoal);
    }, 4_000);
    return () => clearInterval(interval);
  }, [loadGraph, runsLoaded, selectedGoal]);

  const selectedRun = selectedGoal ? runs.find((run) => run.goal === selectedGoal) ?? null : null;

  const conveyorView = getConveyorFloorView(conveyor);
  const upNext = conveyor?.upNext ?? [];
  const blockedCount = conveyor?.counts?.blocked ?? (conveyor?.blocked?.length ?? 0);

  return (
    <div className="relative z-10 w-full mx-auto p-8 pb-16 text-[var(--text)]">
      <div className="hq-rise flex flex-wrap items-end justify-between gap-6" style={rise(0)}>
        <div>
          <Eyebrow>Operating floor</Eyebrow>
          <h1 className="mt-2.5 text-[40px] font-semibold tracking-[-0.025em] leading-none text-[var(--text)]">
            Live Process View
          </h1>
          <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-[var(--text-3)]">
            Agent handoffs, tool calls, touched files, and scribe autopsies mirrored from the local ChatDev trace bridge.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={conveyorView.headerConveyorTone}>
            <Radio className="h-3 w-3" />
            {conveyorView.headerConveyorLabel}
          </Pill>
          <Pill tone={conveyorView.headerCountTone}>
            {conveyorView.headerCountLabel}
          </Pill>
          <Pill tone={upNext.length ? "warn" : "neutral"}>
            {upNext.length} up next
          </Pill>
          {blockedCount ? <Pill tone="neutral">{blockedCount} blocked</Pill> : null}
          <Pill tone={conveyorView.headerStatusTone}>
            <RefreshCw className="h-3 w-3" />
            {conveyorView.headerStatusLabel}
          </Pill>
        </div>
      </div>

      <ConveyorBar conveyor={conveyor} onSelect={setSelectedGoal} />

      <section className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[340px_minmax(0,1fr)_340px]">
        <RunRail runs={runs} selected={selectedGoal} loaded={runsLoaded} onSelect={setSelectedGoal} recovery={recovery} />
        <FlowCanvas graph={graph} loaded={graphLoaded} selectedRun={selectedRun} />
        <LearningPanel graph={graph} />
      </section>
    </div>
  );
}
