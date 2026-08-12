import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

type GoalState = "ready" | "running" | "done" | "failed";
type HealthStatus = "ok" | "warning" | "error";
type NativeSourceMode = "local-native" | "bridge-mirror";

const DEFAULT_MISSION_ROOT = "/home/phillip_downs/.hermes/mission-control";
const DEFAULT_PROFILES_ROOT = "/home/phillip_downs/.hermes/profiles";
const GOAL_STATES: GoalState[] = ["ready", "running", "done", "failed"];
const MAX_JSON_BYTES = 256 * 1024;
const MAX_GOAL_BYTES = 64 * 1024;
const MAX_CONFIG_BYTES = 128 * 1024;
const MAX_ARCHIVE_ROWS = 40;
const MAX_GOAL_ROWS_PER_STATE = 25;
const SECRET_PATTERN =
  /(api[_-]?key|secret|token|password|authorization|bearer\s+|sk-[a-z0-9]|pk-[a-z0-9]|AKIA[0-9A-Z]{16})/i;

export interface HermesNativeAgent {
  id: string;
  profile: string;
  name: string;
  role: string;
  modelClass: "local" | "cloud";
  model: string;
  provider: string;
  status: "running" | "on-demand" | "stopped";
  capabilities: string[];
  forbiddenActions: string[];
  cloudOrchestratorCallWhen: string | null;
  langfuseCoverage: string;
  compressionPolicy: string;
  contextLength: number | null;
  statusNote: string;
}

export interface HermesOperatorTask {
  id: string;
  title: string;
  status: "in_progress" | "pending" | "done" | "blocked";
  priority: "high" | "medium" | "low";
  updatedAt: string | null;
}

