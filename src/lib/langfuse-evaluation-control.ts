import {
  parseObservabilityWindow,
  type ObservabilityWindow,
} from "./langfuse-observability.ts";

const WINDOW_MS: Record<ObservabilityWindow, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

const DEFAULT_LIMIT = 100;
const DEFAULT_MAX_PAGES = 8;
const DEFAULT_MAX_ROWS = 800;
const DEFAULT_TIMEOUT_MS = 6000;

type ResourceStatus = "ok" | "unavailable" | "error";
type ScoreDataType = "NUMERIC" | "BOOLEAN" | "CATEGORICAL" | "TEXT" | "UNKNOWN";
type ScoreSource = "API" | "ANNOTATION" | "EVAL" | "UNKNOWN";
type ScoreTargetKind = "trace" | "session" | "observation" | "experiment";

interface LangfuseConfig {
  baseUrl: URL;
  publicKey: string;
  secretKey: string;
}

interface CollectOptions {
  now?: Date;
  fetchImpl?: typeof fetch;
  maxPages?: number;
  maxRows?: number;
  timeoutMs?: number;
}

export interface ResourceHealth {
  status: ResourceStatus;
  message: string;
  rows: number;
  pages: number;
  truncated: boolean;
  checkedAt: string | null;
}

export interface ResourceResult<T> {
  health: ResourceHealth;
  data: T;
}

export interface ScoreAggregate {
  key: string;
  name: string;
  source: ScoreSource;
  dataType: ScoreDataType;
  count: number;
  targetCount: number;
  latestTimestamp: string | null;
  numeric: { avg: number; min: number; max: number } | null;
  boolean: { trueCount: number; falseCount: number; trueRate: number | null } | null;
  categorical: Array<{ value: string; count: number }>;
  textCount: number;
  langfusePath: string | null;
}

export interface ScoreSummary {
  aggregates: ScoreAggregate[];
  totalScores: number;
  uniqueTargets: number;
  traceTargets: number;
  sessionTargets: number;
  observationTargets: number;
  experimentTargets: number;
  /** @deprecated Use experimentTargets. Kept for existing dashboard clients. */
  datasetRunTargets: number;
}

export interface PromptRegistryEntry {
  key: string;
  name: string;
  family: string | null;
  type: string | null;
  version: number | string | null;
  hash: string | null;
  labels: string[];
  tags: string[];
  createdAt: string | null;
  updatedAt: string | null;
  usageCount: number | null;
  linkedScoreNames: string[];
  langfusePath: string | null;
}

export interface PromptSummary {
  prompts: PromptRegistryEntry[];
  families: number;
  versions: number;
}

export interface EvaluatorStatus {
  key: string;
  name: string;
  type: string | null;
  status: "available" | "unavailable";
  sampling: string | null;
  scoreName: string | null;
  latestTimestamp: string | null;
}

export interface DatasetStatus {
  key: string;
  name: string;
  itemCount: number | null;
  latestTimestamp: string | null;
  langfusePath: string | null;
}

export interface ExperimentStatus {
  key: string;
  name: string;
  datasetName: string | null;
  status: string | null;
  latestTimestamp: string | null;
  langfusePath: string | null;
}

export interface LangfuseEvaluationControl {
  source: {
    status: ResourceStatus;
    window: ObservabilityWindow;
    fromTimestamp: string;
    toTimestamp: string;
    message: string;
    checkedAt: string;
  };
  scores: ResourceResult<ScoreSummary>;
  prompts: ResourceResult<PromptSummary>;
  evaluators: ResourceResult<EvaluatorStatus[]>;
  datasets: ResourceResult<DatasetStatus[]>;
  experiments: ResourceResult<ExperimentStatus[]>;
}

interface PageResult {
  rows: unknown[];
  pages: number;
  truncated: boolean;
}

interface ScoreRow {
  id: string | null;
  name: string;
  source: ScoreSource;
  dataType: ScoreDataType;
  value: unknown;
  target: ScoreTarget | null;
  timestamp: string | null;
  projectId: string | null;
}