export interface HermesGoalSummary {
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

export interface HermesArchiveArtifactSummary {
  id: string;
  status: "done" | "failed";
  name: string;
  path: string;
  goal: string | null;
  bytes: number;
  sha256: string;
}

export interface HermesNativeSourceHealth {
  mode: NativeSourceMode;
  status: HealthStatus;
  message: string;
  roots: {
    missionControl: string;
    profiles: string;
    runtime: string;
    archive: string;
  };
  warnings: string[];
  errors: string[];
  checkedAt: string;
  lastSeen: string | null;
  stale: boolean;
}

export interface HermesNativeSnapshot {
  source: HermesNativeSourceHealth;
  policy: {
    primaryCloudOrchestrator: string;
    alwaysOnWorkers: boolean;
    modelLoadsPermittedByRoster: boolean;
    langfuseMode: string;
    runtimeNote: string;
  };
  agents: HermesNativeAgent[];
  operatorTasks: {
    updatedAt: string | null;
    tasks: HermesOperatorTask[];
    counts: Record<string, number>;
  };
  goals: {
    live: Record<GoalState, HermesGoalSummary[]>;
    counts: Record<GoalState, number>;
    current: HermesGoalSummary | null;
    recentFailed: HermesGoalSummary[];
  };
  archive: {
    root: string;
    counts: { done: number; failed: number; total: number };
    artifact_counts: { done: number; failed: number; total: number };
    manifestSha256: string | null;
    recent: HermesGoalSummary[];
    recentArtifacts: HermesArchiveArtifactSummary[];
  };
}

interface NativeRoots {
  missionControlRoot?: string;
  profilesRoot?: string;
}

interface SafeContext {
  warnings: string[];
  errors: string[];
}

interface ArchiveManifestRow {
  status: "done" | "failed";
  kind: "goal" | "artifact";
  name: string;
  path: string;
  goal: string | null;
  bytes: number;
  sha256: string;
}

export async function readHermesNativeSnapshot(
  roots: NativeRoots = {},
): Promise<HermesNativeSnapshot> {
  const missionControlRoot = roots.missionControlRoot ?? DEFAULT_MISSION_ROOT;
  const profilesRoot = roots.profilesRoot ?? DEFAULT_PROFILES_ROOT;
  const ctx: SafeContext = { warnings: [], errors: [] };
  const checkedAt = new Date().toISOString();

  const [roster, operatorTasks, goals, archive] = await Promise.all([
    readRoster(missionControlRoot, profilesRoot, ctx),
    readOperatorTasks(missionControlRoot, ctx),
    readLiveGoals(missionControlRoot, ctx),
    readArchive(missionControlRoot, ctx),
  ]);

  const status: HealthStatus = ctx.errors.length ? "error" : ctx.warnings.length ? "warning" : "ok";
  const current = goals.running[0] ?? goals.ready[0] ?? null;

  return {
    source: {
      mode: "local-native",
      status,
      message:
        status === "ok"
          ? "Native Hermes truth loaded"
          : status === "error"
            ? "Native Hermes truth unavailable or failed validation"
            : "Native Hermes truth loaded with bounded-reader warnings",
      roots: {
        missionControl: missionControlRoot,
        profiles: profilesRoot,
        runtime: path.join(missionControlRoot, "runtime"),
        archive: path.join(missionControlRoot, "archive/goals"),
      },
      warnings: ctx.warnings.slice(0, 20),
      errors: ctx.errors.slice(0, 20),
      checkedAt,
      lastSeen: checkedAt,
      stale: false,
    },
    policy: roster.policy,
    agents: roster.agents,
    operatorTasks,
    goals: {
      live: goals,
      counts: countGoalStates(goals),
      current,
      recentFailed: goals.failed.slice(0, 5),
    },
    archive,
  };
}

async function readRoster(root: string, profilesRoot: string, ctx: SafeContext) {
  const rosterRead = await readTextWithStatsAtRoot(root, "agent-roster.json", MAX_JSON_BYTES, ctx, true);
  if (!rosterRead) return emptyRosterPolicy("agent-roster.json unavailable");

  const payload = parseJsonStrict(rosterRead.text, ctx, "agent-roster.json");
  if (!payload) return emptyRosterPolicy("agent-roster.json invalid");

  const record = asRecord(payload);
  const policyRecord = asRecord(record.policy);
  const langfuseMode = safeString(policyRecord.langfuse_mode) ?? "metadata-only";
  const primary = safeString(policyRecord.primary_cloud_orchestrator) ?? "default";
  const profiles = arrayValue(record.profiles);
  if (!profiles || profiles.length === 0) {
    ctx.warnings.push("agent-roster.json: no configured profiles; no agents reported");
    return emptyRosterPolicy("agent-roster.json empty", primary, langfuseMode, policyRecord);
  }

  const agents: HermesNativeAgent[] = [];

  for (const item of profiles) {
    const row = asRecord(item);
    const profile = slugString(row.profile);
    if (!profile) continue;
    const config = await readProfileHints(profilesRoot, profile, ctx);
    const statusNote = safeString(row.status_note) ?? "on-demand specialist";
    const isDefault = profile === primary;
    agents.push({
      id: profile,
      profile,
      name: displayName(profile),
      role: safeString(row.role) ?? "Hermes specialist",
      modelClass: row.model_class === "cloud" ? "cloud" : "local",
      model: safeString(row.model) ?? config.model ?? "unknown",
      provider: safeString(row.provider) ?? config.provider ?? "unknown",
      status: isDefault ? "running" : statusNote.includes("retired") ? "stopped" : "on-demand",
      capabilities: stringArray(row.capabilities).slice(0, 8),
      forbiddenActions: stringArray(row.forbidden_actions).slice(0, 8),
      cloudOrchestratorCallWhen: safeString(row.cloud_orchestrator_call_when),
      langfuseCoverage: langfuseMode,
      compressionPolicy: config.compressionPolicy ?? "not declared",
      contextLength: config.contextLength,
      statusNote,
    });
  }

  agents.sort((a, b) => (a.profile === primary ? -1 : b.profile === primary ? 1 : a.profile.localeCompare(b.profile)));

  return {
    policy: {
      primaryCloudOrchestrator: primary,
      alwaysOnWorkers: Boolean(policyRecord.always_on_workers),
      modelLoadsPermittedByRoster: Boolean(policyRecord.model_loads_permitted_by_roster),
      langfuseMode,
      runtimeNote: agents.some((agent) => agent.profile === primary)
        ? "Only roster-declared running profiles are shown as running; specialists are on-demand to reduce cost."
        : "Primary cloud orchestrator is not present in the roster; no running default was synthesized.",
    },
    agents,
  };
}

function emptyRosterPolicy(
  reason: string,
  primary = "default",
  langfuseMode = "metadata-only",
  policyRecord: Record<string, unknown> = {},
) {
  return {
    policy: {
      primaryCloudOrchestrator: primary,
      alwaysOnWorkers: Boolean(policyRecord.always_on_workers),
      modelLoadsPermittedByRoster: Boolean(policyRecord.model_loads_permitted_by_roster),
      langfuseMode,
      runtimeNote: `No Hermes agents reported: ${reason}.`,
    },
    agents: [] as HermesNativeAgent[],
  };
}

async function readProfileHints(root: string, profile: string, ctx: SafeContext) {
  const rel = path.join(profile, "config.yaml");
  const text = await readTextAtRoot(root, rel, MAX_CONFIG_BYTES, ctx, false);
  if (!text) return { compressionPolicy: null, contextLength: null, model: null, provider: null };

  const withoutSecretLines = text
    .split(/\r?\n/)
    .filter((line) => !SECRET_PATTERN.test(line))
    .join("\n");
  const contextLength = firstNumber(withoutSecretLines.match(/context_length:\s*(\d+)/)?.[1]);
  const model = safeString(withoutSecretLines.match(/(?:^|\n)\s*default:\s*([^\n]+)/)?.[1]);
  const provider = safeString(withoutSecretLines.match(/(?:^|\n)\s*provider:\s*([^\n]+)/)?.[1]);
  const compressionEnabled = withoutSecretLines.match(/compression:[\s\S]*?enabled:\s*(true|false)/)?.[1];
  const threshold = withoutSecretLines.match(/compression:[\s\S]*?threshold:\s*([0-9.]+)/)?.[1];
  const target = withoutSecretLines.match(/compression:[\s\S]*?target_ratio:\s*([0-9.]+)/)?.[1];
  const compressionPolicy =
    compressionEnabled == null
      ? null
      : `enabled=${compressionEnabled}${threshold ? ` threshold=${threshold}` : ""}${target ? ` target=${target}` : ""}`;

  return {
    compressionPolicy,
    contextLength,
    model,
    provider,
  };
}

async function readOperatorTasks(root: string, ctx: SafeContext) {
  const payload = await readJsonAtRoot(root, "operator-tasks.json", MAX_JSON_BYTES, ctx);
  const record = asRecord(payload);
  const rows = arrayValue(record.tasks) ?? [];
  const tasks: HermesOperatorTask[] = rows.flatMap((item) => {
    const row = asRecord(item);
    const id = slugString(row.id);
    const title = safeDisplayText(row.title);
    if (!id || !title) return [];
    const status = normalizeTaskStatus(row.status);
    return [{
      id,
      title,
      status,
      priority: normalizePriority(row.priority),
      updatedAt: safeIso(row.updated_at ?? row.updatedAt) ?? safeIso(record.updated_at ?? record.updatedAt),
    }];
  });

  return {
    updatedAt: safeIso(record.updated_at ?? record.updatedAt),
    tasks,
    counts: tasks.reduce<Record<string, number>>((acc, task) => {
      acc[task.status] = (acc[task.status] ?? 0) + 1;
      return acc;
    }, {}),
  };
}

async function readLiveGoals(root: string, ctx: SafeContext): Promise<Record<GoalState, HermesGoalSummary[]>> {
  const result: Record<GoalState, HermesGoalSummary[]> = {
    ready: [],
    running: [],
    done: [],
    failed: [],
  };

  await Promise.all(GOAL_STATES.map(async (state) => {
    const relDir = path.join("runtime/goals", state);
    const entries = await listFilesAtRoot(root, relDir, ctx, MAX_GOAL_ROWS_PER_STATE);
    const rows: HermesGoalSummary[] = [];
    for (const entry of entries) {
      const rel = path.join(relDir, entry.name);
      const read = await readTextWithStatsAtRoot(root, rel, MAX_GOAL_BYTES, ctx, false);
      if (!read) continue;
      rows.push(parseGoalSummary(entry.name, state, "live-native", read.text, read.bytes));
    }
    result[state] = rows.sort(newestFirst);
  }));

  return result;
}

async function readArchive(root: string, ctx: SafeContext) {
  const manifestRead = await readTextWithStatsAtRoot(root, "archive/goals/import-manifest.json", MAX_JSON_BYTES, ctx, false);
  const manifest = manifestRead ? parseJson(manifestRead.text, ctx, "archive manifest") : {};
  const manifestRecord = asRecord(manifest);
  const countsRecord = asRecord(manifestRecord.counts);
  const artifactCountsRecord = asRecord(manifestRecord.artifact_counts);
  const manifestFiles = [...(arrayValue(manifestRecord.files) ?? []), ...(arrayValue(manifestRecord.artifacts) ?? [])];
  const goalFiles = manifestFiles.flatMap((item) => classifyArchiveManifestRow(item, "goal"));
  const artifactFiles = manifestFiles.flatMap((item) => classifyArchiveManifestRow(item, "artifact"));
  const counts = countArchiveRows(
    goalFiles,
    countsRecord,
    goalFiles.length === 0,
  );
  const artifact_counts = countArchiveRows(artifactFiles, artifactCountsRecord, true);

  const recent = goalFiles
    .slice(-MAX_ARCHIVE_ROWS)
    .reverse()
    .map((row) => {
      const status: GoalState = row.status;
      return {
        id: `archive-${status}-${row.path}`,
        title: titleFromFileName(row.name),
        state: status,
        source: "archive" as const,
        status,
        updatedAt: null,
        evidence: [],
        bytes: row.bytes,
        sha256: row.sha256,
      };
    });

  const recentArtifacts = artifactFiles
    .slice(-MAX_ARCHIVE_ROWS)
    .reverse()
    .map((row) => ({
      id: `archive-artifact-${row.status}-${row.path}`,
      status: row.status,
      name: row.name,
      path: row.path,
      goal: row.goal,
      bytes: row.bytes,
      sha256: row.sha256,
    }));

  return {
    root: path.join(root, "archive/goals"),
    counts,
    artifact_counts,
    manifestSha256: manifestRead ? sha256Hex(manifestRead.text) : null,
    recent,
    recentArtifacts,
  };
}

function classifyArchiveManifestRow(item: unknown, expectedKind: "goal" | "artifact"): ArchiveManifestRow[] {
  const row = asRecord(item);
  const status = row.status === "failed" ? "failed" : row.status === "done" ? "done" : null;
  const sha256 = safeHash(row.sha256);
  if (!status || !sha256) return [];

  const rawPath = safeArchiveRelPath(row.path) ?? safeArchiveRelPath(`${status}/${safeString(row.name) ?? ""}`);
  if (!rawPath) return [];
  const parts = rawPath.split("/");
  if (parts[0] !== status || parts.length < 2) return [];

  const name = safeFileName(parts[parts.length - 1]);
  if (!name) return [];

  const declaredKind = row.kind === "artifact" ? "artifact" : row.kind === "goal" ? "goal" : null;
  const inferredKind = parts.length === 2 && name.endsWith(".md") ? "goal" : "artifact";
  const kind = declaredKind ?? inferredKind;
  if (kind !== expectedKind) return [];

  return [{
    status,
    kind,
    name,
    path: rawPath,
    goal: kind === "artifact" ? safeDisplayText(row.goal) ?? safeDisplayText(parts[1]) : null,
    bytes: firstNumber(row.bytes) ?? 0,
    sha256,
  }];
}

function countArchiveRows(rows: ArchiveManifestRow[], manifestCounts: Record<string, unknown>, useManifestFallback: boolean) {
  if (rows.length || !useManifestFallback) {
    const done = rows.filter((row) => row.status === "done").length;
    const failed = rows.filter((row) => row.status === "failed").length;
    return { done, failed, total: done + failed };
  }

  const done = firstNumber(manifestCounts.done) ?? 0;
  const failed = firstNumber(manifestCounts.failed) ?? 0;
  return {
    done,
    failed,
    total: firstNumber(manifestCounts.total) ?? done + failed,
  };
}

function parseGoalSummary(
  name: string,
  state: GoalState,
  source: "live-native" | "archive",
  text: string,
  bytes: number,
): HermesGoalSummary {
  const trimmed = text.slice(0, MAX_GOAL_BYTES);
  const json = name.endsWith(".json") ? parseJson(trimmed, { warnings: [], errors: [] }, name) : null;
  const row = asRecord(json);
  const title =
    safeDisplayText(row.title) ??
    safeDisplayText(firstMarkdownHeading(trimmed)) ??
    titleFromFileName(name);
  const status = safeDisplayText(row.status) ?? safeDisplayText(frontmatterValue(trimmed, "status")) ?? state;
  const updatedAt =
    safeIso(row.updated_at ?? row.updatedAt ?? row.finishedAt ?? row.createdAt) ??
    safeIso(frontmatterValue(trimmed, "updated_at"));
  const evidence = [
    ...stringArray(row.evidence),
    ...frontmatterList(trimmed, "evidence"),
  ].filter((item) => !SECRET_PATTERN.test(item)).slice(0, 5);

  return {
    id: `${source}-${state}-${name}`,
    title,
    state,
    source,
    status,
    updatedAt,
    evidence,
    bytes,
  };
}

async function readJsonAtRoot(root: string, rel: string, maxBytes: number, ctx: SafeContext) {
  const read = await readTextAtRoot(root, rel, maxBytes, ctx, false);
  if (!read) return {};
  return parseJson(read, ctx, rel);
}

async function readTextAtRoot(
  root: string,
  rel: string,
  maxBytes: number,
  ctx: SafeContext,
  required: boolean,
) {
  const read = await readTextWithStatsAtRoot(root, rel, maxBytes, ctx, required);
  return read?.text ?? null;
}

async function readTextWithStatsAtRoot(
  root: string,
  rel: string,
  maxBytes: number,
  ctx: SafeContext,
  required: boolean,
) {
  try {
    const target = await resolveContainedPath(root, rel);
    const stat = await fs.stat(target);
    if (!stat.isFile()) throw new Error("not a regular file");
    if (stat.size > maxBytes) throw new Error(`file exceeds ${maxBytes} byte cap`);
    const text = await fs.readFile(target, "utf8");
    return { text, bytes: stat.size };
  } catch (error) {
    if (required) ctx.errors.push(`${rel}: ${safeError(error)}`);
    return null;
  }
}

async function listFilesAtRoot(root: string, rel: string, ctx: SafeContext, limit: number) {
  try {
    const dir = await resolveContainedPath(root, rel);
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (files.length >= limit) break;
      if (!entry.isFile()) {
        if (entry.isSymbolicLink()) ctx.warnings.push(`${path.join(rel, entry.name)}: symlink rejected`);
        continue;
      }
      if (!safeFileName(entry.name)) continue;
      files.push(entry);
    }
    return files;
  } catch (error) {
    ctx.warnings.push(`${rel}: ${safeError(error)}`);
    return [];
  }
}

async function resolveContainedPath(root: string, rel: string) {
  if (path.isAbsolute(rel) || rel.includes("\0")) throw new Error("invalid relative path");
  const normalizedRel = path.normalize(rel);
  if (normalizedRel.startsWith("..")) throw new Error("path escape rejected");
  const realRoot = await fs.realpath(root);
  const target = path.join(realRoot, normalizedRel);
  const lstat = await fs.lstat(target);
  if (lstat.isSymbolicLink()) throw new Error("symlink rejected");
  const realTarget = await fs.realpath(target);
  if (realTarget !== realRoot && !realTarget.startsWith(`${realRoot}${path.sep}`)) {
    throw new Error("path containment rejected");
  }
  return realTarget;
}

function countGoalStates(goals: Record<GoalState, HermesGoalSummary[]>) {
  return {
    ready: goals.ready.length,
    running: goals.running.length,
    done: goals.done.length,
    failed: goals.failed.length,
  };
}

function parseJson(text: string, ctx: SafeContext, label: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    ctx.warnings.push(`${label}: invalid JSON`);
    return {};
  }
}

function parseJsonStrict(text: string, ctx: SafeContext, label: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    ctx.errors.push(`${label}: invalid JSON`);
    return null;
  }
}

function normalizeTaskStatus(value: unknown): HermesOperatorTask["status"] {
  const text = safeString(value)?.toLowerCase().replace(/[\s-]+/g, "_");
  if (text === "in_progress" || text === "done" || text === "blocked") return text;
  return "pending";
}