interface ScoreTarget {
  kind: ScoreTargetKind;
  id: string;
}

interface PromptRow {
  name: string | null;
  family: string | null;
  type: string | null;
  version: number | string | null;
  hash: string | null;
  labels: string[];
  tags: string[];
  createdAt: string | null;
  updatedAt: string | null;
  usageCount: number | null;
  projectId: string | null;
}

export function parseEvaluationWindow(value: string | null): ObservabilityWindow | null {
  return parseObservabilityWindow(value);
}

export async function collectLangfuseEvaluationControl(
  window: ObservabilityWindow,
  options: CollectOptions = {},
): Promise<LangfuseEvaluationControl> {
  const now = options.now ?? new Date();
  const range = getWindowRange(window, now);
  const checkedAt = new Date().toISOString();
  const baseSource = {
    status: "ok" as ResourceStatus,
    window,
    fromTimestamp: range.fromTimestamp,
    toTimestamp: range.toTimestamp,
    message: "Langfuse read adapters checked",
    checkedAt,
  };

  let config: LangfuseConfig;
  try {
    config = getLangfuseConfig();
  } catch (error) {
    const health = resourceHealth("error", safeFailureMessage(error), 0, 0, false, null);
    return {
      source: { ...baseSource, status: "error", message: "Langfuse server credentials unavailable" },
      scores: { health, data: emptyScoreSummary() },
      prompts: { health, data: emptyPromptSummary() },
      evaluators: { health, data: [] },
      datasets: { health, data: [] },
      experiments: { health, data: [] },
    };
  }

  const fetchOptions = {
    fetchImpl: options.fetchImpl ?? fetch,
    maxPages: options.maxPages ?? DEFAULT_MAX_PAGES,
    maxRows: options.maxRows ?? DEFAULT_MAX_ROWS,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };

  const [scores, prompts, evaluators, datasets, experiments] = await Promise.all([
    readScores(config, range, fetchOptions),
    readPrompts(config, fetchOptions),
    readOptionalResource(config, ["/api/public/evaluation-rules", "/api/public/eval/rules"], fetchOptions, parseEvaluators),
    readOptionalResource(config, ["/api/public/datasets"], fetchOptions, parseDatasets),
    readOptionalResource(config, ["/api/public/dataset-runs", "/api/public/experiments"], fetchOptions, parseExperiments),
  ]);
  const statuses = [scores.health.status, prompts.health.status, evaluators.health.status, datasets.health.status, experiments.health.status];
  const sourceStatus: ResourceStatus = statuses.every((status) => status === "ok")
    ? "ok"
    : statuses.some((status) => status === "ok")
      ? "unavailable"
      : "error";

  return {
    source: {
      ...baseSource,
      status: sourceStatus,
      message: sourceStatus === "ok" ? "Langfuse read adapters live" : "Langfuse read adapters partially available",
    },
    scores,
    prompts: linkPromptScores(prompts, scores.data.aggregates),
    evaluators,
    datasets,
    experiments,
  };
}

async function readScores(
  config: LangfuseConfig,
  range: { fromTimestamp: string; toTimestamp: string },
  options: Required<Pick<CollectOptions, "fetchImpl" | "maxPages" | "maxRows" | "timeoutMs">>,
): Promise<ResourceResult<ScoreSummary>> {
  try {
    const result = await fetchPaginated(config, "/api/public/v3/scores", options, {
      fromTimestamp: range.fromTimestamp,
      toTimestamp: range.toTimestamp,
      fields: "subject",
    });
    const rows = result.rows.map(parseScoreRow).filter((row): row is ScoreRow => row != null);
    return {
      health: resourceHealth("ok", "Scores API v3 live", rows.length, result.pages, result.truncated),
      data: aggregateScores(rows),
    };
  } catch (error) {
    return {
      health: resourceHealth(resourceStatusFromError(error), safeFailureMessage(error), 0, 0, false),
      data: emptyScoreSummary(),
    };
  }
}

async function readPrompts(
  config: LangfuseConfig,
  options: Required<Pick<CollectOptions, "fetchImpl" | "maxPages" | "maxRows" | "timeoutMs">>,
): Promise<ResourceResult<PromptSummary>> {
  try {
    const result = await fetchPaginated(config, "/api/public/v2/prompts", options);
    const prompts = result.rows.flatMap(parsePromptRows);
    return {
      health: resourceHealth("ok", "Prompts API v2 live", prompts.length, result.pages, result.truncated),
      data: aggregatePrompts(prompts),
    };
  } catch (error) {
    return {
      health: resourceHealth(resourceStatusFromError(error), safeFailureMessage(error), 0, 0, false),
      data: emptyPromptSummary(),
    };
  }
}

async function readOptionalResource<T>(
  config: LangfuseConfig,
  paths: string[],
  options: Required<Pick<CollectOptions, "fetchImpl" | "maxPages" | "maxRows" | "timeoutMs">>,
  parseRows: (rows: unknown[]) => T,
): Promise<ResourceResult<T>> {
  let lastError: unknown = null;
  for (const path of paths) {
    try {
      const result = await fetchPaginated(config, path, options);
      return {
        health: resourceHealth("ok", `${path} live`, result.rows.length, result.pages, result.truncated),
        data: parseRows(result.rows),
      };
    } catch (error) {
      lastError = error;
      if (!isUnavailableError(error)) break;
    }
  }

  return {
    health: resourceHealth(resourceStatusFromError(lastError), safeFailureMessage(lastError), 0, 0, false),
    data: parseRows([]),
  };
}

async function fetchPaginated(
  config: LangfuseConfig,
  path: string,
  options: Required<Pick<CollectOptions, "fetchImpl" | "maxPages" | "maxRows" | "timeoutMs">>,
  params: Record<string, string> = {},
): Promise<PageResult> {
  const rows: unknown[] = [];
  let cursor: string | null = null;
  let pages = 0;
  let truncated = false;

  do {
    if (pages >= options.maxPages || rows.length >= options.maxRows) {
      truncated = true;
      break;
    }
    const url = new URL(path, config.baseUrl);
    url.searchParams.set("limit", String(DEFAULT_LIMIT));
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    if (cursor) url.searchParams.set("cursor", cursor);

    const payload = await fetchLangfuseJson(url, config, options);
    const page = parsePage(payload);
    pages += 1;

    const remainingRows = options.maxRows - rows.length;
    rows.push(...page.rows.slice(0, remainingRows));
    if (page.rows.length > remainingRows) {
      truncated = true;
      break;
    }
    cursor = page.nextCursor;
  } while (cursor);

  if (cursor) truncated = true;
  return { rows, pages, truncated };
}