function normalizePriority(value: unknown): HermesOperatorTask["priority"] {
  const text = safeString(value)?.toLowerCase();
  if (text === "low" || text === "medium") return text;
  return "high";
}

function safeDisplayText(value: unknown) {
  const text = safeString(value);
  if (!text || SECRET_PATTERN.test(text)) return null;
  return text.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 180);
}

function safeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  const arr = arrayValue(value);
  if (!arr) return [];
  return arr.flatMap((item) => {
    const text = safeDisplayText(item);
    return text ? [text] : [];
  });
}

function slugString(value: unknown) {
  const text = safeString(value);
  return text && /^[a-z0-9][a-z0-9._-]{0,80}$/i.test(text) ? text : null;
}

function safeFileName(value: unknown) {
  const text = safeString(value);
  if (!text || text.includes("/") || text.includes("\\") || text.includes("..")) return null;
  return text.slice(0, 180);
}

function safeArchiveRelPath(value: unknown) {
  const text = safeString(value);
  if (!text || text.includes("\\") || text.includes("\0")) return null;
  const normalized = path.posix.normalize(text.replaceAll(path.sep, "/"));
  if (normalized.startsWith("../") || normalized === ".." || normalized.startsWith("/")) return null;
  const parts = normalized.split("/");
  if (parts.length < 2 || parts.some((part) => !part || part === "." || part === "..")) return null;
  return parts.every((part) => safeFileName(part)) ? normalized.slice(0, 360) : null;
}