async function fetchLangfuseJson(
  url: URL,
  config: LangfuseConfig,
  options: Required<Pick<CollectOptions, "fetchImpl" | "timeoutMs">>,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await options.fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${Buffer.from(`${config.publicKey}:${config.secretKey}`).toString("base64")}`,
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) throw new Error(`LANGFUSE_HTTP_${response.status}`);
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

function parsePage(payload: unknown): { rows: unknown[]; nextCursor: string | null } {
  const root = asRecord(payload);
  const rows = arrayValue(root.data) ?? arrayValue(root.scores) ?? arrayValue(root.prompts) ?? arrayValue(root.items);
  if (!rows) throw new Error("LANGFUSE_PAYLOAD_INVALID");
  const meta = asRecord(root.meta);
  const nextCursor =
    stringValue(meta.cursor) ??
    stringValue(root.nextCursor) ??
    stringValue(meta.nextCursor) ??
    stringValue(meta.nextPageCursor) ??
    stringValue(root.nextPageCursor);

  return { rows, nextCursor };
}

function parseScoreRow(value: unknown): ScoreRow | null {
  const row = asRecord(value);
  const name = safeText(row.name);
  if (!name) return null;
  const dataType = normalizeScoreDataType(row.dataType ?? row.data_type);
  const target = parseScoreSubject(row.subject) ?? parseLegacyScoreTarget(row);
  return {
    id: safeText(row.id),
    name,
    source: normalizeScoreSource(row.source),
    dataType,
    value: row.value,
    target,
    timestamp: safeText(row.timestamp ?? row.createdAt ?? row.updatedAt),
    projectId: safeProjectId(row.projectId),
  };
}

function parsePromptRows(value: unknown): PromptRow[] {
  const row = asRecord(value);
  const name = safeText(row.name);
  if (!name) return [];
  const metadata = asRecord(row.metadata);
  const base: Omit<PromptRow, "version" | "hash" | "labels" | "tags" | "createdAt" | "updatedAt"> = {
    name,
    family: safeText(metadata.family ?? metadata.prompt_family ?? row.family),
    type: safeText(row.type),
    usageCount: numberValue(row.usageCount ?? row.usage_count),
    projectId: safeProjectId(row.projectId),
  };
  const familyLabels = normalizeLabels(row.labels ?? row.label);
  const familyTags = normalizeLabels(row.tags ?? row.tag);
  const createdAt = safeText(row.createdAt);
  const updatedAt = safeText(row.updatedAt ?? row.lastUpdatedAt);
  const versions = arrayValue(row.versions);

  if (versions) {
    return versions.map((versionValue) => {
      const version = parsePromptVersion(versionValue);
      return {
        ...base,
        type: version.type ?? base.type,
        version: version.version,
        hash: version.hash,
        labels: mergeLabels(familyLabels, version.labels),
        tags: mergeLabels(familyTags, version.tags),
        createdAt: version.createdAt ?? createdAt,
        updatedAt: version.updatedAt ?? updatedAt,
      };
    });
  }

  return [{
    ...base,
    version: numberValue(row.version) ?? safeText(row.version),
    hash: safeText(metadata.hash ?? metadata.prompt_hash ?? row.hash),
    labels: familyLabels,
    tags: familyTags,
    createdAt,
    updatedAt,
  }];
}

function aggregateScores(rows: ScoreRow[]): ScoreSummary {
  const groups = new Map<string, ScoreRow[]>();
  const targets = new Set<string>();
  const targetsByKind: Record<ScoreTargetKind, Set<string>> = {
    trace: new Set(),
    session: new Set(),
    observation: new Set(),
    experiment: new Set(),
  };

  for (const row of rows) {
    const key = `${row.name}:${row.source}:${row.dataType}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);

    const target = scoreTarget(row);
    if (target) {
      targets.add(target);
      targetsByKind[row.target!.kind].add(row.target!.id);
    }
  }
  const experimentTargets = targetsByKind.experiment.size;

  return {
    aggregates: Array.from(groups.entries())
      .map(([key, group]) => aggregateScoreGroup(key, group))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 30),
    totalScores: rows.length,
    uniqueTargets: targets.size,
    traceTargets: targetsByKind.trace.size,
    sessionTargets: targetsByKind.session.size,
    observationTargets: targetsByKind.observation.size,
    experimentTargets,
    datasetRunTargets: experimentTargets,
  };
}

function aggregateScoreGroup(key: string, rows: ScoreRow[]): ScoreAggregate {
  const first = rows[0];
  const numericValues = rows.map((row) => numericScoreValue(row)).filter((value): value is number => value != null);
  const booleanValues = rows.map((row) => booleanScoreValue(row)).filter((value): value is boolean => value != null);
  const categorical = new Map<string, number>();
  let textCount = 0;
  const targetCount = new Set(rows.map(scoreTarget).filter((value): value is string => value != null)).size;

  for (const row of rows) {
    if (row.dataType === "CATEGORICAL") {
      const label = safeText(row.value) ?? "Unknown";
      categorical.set(label, (categorical.get(label) ?? 0) + 1);
    }
    if (row.dataType === "TEXT") textCount += 1;
  }

  const boolTrue = booleanValues.filter(Boolean).length;
  const projectId = rows.map((row) => row.projectId).find(Boolean) ?? null;

  return {
    key,
    name: first.name,
    source: first.source,
    dataType: first.dataType,
    count: rows.length,
    targetCount,
    latestTimestamp: latestIso(rows.map((row) => row.timestamp)),
    numeric: numericValues.length
      ? {
          avg: roundNumber(numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length),
          min: roundNumber(Math.min(...numericValues)),
          max: roundNumber(Math.max(...numericValues)),
        }
      : null,
    boolean: booleanValues.length
      ? {
          trueCount: boolTrue,
          falseCount: booleanValues.length - boolTrue,
          trueRate: roundNumber(boolTrue / booleanValues.length),
        }
      : null,
    categorical: Array.from(categorical.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
      .slice(0, 8),
    textCount,
    langfusePath: projectId ? `/project/${projectId}/scores` : null,
  };
}

function aggregatePrompts(rows: PromptRow[]): PromptSummary {
  const prompts = rows
    .map((row) => {
      const family = row.family ?? promptFamily(row.name ?? "");
      return {
        key: `${row.name}:${row.version ?? "unknown"}`,
        name: row.name ?? "Unknown",
        family,
        type: row.type,
        version: row.version,
        hash: row.hash,
        labels: row.labels,
        tags: row.tags,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        usageCount: row.usageCount,
        linkedScoreNames: [],
        langfusePath: row.projectId ? `/project/${row.projectId}/prompts/${encodeURIComponent(row.name ?? "")}` : null,
      };
    })
    .sort((a, b) => (Date.parse(b.updatedAt ?? "") || 0) - (Date.parse(a.updatedAt ?? "") || 0))
    .slice(0, 60);
  return {
    prompts,
    families: new Set(prompts.map((prompt) => prompt.family ?? prompt.name)).size,
    versions: prompts.length,
  };
}

function linkPromptScores(
  prompts: ResourceResult<PromptSummary>,
  scores: ScoreAggregate[],
): ResourceResult<PromptSummary> {
  const linked = prompts.data.prompts.map((prompt) => {
    const names = scores
      .filter((score) => score.name.toLowerCase().includes(prompt.name.toLowerCase()))
      .map((score) => score.name)
      .slice(0, 4);
    return { ...prompt, linkedScoreNames: names };
  });
  return { ...prompts, data: { ...prompts.data, prompts: linked } };
}

function parseEvaluators(rows: unknown[]): EvaluatorStatus[] {
  return rows.map((value, index) => {
    const row = asRecord(value);
    const name = safeText(row.name) ?? safeText(row.scoreName) ?? `Evaluator ${index + 1}`;
    return {
      key: safeText(row.id) ?? name,
      name,
      type: safeText(row.type ?? row.evaluatorType),
      status: "available",
      sampling: safeText(row.sampling ?? row.sampleRate ?? row.executionMode),
      scoreName: safeText(row.scoreName ?? row.score_name),
      latestTimestamp: safeText(row.updatedAt ?? row.createdAt),
    };
  });
}

function parseDatasets(rows: unknown[]): DatasetStatus[] {
  return rows.map((value, index) => {
    const row = asRecord(value);
    const name = safeText(row.name) ?? `Dataset ${index + 1}`;
    const projectId = safeProjectId(row.projectId);
    return {
      key: safeText(row.id) ?? name,
      name,
      itemCount: numberValue(row.itemCount ?? row.itemsCount),
      latestTimestamp: safeText(row.updatedAt ?? row.createdAt),
      langfusePath: projectId ? `/project/${projectId}/datasets/${encodeURIComponent(name)}` : null,
    };
  });
}

function parseExperiments(rows: unknown[]): ExperimentStatus[] {
  return rows.map((value, index) => {
    const row = asRecord(value);
    const name = safeText(row.name) ?? `Experiment ${index + 1}`;
    const projectId = safeProjectId(row.projectId);
    return {
      key: safeText(row.id) ?? name,
      name,
      datasetName: safeText(row.datasetName),
      status: safeText(row.status),
      latestTimestamp: safeText(row.updatedAt ?? row.createdAt),
      langfusePath: projectId ? `/project/${projectId}/datasets` : null,
    };
  });
}

function emptyScoreSummary(): ScoreSummary {
  return {
    aggregates: [],
    totalScores: 0,
    uniqueTargets: 0,
    traceTargets: 0,
    sessionTargets: 0,
    observationTargets: 0,
    experimentTargets: 0,
    datasetRunTargets: 0,
  };
}

function emptyPromptSummary(): PromptSummary {
  return { prompts: [], families: 0, versions: 0 };
}

function getWindowRange(window: ObservabilityWindow, now: Date) {
  const to = new Date(now.getTime());
  const from = new Date(now.getTime() - WINDOW_MS[window]);
  return {
    fromTimestamp: from.toISOString(),
    toTimestamp: to.toISOString(),
  };
}

function getLangfuseConfig(): LangfuseConfig {
  const base = process.env.HERMES_LANGFUSE_BASE_URL?.trim();
  const publicKey = process.env.HERMES_LANGFUSE_PUBLIC_KEY?.trim();
  const secretKey = process.env.HERMES_LANGFUSE_SECRET_KEY?.trim();

  if (!base || !publicKey || !secretKey) throw new Error("LANGFUSE_ENV_MISSING");

  let baseUrl: URL;
  try {
    baseUrl = new URL(base);
  } catch {
    throw new Error("LANGFUSE_ENV_INVALID");
  }

  return { baseUrl, publicKey, secretKey };
}

function resourceHealth(
  status: ResourceStatus,
  message: string,
  rows: number,
  pages: number,
  truncated: boolean,
  checkedAt: string | null = new Date().toISOString(),
): ResourceHealth {
  return { status, message, rows, pages, truncated, checkedAt };
}

function resourceStatusFromError(error: unknown): ResourceStatus {
  return isUnavailableError(error) ? "unavailable" : "error";
}

function isUnavailableError(error: unknown) {
  return error instanceof Error && /^LANGFUSE_HTTP_(404|405|410)$/.test(error.message);
}

function safeFailureMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Langfuse request failed.";
  if (error.message === "LANGFUSE_ENV_MISSING") return "Langfuse server credentials are not configured.";
  if (error.message === "LANGFUSE_ENV_INVALID") return "Langfuse base URL is invalid.";
  if (error.name === "AbortError") return "Langfuse request timed out.";
  if (error.message === "LANGFUSE_PAYLOAD_INVALID") return "Langfuse returned an unexpected payload shape.";
  if (error.message.startsWith("LANGFUSE_HTTP_")) {
    const status = error.message.replace("LANGFUSE_HTTP_", "");
    if (["404", "405", "410"].includes(status)) return "Langfuse public API endpoint is unavailable in this installation.";
    return `Langfuse returned HTTP ${status}.`;
  }
  return "Langfuse request failed.";
}