function safeHash(value: unknown) {
  const text = safeString(value);
  return text && /^[a-f0-9]{64}$/i.test(text) ? text.toLowerCase() : null;
}

function safeIso(value: unknown) {
  const text = safeString(value);
  if (!text) return null;
  const time = Date.parse(text);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function firstNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayValue(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function displayName(profile: string) {
  if (profile === "default") return "Default Cloud Orchestrator";
  if (profile === "codex") return "Codex Implementation Lane";
  return profile
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function titleFromFileName(name: string) {
  return name
    .replace(/\.(md|json|jsonl)$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180) || "Untitled goal";
}

function firstMarkdownHeading(text: string) {
  return text.match(/^#\s+(.+)$/m)?.[1] ?? null;
}

function frontmatterValue(text: string, key: string) {
  const fm = frontmatter(text);
  return fm.match(new RegExp(`^${key}:\\s*(.+)$`, "mi"))?.[1]?.replace(/^["']|["']$/g, "") ?? null;
}

function frontmatterList(text: string, key: string) {
  const fm = frontmatter(text);
  const match = fm.match(new RegExp(`^${key}:\\s*\\n((?:\\s*-\\s+.+\\n?)+)`, "mi"));
  if (!match?.[1]) return [];
  return match[1]
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*-\s+(.+)$/)?.[1])
    .filter(Boolean)
    .flatMap((item) => {
      const text = safeDisplayText(item);
      return text ? [text] : [];
    });
}

function frontmatter(text: string) {
  if (!text.startsWith("---")) return "";
  const end = text.indexOf("\n---", 3);
  if (end < 0 || end > 4096) return "";
  return text.slice(3, end);
}

function newestFirst(a: HermesGoalSummary, b: HermesGoalSummary) {
  return (Date.parse(b.updatedAt ?? "") || 0) - (Date.parse(a.updatedAt ?? "") || 0);
}

function sha256Hex(text: string) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message.replace(String(DEFAULT_MISSION_ROOT), "mission-root") : "read failed";
}