function normalizeScoreDataType(value: unknown): ScoreDataType {
  const text = safeText(value)?.toUpperCase();
  if (text === "NUMERIC" || text === "BOOLEAN" || text === "CATEGORICAL" || text === "TEXT") return text;
  return "UNKNOWN";
}

function normalizeScoreSource(value: unknown): ScoreSource {
  const text = safeText(value)?.toUpperCase();
  if (text === "API" || text === "ANNOTATION" || text === "EVAL") return text;
  return "UNKNOWN";
}

function normalizeLabels(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(safeText).filter((item): item is string => item != null).slice(0, 12);
  const label = safeText(value);
  return label ? [label] : [];
}

function scoreTarget(row: ScoreRow) {
  return row.target ? `${row.target.kind}:${row.target.id}` : null;
}

function parseScoreSubject(value: unknown): ScoreTarget | null {
  const text = safeText(value);
  if (text) {
    const match = /^(trace|session|observation|experiment):(.+)$/i.exec(text);
    if (!match) return null;
    const kind = normalizeScoreTargetKind(match[1]);
    const id = safeText(match[2]);
    return kind && id ? { kind, id } : null;
  }

  const subject = asRecord(value);
  const kind = normalizeScoreTargetKind(subject.kind ?? subject.type ?? subject.entityType ?? subject.object);
  if (!kind) return null;
  const id = safeText(
    subject.id ??
      subject.subjectId ??
      subject.entityId ??
      subject.targetId ??
      subject[`${kind}Id`],
  );
  return id ? { kind, id } : null;
}

function parseLegacyScoreTarget(row: Record<string, unknown>): ScoreTarget | null {
  const traceId = safeText(row.traceId);
  if (traceId) return { kind: "trace", id: traceId };
  const sessionId = safeText(row.sessionId);
  if (sessionId) return { kind: "session", id: sessionId };
  const observationId = safeText(row.observationId);
  if (observationId) return { kind: "observation", id: observationId };
  const experimentId = safeText(row.experimentId ?? row.datasetRunId ?? row.datasetRunItemId);
  if (experimentId) return { kind: "experiment", id: experimentId };
  return null;
}

function normalizeScoreTargetKind(value: unknown): ScoreTargetKind | null {
  const text = safeText(value)?.toLowerCase().replace(/[\s_-]/g, "");
  if (text === "trace") return "trace";
  if (text === "session") return "session";
  if (text === "observation") return "observation";
  if (text === "experiment" || text === "datasetrun" || text === "datasetitemrun") return "experiment";
  return null;
}

function parsePromptVersion(value: unknown): Pick<PromptRow, "version" | "hash" | "labels" | "tags" | "createdAt" | "updatedAt" | "type"> {
  if (typeof value === "number" || typeof value === "string") {
    return {
      version: numberValue(value) ?? safeText(value),
      hash: null,
      labels: [],
      tags: [],
      createdAt: null,
      updatedAt: null,
      type: null,
    };
  }

  const row = asRecord(value);
  const metadata = asRecord(row.metadata);
  return {
    version: numberValue(row.version) ?? safeText(row.version ?? row.id),
    hash: safeText(metadata.hash ?? metadata.prompt_hash ?? row.hash),
    labels: normalizeLabels(row.labels ?? row.label),
    tags: normalizeLabels(row.tags ?? row.tag),
    createdAt: safeText(row.createdAt),
    updatedAt: safeText(row.updatedAt ?? row.lastUpdatedAt),
    type: safeText(row.type),
  };
}

function mergeLabels(first: string[], second: string[]) {
  return Array.from(new Set([...first, ...second])).slice(0, 12);
}

function numericScoreValue(row: ScoreRow) {
  if (row.dataType === "NUMERIC") return numberValue(row.value);
  if (row.dataType === "BOOLEAN") {
    const value = booleanScoreValue(row);
    return value == null ? null : value ? 1 : 0;
  }
  return null;
}

function booleanScoreValue(row: ScoreRow) {
  if (row.dataType !== "BOOLEAN") return null;
  if (typeof row.value === "boolean") return row.value;
  const text = safeText(row.value);
  if (!text) return null;
  if (/^(true|1|yes|pass|passed)$/i.test(text)) return true;
  if (/^(false|0|no|fail|failed)$/i.test(text)) return false;
  return null;
}

function promptFamily(name: string) {
  const [family] = name.split(/[.:/]/);
  return family ? family.slice(0, 64) : null;
}

function latestIso(values: Array<string | null>) {
  const latest = values.reduce<number | null>((current, value) => {
    if (!value) return current;
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) return current;
    return Math.max(current ?? ms, ms);
  }, null);
  return latest == null ? null : new Date(latest).toISOString();
}

function safeProjectId(value: unknown) {
  const text = safeText(value);
  return text && /^[a-zA-Z0-9_-]{8,}$/.test(text) ? text : null;
}

function safeText(value: unknown) {
  const text = stringValue(value);
  if (!text) return null;
  return text.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 120);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundNumber(value: number) {
  return Math.round(value * 1000) / 1000;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function arrayValue(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}
