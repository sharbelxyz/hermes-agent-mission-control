export type ObservabilityWindow = "24h" | "7d";

export const LANGFUSE_OBSERVATION_FIELDS =
  "core,basic,model,usage,metrics,metadata,trace_context";

const WINDOW_MS: Record<ObservabilityWindow, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

const DEFAULT_LIMIT = 1000;
const DEFAULT_MAX_PAGES = 10;
const DEFAULT_MAX_ROWS = 10_000;
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_CORRELATION_ID_LENGTH = 80;
const MAX_OPERATION_ROWS = 40;
const MAX_OPERATION_NESTED_IDS = 6;
const MAX_OBSERVATION_DEDUPE_KEY_PART_LENGTH = 120;

type HealthStatus = "ok" | "warning" | "error";
export type CorrelationStatus = "observed" | "partial" | "missing" | "invalid";
export type ValueState = "known" | "partial" | "unknown";

export type CostBasis =
  | "anthropic_claude_opus_4_6_estimate_cache_write_5m_assumed"
  | "local_zero"
  | "reported_only_unknown_cloud"
  | "reported_only_unknown"
  | "mixed";

export interface CostRange {
  low: number;
  high: number;
  basis: string;
}

interface CostFields {
  reportedCost: number;
  estimatedCost: number | null;
  effectiveCost: number;
  costBasis: CostBasis;
  costState: ValueState;
  estimatedCostRange?: CostRange;
}

export interface SourceHealth {
  status: HealthStatus;
  source: "langfuse";
  message: string;
  warning?: string;
  lastSync: string | null;
  window: ObservabilityWindow;
  fromStartTime: string;
  toStartTime: string;
  rows: number;
  filteredRows: number;
  includedRows: number;
  pages: number;
  truncated: boolean;
}

export interface ObservabilityTotals {
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

export interface ModelAggregate {
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

export interface SessionTraceAggregate {
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

export interface ObservabilityCompleteness {
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

export interface ToolAggregate {
  name: string;
  count: number;
  latestTimestamp: string | null;
}

export interface WorkflowSummary {
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

export interface ProviderAggregate {
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

export interface CorrelationCoverage {
  status: CorrelationStatus;
  totalObservations: number;
  eligibleObservations: number;
  withOperationId: number;
  withGoalId: number;
  withRunId: number;
  withStageId: number;
  invalidIdentifierObservations: number;
  fullyCorrelatedObservations: number;
  operationCount: number;
  fullyCorrelatedOperations: number;
  percentage: number | null;
}

export interface OperationAggregate {
  operationId: string;
  goalId: string | null;
  runId: string | null;
  stageId: string | null;
  traceIds: string[];
  sessionIds: string[];
  models: string[];
  providers: string[];
  platforms: string[];
  calls: number;
  generationCalls: number;
  observations: number;
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
  toolCalls: number;
  errors: number;
  startTime: string | null;
  endTime: string | null;
  durationMs: number | null;
  latestTimestamp: string | null;
  status: "ok" | "error";
  cohort: "graft" | "baseline";
}

export interface CohortSummary {
  operationCount: number;
  totalTokens: number;
  toolCalls: number;
  generationCalls: number;
  effectiveCost: number;
  avgTokensPerOperation: number | null;
  avgToolCallsPerOperation: number | null;
}

export interface CohortDelta {
  totalTokens: number;
  toolCalls: number;
  generationCalls: number;
  effectiveCost: number;
  avgTokensPerOperation: number | null;
  avgToolCallsPerOperation: number | null;
}

export interface GraftCohortLens {
  status: "observed" | "missing";
  signalObservations: number;
  signalOperations: number;
  graft: CohortSummary;
  baseline: CohortSummary;
  delta: CohortDelta;
}

export interface AccountingSummary {
  operationCount: number;
  rowCap: number;
  returnedOperations: number;
  truncatedOperations: boolean;
  reportedCost: number;
  estimatedCost: number | null;
  effectiveCost: number;
  costBasis: CostBasis;
  reconciliation: CorrelationStatus;
  warnings: string[];
}

export interface AmplificationMetrics {
  inputOutputRatio: number | null;
  contextAmplification: number | null;
  cacheReadRatio: number | null;
  cacheWriteRatio: number | null;
  deterministicFlags: string[];
}

export interface TimeSeriesBucket {
  bucketStart: string;
  label: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  effectiveCost: number;
  localTokens: number;
  cloudTokens: number;
  localCost: number;
  cloudCost: number;
  generationCalls: number;
  toolCalls: number;
}

export interface TimeSeries {
  window: ObservabilityWindow;
  bucketMs: number;
  buckets: TimeSeriesBucket[];
}

export interface WasteFlag {
  kind: "largest_token_session" | "repeated_tool" | "high_input_output_ratio";
  severity: "warn" | "down";
  label: string;
  detail: string;
  sessionId?: string | null;
  traceId?: string | null;
  value: number;
}

export interface HermesObservability {
  source: SourceHealth;
  totals: ObservabilityTotals | null;
  completeness: ObservabilityCompleteness | null;
  byModel: ModelAggregate[];
  byProvider: ProviderAggregate[];
  timeSeries: TimeSeries;
  correlationCoverage: CorrelationCoverage;
  operations: OperationAggregate[];
  accounting: AccountingSummary;
  graftCohort: GraftCohortLens;
  workflow: WorkflowSummary | null;
  amplification: AmplificationMetrics | null;
  sessions: SessionTraceAggregate[];
  tools: {
    recent: ToolAggregate[];
    repeated: ToolAggregate[];
  };
  topExpensiveTraces: SessionTraceAggregate[];
  topLargeTraces: SessionTraceAggregate[];
  wasteFlags: WasteFlag[];
  recommendations: string[];
}

interface CollectOptions {
  now?: Date;
  fetchImpl?: typeof fetch;
  maxPages?: number;
  maxRows?: number;
  timeoutMs?: number;
}

interface LangfuseConfig {
  baseUrl: URL;
  publicKey: string;
  secretKey: string;
}

interface ObservationPage {
  observations: Observation[];
  nextCursor: string | null;
}

interface Observation {
  id: string | null;
  parentObservationId: string | null;
  traceId: string | null;
  sessionId: string | null;
  startTime: string | null;
  endTime: string | null;
  type: string | null;
  name: string | null;
  level: string | null;
  statusMessage: string | null;
  model: string | null;
  providedModelName: string | null;
  usageDetails: Record<string, unknown>;
  costDetails: Record<string, unknown>;
  totalCost: number | null;
  latency: number | null;
  metadata: Record<string, unknown>;
}

interface SessionWork {
  id: string;
  sessionId: string | null;
  traceId: string | null;
  startMs: number | null;
  endMs: number | null;
  models: Set<string>;
  providers: Set<string>;
  platforms: Set<string>;
  parentObservationIds: Set<string>;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reportedCost: number;
  estimatedCost: number;
  hasEstimatedCost: boolean;
  effectiveCost: number;
  costBases: Set<CostBasis>;
  tokenEvidenceCount: number;
  missingTokenEvidenceCount: number;
  costEvidenceCount: number;
  missingCostEvidenceCount: number;
  estimatedCostRangeLow: number;
  estimatedCostRangeHigh: number;
  hasEstimatedCostRange: boolean;
  cost: number;
  toolCallCount: number;
  errorCount: number;
  latestMs: number | null;
}

interface CorrelationIds {
  operationId: string | null;
  goalId: string | null;
  runId: string | null;
  stageId: string | null;
  invalid: boolean;
}

interface OperationWork {
  operationId: string;
  goalIds: Set<string>;
  runIds: Set<string>;
  stageIds: Set<string>;
  traceIds: Set<string>;
  sessionIds: Set<string>;
  models: Set<string>;
  providers: Set<string>;
  platforms: Set<string>;
  countedObservationKeys: Set<string>;
  countedToolKeys: Set<string>;
  calls: number;
  generationCalls: number;
  observations: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reportedCost: number;
  estimatedCost: number;
  hasEstimatedCost: boolean;
  effectiveCost: number;
  costBases: Set<CostBasis>;
  estimatedCostRangeLow: number;
  estimatedCostRangeHigh: number;
  hasEstimatedCostRange: boolean;
  toolCalls: number;
  errors: number;
  hasGraftSignal: boolean;
  startMs: number | null;
  endMs: number | null;
  latestMs: number | null;
}

// Official Anthropic Claude Platform pricing page, checked 2026-08-05.
// Claude Opus 4.6 per 1M tokens: input $5, 5m cache write $6.25,
// 1h cache write $10, cache hit/refresh $0.50, output $25.
const OFFICIAL_MODEL_PRICING = {
  anthropicClaudeOpus46: {
    checkedAt: "2026-08-05",
    source: "Anthropic Claude Platform pricing page",
    inputPerMTok: 5,
    cacheWrite5mPerMTok: 6.25,
    cacheWrite1hPerMTok: 10,
    cacheReadPerMTok: 0.5,
    outputPerMTok: 25,
  },
} as const;

export function parseObservabilityWindow(value: string | null): ObservabilityWindow | null {
  if (value === "24h" || value === "7d") return value;
  return null;
}

export async function collectHermesObservability(
  window: ObservabilityWindow,
  options: CollectOptions = {},
): Promise<HermesObservability> {
  const now = options.now ?? new Date();
  const range = getWindowRange(window, now);
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS;

  try {
    const config = getLangfuseConfig();
    const pageResult = await fetchObservationPages(config, range, {
      fetchImpl: options.fetchImpl ?? fetch,
      maxPages,
      maxRows,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });
    return aggregateObservations(window, range, pageResult);
  } catch (error) {
    return failurePayload(window, range, safeFailureMessage(error));
  }
}

function getWindowRange(window: ObservabilityWindow, now: Date) {
  const to = new Date(now.getTime());
  const from = new Date(now.getTime() - WINDOW_MS[window]);
  return {
    fromStartTime: from.toISOString(),
    toStartTime: to.toISOString(),
  };
}

function getLangfuseConfig(): LangfuseConfig {
  const base = process.env.HERMES_LANGFUSE_BASE_URL?.trim();
  const publicKey = process.env.HERMES_LANGFUSE_PUBLIC_KEY?.trim();
  const secretKey = process.env.HERMES_LANGFUSE_SECRET_KEY?.trim();

  if (!base || !publicKey || !secretKey) {
    throw new Error("LANGFUSE_ENV_MISSING");
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(base);
  } catch {
    throw new Error("LANGFUSE_ENV_INVALID");
  }

  return {
    baseUrl,
    publicKey,
    secretKey,
  };
}

async function fetchObservationPages(
  config: LangfuseConfig,
  range: { fromStartTime: string; toStartTime: string },
  options: Required<Pick<CollectOptions, "fetchImpl" | "maxPages" | "maxRows" | "timeoutMs">>,
) {
  const observations: Observation[] = [];
  let cursor: string | null = null;
  let pages = 0;
  let truncated = false;

  do {
    if (pages >= options.maxPages || observations.length >= options.maxRows) {
      truncated = true;
      break;
    }

    const url = new URL("/api/public/v2/observations", config.baseUrl);
    url.searchParams.set("fromStartTime", range.fromStartTime);
    url.searchParams.set("toStartTime", range.toStartTime);
    url.searchParams.set("limit", String(DEFAULT_LIMIT));
    url.searchParams.set("fields", LANGFUSE_OBSERVATION_FIELDS);
    if (cursor) url.searchParams.set("cursor", cursor);

    const payload = await fetchLangfuseJson(url, config, options);
    const page = parseObservationPage(payload);
    pages += 1;

    const remainingRows = options.maxRows - observations.length;
    observations.push(...page.observations.slice(0, remainingRows));
    if (page.observations.length > remainingRows) {
      truncated = true;
      break;
    }

    cursor = page.nextCursor;
  } while (cursor);

  if (cursor) truncated = true;

  return { observations, pages, truncated };
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

    if (!response.ok) {
      throw new Error(`LANGFUSE_HTTP_${response.status}`);
    }

    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

function parseObservationPage(payload: unknown): ObservationPage {
  const root = asRecord(payload);
  const rows = arrayValue(root.data) ?? arrayValue(root.observations);
  if (!rows) throw new Error("LANGFUSE_PAYLOAD_INVALID");

  const meta = asRecord(root.meta);
  const nextCursor =
    stringValue(meta.cursor) ??
    stringValue(root.nextCursor) ??
    stringValue(meta.nextCursor) ??
    stringValue(meta.nextPageCursor) ??
    stringValue(root.nextPageCursor);

  return {
    observations: rows.map(parseObservation),
    nextCursor,
  };
}

function parseObservation(value: unknown): Observation {
  const row = asRecord(value);
  const metadata = asRecord(row.metadata);
  return {
    id: safeText(row.id),
    parentObservationId:
      safeText(row.parentObservationId) ??
      safeText(row.parent_observation_id) ??
      safeText(asRecord(row.traceContext).parentObservationId) ??
      safeText(asRecord(row.trace_context).parentObservationId),
    traceId: safeText(row.traceId),
    sessionId: safeText(row.sessionId),
    startTime: safeText(row.startTime),
    endTime: safeText(row.endTime),
    type: safeText(row.type),
    name: safeText(row.name),
    level: safeText(row.level),
    statusMessage: safeText(row.statusMessage),
    model: safeText(row.model),
    providedModelName: safeText(row.providedModelName),
    usageDetails: asRecord(row.usageDetails),
    costDetails: asRecord(row.costDetails),
    totalCost: numberValue(row.totalCost) ?? numberValue(asRecord(row.costDetails).total),
    latency: numberValue(row.latency),
    metadata,
  };
}

function aggregateObservations(
  window: ObservabilityWindow,
  range: { fromStartTime: string; toStartTime: string },
  pageResult: { observations: Observation[]; pages: number; truncated: boolean },
): HermesObservability {
  const totals: ObservabilityTotals = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reportedCost: 0,
    estimatedCost: null,
    effectiveCost: 0,
    costBasis: "reported_only_unknown",
    totalCost: 0,
    generationCalls: 0,
    toolCalls: 0,
    uniqueTraces: 0,
    uniqueSessions: 0,
    errors: 0,
    latestTimestamp: null,
  };
  const traces = new Set<string>();
  const sessions = new Set<string>();
  const models = new Map<string, ModelAggregate>();
  const providers = new Map<string, ProviderAggregate>();
  const sessionMap = new Map<string, SessionWork>();
  const operationMap = new Map<string, OperationWork>();
  const tools = new Map<string, ToolAggregate>();
  const observationTypes = new Map<string, number>();
  const observationIds = new Set<string>();
  const countedObservationKeys = new Set<string>();
  const countedObservations: Observation[] = [];
  const childIds = new Set<string>();
  let latencyCount = 0;
  let latencyTotalMs = 0;
  let maxLatencyMs: number | null = null;
  let langGraphDetected = false;
  let latestMs: number | null = null;
  let estimatedCostTotal = 0;
  let hasEstimatedCost = false;
  let estimatedCostRangeLow = 0;
  let estimatedCostRangeHigh = 0;
  let hasEstimatedCostRange = false;
  const totalCostBases = new Set<CostBasis>();
  let filteredRows = 0;
  let eligibleCorrelationObservations = 0;
  let withOperationId = 0;
  let withGoalId = 0;
  let withRunId = 0;
  let withStageId = 0;
  let invalidIdentifierObservations = 0;
  let fullyCorrelatedObservations = 0;
  let graftSignalObservations = 0;

  for (const obs of pageResult.observations) {
    if (isSyntheticObservation(obs)) {
      filteredRows += 1;
      continue;
    }

    const type = obs.type?.toUpperCase() ?? "";
    const usage = extractUsage(obs.usageDetails);
    const startMs = parseDateMs(obs.startTime);
    const endMs = parseDateMs(obs.endTime) ?? startMs;
    const rowLatestMs = endMs ?? startMs;
    const model = safeText(obs.providedModelName ?? obs.model);
    const provider = safeText(obs.metadata.provider);
    const platform = safeText(obs.metadata.platform);
    const costFields = computeObservationCost({
      reportedCost: obs.totalCost,
      usage,
      model,
      provider,
      metadata: obs.metadata,
    });
    const cost = costFields.effectiveCost;
    const tool = classifyToolObservation(obs, type);
    const hasGraftSignal = isGraftSignal(obs, tool?.name ?? null);
    const isError = isErrorObservation(obs);
    const latencyMs = latencyToMs(obs.latency);
    const correlation = extractCorrelationIds(obs.metadata);
    const observationKey = observationDeduplicationKey(obs, type, correlation.operationId);

    if (countedObservationKeys.has(observationKey)) {
      continue;
    }
    countedObservationKeys.add(observationKey);
    countedObservations.push(obs);

    eligibleCorrelationObservations += 1;
    if (correlation.operationId) withOperationId += 1;
    if (correlation.goalId) withGoalId += 1;
    if (correlation.runId) withRunId += 1;
    if (correlation.stageId) withStageId += 1;
    if (correlation.invalid) invalidIdentifierObservations += 1;
    if (
      correlation.operationId &&
      correlation.goalId &&
      correlation.runId &&
      correlation.stageId &&
      !correlation.invalid
    ) {
      fullyCorrelatedObservations += 1;
    }

    if (type) observationTypes.set(type, (observationTypes.get(type) ?? 0) + 1);
    if (obs.id) observationIds.add(obs.id);
    if (obs.parentObservationId) childIds.add(obs.id ?? `${obs.traceId}:${obs.parentObservationId}`);
    if (latencyMs != null) {
      latencyCount += 1;
      latencyTotalMs += latencyMs;
      maxLatencyMs = Math.max(maxLatencyMs ?? latencyMs, latencyMs);
    }
    if (hasLangGraphMetadata(obs.metadata)) langGraphDetected = true;

    totals.inputTokens += usage.inputTokens;
    totals.outputTokens += usage.outputTokens;
    totals.totalTokens += usage.totalTokens;
    totals.cacheReadTokens += usage.cacheReadTokens;
    totals.cacheWriteTokens += usage.cacheWriteTokens;
    totals.reportedCost += costFields.reportedCost;
    totals.effectiveCost += costFields.effectiveCost;
    totals.totalCost += cost;
    totalCostBases.add(costFields.costBasis);
    if (costFields.estimatedCost != null) {
      estimatedCostTotal += costFields.estimatedCost;
      hasEstimatedCost = true;
    }
    if (costFields.estimatedCostRange) {
      estimatedCostRangeLow += costFields.estimatedCostRange.low;
      estimatedCostRangeHigh += costFields.estimatedCostRange.high;
      hasEstimatedCostRange = true;
    }
    if (type === "GENERATION") totals.generationCalls += 1;
    if (tool) totals.toolCalls += tool.count;
    if (hasGraftSignal) graftSignalObservations += 1;
    if (isError) totals.errors += 1;
    if (obs.traceId) traces.add(obs.traceId);
    if (obs.sessionId) sessions.add(obs.sessionId);
    if (rowLatestMs != null) latestMs = Math.max(latestMs ?? rowLatestMs, rowLatestMs);

    if (model) {
      const current =
        models.get(model) ??
        {
          model,
          provider: provider ?? null,
          calls: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          reportedCost: 0,
          estimatedCost: null,
          effectiveCost: 0,
          costBasis: costFields.costBasis,
          cost: 0,
        };
      current.calls += 1;
      current.inputTokens += usage.inputTokens;
      current.outputTokens += usage.outputTokens;
      current.totalTokens += usage.totalTokens;
      current.cacheReadTokens += usage.cacheReadTokens;
      current.cacheWriteTokens += usage.cacheWriteTokens;
      mergeCostFields(current, costFields);
      current.cost += cost;
      if (!current.provider && provider) current.provider = provider;
      models.set(model, current);
    }

    if (provider || model) {
      const providerKey = provider ?? "unknown";
      const current =
        providers.get(providerKey) ??
        {
          provider: providerKey,
          modelClass: inferModelClass(providerKey, model),
          calls: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          reportedCost: 0,
          estimatedCost: null,
          effectiveCost: 0,
          costBasis: costFields.costBasis,
          cost: 0,
        };
      current.calls += type === "GENERATION" || model ? 1 : 0;
      current.inputTokens += usage.inputTokens;
      current.outputTokens += usage.outputTokens;
      current.totalTokens += usage.totalTokens;
      current.cacheReadTokens += usage.cacheReadTokens;
      current.cacheWriteTokens += usage.cacheWriteTokens;
      mergeCostFields(current, costFields);
      current.cost += cost;
      if (current.modelClass === "unknown") current.modelClass = inferModelClass(providerKey, model);
      providers.set(providerKey, current);
    }

    const session = getSessionWork(sessionMap, obs);
    if (startMs != null) session.startMs = Math.min(session.startMs ?? startMs, startMs);
    if (endMs != null) session.endMs = Math.max(session.endMs ?? endMs, endMs);
    if (rowLatestMs != null) session.latestMs = Math.max(session.latestMs ?? rowLatestMs, rowLatestMs);
    if (model) session.models.add(model);
    if (provider) session.providers.add(provider);
    if (platform) session.platforms.add(platform);
    session.inputTokens += usage.inputTokens;
    session.outputTokens += usage.outputTokens;
    session.totalTokens += usage.totalTokens;
    session.cacheReadTokens += usage.cacheReadTokens;
    session.cacheWriteTokens += usage.cacheWriteTokens;
    if (obs.parentObservationId) session.parentObservationIds.add(obs.parentObservationId);
    if (usage.hasTokenEvidence) session.tokenEvidenceCount += 1;
    else if (type === "GENERATION" || tool) session.missingTokenEvidenceCount += 1;
    mergeSessionCostFields(session, costFields);
    if (costFields.costState === "known") {
      session.costEvidenceCount += 1;
    } else if (type === "GENERATION" || obs.totalCost != null || model) {
      session.missingCostEvidenceCount += 1;
    }
    session.cost += cost;
    if (tool) session.toolCallCount += tool.count;
    if (isError) session.errorCount += 1;

    if (tool) {
      const current = tools.get(tool.name) ?? {
        name: tool.name,
        count: 0,
        latestTimestamp: null,
      };
      current.count += tool.count;
      current.latestTimestamp = maxIso(current.latestTimestamp, rowLatestMs);
      tools.set(tool.name, current);
    }

    if (correlation.operationId) {
      const operation = getOperationWork(operationMap, correlation.operationId);
      if (hasGraftSignal) operation.hasGraftSignal = true;
      addOptional(operation.goalIds, correlation.goalId);
      addOptional(operation.runIds, correlation.runId);
      addOptional(operation.stageIds, correlation.stageId);
      addOptional(operation.traceIds, obs.traceId);
      addOptional(operation.sessionIds, obs.sessionId);
      addOptional(operation.models, model);
      addOptional(operation.providers, provider);
      addOptional(operation.platforms, platform);

      operation.countedObservationKeys.add(observationKey);
      operation.observations += 1;
      if (type === "GENERATION" || model) operation.calls += 1;
      if (type === "GENERATION") operation.generationCalls += 1;
      operation.inputTokens += usage.inputTokens;
      operation.outputTokens += usage.outputTokens;
      operation.totalTokens += usage.totalTokens;
      operation.cacheReadTokens += usage.cacheReadTokens;
      operation.cacheWriteTokens += usage.cacheWriteTokens;
      mergeOperationCostFields(operation, costFields);
      if (isError) operation.errors += 1;
      if (startMs != null) operation.startMs = Math.min(operation.startMs ?? startMs, startMs);
      if (endMs != null) operation.endMs = Math.max(operation.endMs ?? endMs, endMs);
      if (rowLatestMs != null) operation.latestMs = Math.max(operation.latestMs ?? rowLatestMs, rowLatestMs);

      if (tool) {
        const toolKey = safeCorrelationId(obs.metadata.tool_call_id) ?? observationKey;
        if (!operation.countedToolKeys.has(toolKey)) {
          operation.countedToolKeys.add(toolKey);
          operation.toolCalls += tool.count;
          operation.calls += tool.count;
        }
      }
    }
  }

  totals.uniqueTraces = traces.size;
  totals.uniqueSessions = sessions.size;
  totals.latestTimestamp = isoOrNull(latestMs);
  totals.estimatedCost = hasEstimatedCost ? estimatedCostTotal : null;
  totals.costBasis = summarizeCostBasis(totalCostBases);
  if (hasEstimatedCostRange) {
    totals.estimatedCostRange = {
      low: estimatedCostRangeLow,
      high: estimatedCostRangeHigh,
      basis: "Recognized model estimate range; Claude Opus 4.6 cache writes use 5m as estimate and 1h as upper bound when TTL is unknown.",
    };
  }
  roundTotals(totals);

  const sessionRows = Array.from(sessionMap.values())
    .map(finalizeSession)
    .sort((a, b) => (Date.parse(b.latestTimestamp ?? "") || 0) - (Date.parse(a.latestTimestamp ?? "") || 0))
    .slice(0, 80);
  const allOperationRows = Array.from(operationMap.values())
    .map(finalizeOperation)
    .sort(compareOperations);
  const operationRows = allOperationRows.slice(0, MAX_OPERATION_ROWS);
  const recentTools = Array.from(tools.values())
    .sort((a, b) => (Date.parse(b.latestTimestamp ?? "") || 0) - (Date.parse(a.latestTimestamp ?? "") || 0))
    .slice(0, 12);
  const repeatedTools = Array.from(tools.values())
    .filter((tool) => tool.count > 1)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 8);
  const topExpensiveTraces = [...sessionRows].sort((a, b) => b.effectiveCost - a.effectiveCost).slice(0, 8);
  const topLargeTraces = [...sessionRows].sort((a, b) => b.totalTokens - a.totalTokens).slice(0, 8);
  const workflow: WorkflowSummary = {
    langGraphDetected,
    message: langGraphDetected ? "LangGraph trace metadata detected" : "LangGraph traces not detected",
    observationTypes: Object.fromEntries([...observationTypes.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    parentEdges: countedObservations.filter((obs) => obs.parentObservationId).length,
    rootNodes: countedObservations.filter((obs) => obs.id && !childIds.has(obs.id)).length,
    modelGenerations: totals.generationCalls,
    toolCalls: totals.toolCalls,
    errorNodes: totals.errors,
    avgLatencyMs: latencyCount ? Math.round(latencyTotalMs / latencyCount) : null,
    maxLatencyMs,
  };
  const completeness: ObservabilityCompleteness = {
    sessionRows: sessionRows.length,
    missingSessionIdRows: sessionRows.filter((session) => !session.sessionId).length,
    missingTraceIdRows: sessionRows.filter((session) => !session.traceId).length,
    unknownTokenRows: sessionRows.filter((session) => session.tokenState === "unknown").length,
    unknownCostRows: sessionRows.filter((session) => session.costState === "unknown").length,
    partialCostRows: sessionRows.filter((session) => session.costState === "partial").length,
    parentEdges: workflow.parentEdges,
    logicalRootCount: workflow.rootNodes,
    includedObservations: pageResult.observations.length - filteredRows,
  };
  const amplification = buildAmplification(totals, sessionRows);
  const wasteFlags = buildWasteFlags(sessionRows, repeatedTools);
  const correlationCoverage = buildCorrelationCoverage({
    totalObservations: pageResult.observations.length,
    eligibleObservations: eligibleCorrelationObservations,
    withOperationId,
    withGoalId,
    withRunId,
    withStageId,
    invalidIdentifierObservations,
    fullyCorrelatedObservations,
    operations: allOperationRows,
  });
  const accounting = buildAccountingSummary(allOperationRows, operationRows.length, correlationCoverage);
  const graftCohort = buildGraftCohortLens(allOperationRows, graftSignalObservations);

  const warning = pageResult.truncated
    ? "Langfuse row safety cap reached; showing the newest bounded sample."
    : undefined;

  return {
    source: {
      status: warning ? "warning" : "ok",
      source: "langfuse",
      message: warning ? "Langfuse live with capped rows" : "Langfuse live",
      warning,
      lastSync: new Date().toISOString(),
      window,
      fromStartTime: range.fromStartTime,
      toStartTime: range.toStartTime,
      rows: pageResult.observations.length,
      filteredRows,
      includedRows: pageResult.observations.length - filteredRows,
      pages: pageResult.pages,
      truncated: pageResult.truncated,
    },
    totals,
    completeness,
    byModel: Array.from(models.values())
      .map(roundCostAggregate)
      .sort((a, b) => b.effectiveCost - a.effectiveCost || b.totalTokens - a.totalTokens)
      .slice(0, 12),
    byProvider: Array.from(providers.values())
      .map(roundCostAggregate)
      .sort((a, b) => b.effectiveCost - a.effectiveCost || b.totalTokens - a.totalTokens)
      .slice(0, 12),
    timeSeries: buildTimeSeries(countedObservations, range, window),
    correlationCoverage,
    operations: operationRows,
    accounting,
    graftCohort,
    workflow,
    amplification,
    sessions: sessionRows,
    tools: {
      recent: recentTools,
      repeated: repeatedTools,
    },
    topExpensiveTraces,
    topLargeTraces,
    wasteFlags,
    recommendations: buildRecommendations({
      totals,
      workflow,
      amplification,
      repeatedTools,
      topExpensiveTraces,
      topLargeTraces,
      wasteFlags,
      byModel: Array.from(models.values()).map(roundCostAggregate),
    }),
  };
}

function buildTimeSeries(
  observations: Observation[],
  range: { fromStartTime: string; toStartTime: string },
  window: ObservabilityWindow,
): TimeSeries {
  const bucketMs = window === "24h" ? 3_600_000 : 86_400_000;
  try {
    const bucketCount = window === "24h" ? 24 : 7;
    const fromMs = parseDateMs(range.fromStartTime);
    if (fromMs == null) return { window, bucketMs, buckets: [] };

    const buckets = Array.from({ length: bucketCount }, (_, index): TimeSeriesBucket => {
      const bucketStartMs = fromMs + index * bucketMs;
      const bucketStart = new Date(bucketStartMs);
      return {
        bucketStart: bucketStart.toISOString(),
        label: formatTimeSeriesLabel(bucketStart, window),
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        effectiveCost: 0,
        localTokens: 0,
        cloudTokens: 0,
        localCost: 0,
        cloudCost: 0,
        generationCalls: 0,
        toolCalls: 0,
      };
    });

    for (const obs of observations) {
      const startMs = parseDateMs(obs.startTime);
      if (startMs == null) continue;
      const index = Math.max(0, Math.min(bucketCount - 1, Math.floor((startMs - fromMs) / bucketMs)));
      const bucket = buckets[index];
      const type = obs.type?.toUpperCase() ?? "";
      const usage = extractUsage(obs.usageDetails);
      const model = safeText(obs.providedModelName ?? obs.model);
      const provider = safeText(obs.metadata.provider);
      const costFields = computeObservationCost({
        reportedCost: obs.totalCost,
        usage,
        model,
        provider,
        metadata: obs.metadata,
      });
      const providerKey = provider ?? "unknown";
      const modelClass = provider || model ? inferModelClass(providerKey, model) : "unknown";
      const tool = classifyToolObservation(obs, type);

      bucket.inputTokens += usage.inputTokens;
      bucket.outputTokens += usage.outputTokens;
      bucket.totalTokens += usage.totalTokens;
      bucket.cacheReadTokens += usage.cacheReadTokens;
      bucket.cacheWriteTokens += usage.cacheWriteTokens;
      bucket.effectiveCost += costFields.effectiveCost;
      if (modelClass === "local") {
        bucket.localTokens += usage.totalTokens;
        bucket.localCost += costFields.effectiveCost;
      } else if (modelClass === "cloud") {
        bucket.cloudTokens += usage.totalTokens;
        bucket.cloudCost += costFields.effectiveCost;
      }
      if (type === "GENERATION") bucket.generationCalls += 1;
      if (tool) bucket.toolCalls += tool.count;
    }

    for (const bucket of buckets) {
      bucket.totalTokens = Math.round(bucket.totalTokens);
      bucket.inputTokens = Math.round(bucket.inputTokens);
      bucket.outputTokens = Math.round(bucket.outputTokens);
      bucket.cacheReadTokens = Math.round(bucket.cacheReadTokens);
      bucket.cacheWriteTokens = Math.round(bucket.cacheWriteTokens);
      bucket.localTokens = Math.round(bucket.localTokens);
      bucket.cloudTokens = Math.round(bucket.cloudTokens);
      bucket.effectiveCost = roundMoney(bucket.effectiveCost);
      bucket.localCost = roundMoney(bucket.localCost);
      bucket.cloudCost = roundMoney(bucket.cloudCost);
    }

    return { window, bucketMs, buckets };
  } catch {
    return { window, bucketMs, buckets: [] };
  }
}

function formatTimeSeriesLabel(date: Date, window: ObservabilityWindow) {
  if (window === "24h") return `${date.toISOString().slice(11, 13)}:00`;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

function extractUsage(usageDetails: Record<string, unknown>) {
  const tokenKeys = [
    "input",
    "input_tokens",
    "inputTokens",
    "promptTokens",
    "output",
    "output_tokens",
    "outputTokens",
    "completionTokens",
    "total",
    "total_tokens",
    "totalTokens",
    "cache_read_input_tokens",
    "cacheReadInputTokens",
    "input_cache_read",
    "cache_read",
    "cache_creation_input_tokens",
    "cacheWriteInputTokens",
    "input_cache_write",
    "cache_write",
  ];
  const hasTokenEvidence = tokenKeys.some((key) => numberValue(usageDetails[key]) != null);
  const inputTokens =
    numberValue(usageDetails.input) ??
    numberValue(usageDetails.input_tokens) ??
    numberValue(usageDetails.inputTokens) ??
    numberValue(usageDetails.promptTokens) ??
    0;
  const outputTokens =
    numberValue(usageDetails.output) ??
    numberValue(usageDetails.output_tokens) ??
    numberValue(usageDetails.outputTokens) ??
    numberValue(usageDetails.completionTokens) ??
    0;
  const explicitTotal =
    numberValue(usageDetails.total) ??
    numberValue(usageDetails.total_tokens) ??
    numberValue(usageDetails.totalTokens);
  const cacheReadTokens =
    numberValue(usageDetails.cache_read_input_tokens) ??
    numberValue(usageDetails.cacheReadInputTokens) ??
    numberValue(usageDetails.input_cache_read) ??
    numberValue(usageDetails.cache_read) ??
    0;
  const cacheWriteTokens =
    numberValue(usageDetails.cache_creation_input_tokens) ??
    numberValue(usageDetails.cacheWriteInputTokens) ??
    numberValue(usageDetails.input_cache_write) ??
    numberValue(usageDetails.cache_write) ??
    0;

  return {
    inputTokens,
    outputTokens,
    totalTokens: explicitTotal ?? inputTokens + outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    hasTokenEvidence,
  };
}

function extractCorrelationIds(metadata: Record<string, unknown>): CorrelationIds {
  const operation = firstCorrelationId(metadata, [
    "operation_id",
    "operationId",
    "operation",
    "hermes_operation_id",
    "mission_operation_id",
    "mc_operation_id",
  ]);
  const goal = firstCorrelationId(metadata, [
    "goal_id",
    "goalId",
    "goal",
    "hermes_goal_id",
    "mission_goal_id",
    "mc_goal_id",
  ]);
  const run = firstCorrelationId(metadata, [
    "run_id",
    "runId",
    "run",
    "request_id",
    "requestId",
    "hermes_run_id",
    "mission_run_id",
    "mc_run_id",
  ]);
  const stage = firstCorrelationId(metadata, [
    "stage_id",
    "stageId",
    "stage",
    "phase",
    "node_stage",
    "langgraph_stage",
  ]);

  return {
    operationId: operation.value,
    goalId: goal.value,
    runId: run.value,
    stageId: stage.value,
    invalid: operation.invalid || goal.invalid || run.invalid || stage.invalid,
  };
}

function firstCorrelationId(metadata: Record<string, unknown>, keys: string[]) {
  let invalid = false;
  let firstValid: string | null = null;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(metadata, key)) continue;
    const value = safeCorrelationId(metadata[key]);
    if (value) {
      firstValid ??= value;
    } else {
      invalid = true;
    }
  }
  return { value: firstValid, invalid };
}

function safeCorrelationId(value: unknown) {
  const text = scalarText(value);
  if (!text) return null;
  if (text.length > MAX_CORRELATION_ID_LENGTH) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(text)) return null;
  return text;
}

function observationDeduplicationKey(obs: Observation, type: string, operationId: string | null) {
  if (obs.id) return `id:${obs.id}`;

  const toolCallId = safeCorrelationId(obs.metadata.tool_call_id);
  return [
    "fallback",
    operationId,
    type,
    obs.name,
    obs.traceId,
    obs.parentObservationId,
    toolCallId,
    obs.startTime,
    obs.endTime,
  ]
    .map(boundedObservationKeyPart)
    .join("|");
}

function boundedObservationKeyPart(value: string | null) {
  if (!value) return "";
  return value.length > MAX_OBSERVATION_DEDUPE_KEY_PART_LENGTH
    ? value.slice(0, MAX_OBSERVATION_DEDUPE_KEY_PART_LENGTH)
    : value;
}

function computeObservationCost({
  reportedCost,
  usage,
  model,
  provider,
  metadata,
}: {
  reportedCost: number | null;
  usage: ReturnType<typeof extractUsage>;
  model: string | null;
  provider: string | null;
  metadata: Record<string, unknown>;
}): CostFields {
  const cleanReportedCost = reportedCost == null ? 0 : roundMoney(Math.max(0, reportedCost));
  const modelClass = inferModelClass(provider, model);
  const hasReportedCost = reportedCost != null;

  if (modelClass === "local") {
    return {
      reportedCost: cleanReportedCost,
      estimatedCost: 0,
      effectiveCost: 0,
      costBasis: "local_zero",
      costState: "known",
    };
  }

  if (isClaudeOpus46(model, metadata) && usage.hasTokenEvidence) {
    const pricing = OFFICIAL_MODEL_PRICING.anthropicClaudeOpus46;
    const inputCost = mtokCost(usage.inputTokens, pricing.inputPerMTok);
    const outputCost = mtokCost(usage.outputTokens, pricing.outputPerMTok);
    const cacheReadCost = mtokCost(usage.cacheReadTokens, pricing.cacheReadPerMTok);
    const cacheWriteLowCost = mtokCost(usage.cacheWriteTokens, pricing.cacheWrite5mPerMTok);
    const cacheWriteHighCost = mtokCost(usage.cacheWriteTokens, pricing.cacheWrite1hPerMTok);
    const estimatedCost = roundMoney(inputCost + outputCost + cacheReadCost + cacheWriteLowCost);
    const high = roundMoney(inputCost + outputCost + cacheReadCost + cacheWriteHighCost);

    return {
      reportedCost: cleanReportedCost,
      estimatedCost,
      effectiveCost: estimatedCost,
      costBasis: "anthropic_claude_opus_4_6_estimate_cache_write_5m_assumed",
      costState: "known",
      estimatedCostRange: {
        low: estimatedCost,
        high,
        basis: "Claude Opus 4.6 official pricing checked 2026-08-05; cache-write TTL unknown, so 5m is the estimate and 1h is the upper bound.",
      },
    };
  }

  return {
    reportedCost: cleanReportedCost,
    estimatedCost: null,
    effectiveCost: cleanReportedCost,
    costBasis: modelClass === "cloud" ? "reported_only_unknown_cloud" : "reported_only_unknown",
    costState: hasReportedCost ? "known" : "unknown",
  };
}

function mtokCost(tokens: number, pricePerMTok: number) {
  return (Math.max(0, tokens) / 1_000_000) * pricePerMTok;
}

function isClaudeOpus46(model: string | null, metadata: Record<string, unknown>) {
  const text = `${model ?? ""} ${safeText(metadata.model) ?? ""} ${safeText(metadata.model_name) ?? ""}`.toLowerCase();
  // Match the ENTIRE current Opus family, not just 4.6. Opus 4.5, 4.6, 4.7,
  // 4.8 and Opus 5 all share identical pricing ($5 in / $6.25 5m-cache-write /
  // $10 1h-cache-write / $0.50 cache-read / $25 out — Anthropic pricing page,
  // verified 2026-08-07). Hard-coding 4.6 left opus-4-8 (this deployment's
  // model) falling through to reported_only_unknown_cloud with a ZERO estimate,
  // which is why the anthropic cost read impossibly low. Retired Opus 4/4.1
  // ($15/$75) is deliberately excluded — different price, no longer served.
  return /\bclaude[-_ ]opus[-_ ](?:4[-_. ]?[5-9]|5)\b/.test(text);
}

function mergeCostFields(target: ModelAggregate | ProviderAggregate, cost: CostFields) {
  target.reportedCost += cost.reportedCost;
  target.effectiveCost += cost.effectiveCost;
  target.costBasis = mergeCostBasis(target.costBasis, cost.costBasis);
  if (cost.estimatedCost != null) {
    target.estimatedCost = (target.estimatedCost ?? 0) + cost.estimatedCost;
  }
  if (cost.estimatedCostRange) {
    target.estimatedCostRange = {
      low: (target.estimatedCostRange?.low ?? 0) + cost.estimatedCostRange.low,
      high: (target.estimatedCostRange?.high ?? 0) + cost.estimatedCostRange.high,
      basis: "Recognized model estimate range; Claude Opus 4.6 cache writes use 5m as estimate and 1h as upper bound when TTL is unknown.",
    };
  }
}

function mergeSessionCostFields(target: SessionWork, cost: CostFields) {
  target.reportedCost += cost.reportedCost;
  target.effectiveCost += cost.effectiveCost;
  target.costBases.add(cost.costBasis);
  if (cost.estimatedCost != null) {
    target.estimatedCost += cost.estimatedCost;
    target.hasEstimatedCost = true;
  }
  if (cost.estimatedCostRange) {
    target.estimatedCostRangeLow += cost.estimatedCostRange.low;
    target.estimatedCostRangeHigh += cost.estimatedCostRange.high;
    target.hasEstimatedCostRange = true;
  }
}

function mergeOperationCostFields(target: OperationWork, cost: CostFields) {
  target.reportedCost += cost.reportedCost;
  target.effectiveCost += cost.effectiveCost;
  target.costBases.add(cost.costBasis);
  if (cost.estimatedCost != null) {
    target.estimatedCost += cost.estimatedCost;
    target.hasEstimatedCost = true;
  }
  if (cost.estimatedCostRange) {
    target.estimatedCostRangeLow += cost.estimatedCostRange.low;
    target.estimatedCostRangeHigh += cost.estimatedCostRange.high;
    target.hasEstimatedCostRange = true;
  }
}

function mergeCostBasis(current: CostBasis, next: CostBasis): CostBasis {
  return current === next ? current : "mixed";
}

function summarizeCostBasis(values: Set<CostBasis>): CostBasis {
  if (values.size === 0) return "reported_only_unknown";
  return values.size === 1 ? [...values][0] : "mixed";
}

function roundCostAggregate<T extends ModelAggregate | ProviderAggregate>(aggregate: T): T {
  return {
    ...aggregate,
    reportedCost: roundMoney(aggregate.reportedCost),
    estimatedCost: aggregate.estimatedCost == null ? null : roundMoney(aggregate.estimatedCost),
    effectiveCost: roundMoney(aggregate.effectiveCost),
    estimatedCostRange: aggregate.estimatedCostRange
      ? {
          ...aggregate.estimatedCostRange,
          low: roundMoney(aggregate.estimatedCostRange.low),
          high: roundMoney(aggregate.estimatedCostRange.high),
        }
      : undefined,
    cost: roundMoney(aggregate.cost),
  };
}

function getSessionWork(sessionMap: Map<string, SessionWork>, obs: Observation) {
  const id = obs.sessionId ?? obs.traceId ?? obs.id ?? "unknown";
  const key = obs.sessionId ? `session:${obs.sessionId}` : obs.traceId ? `trace:${obs.traceId}` : `obs:${id}`;
  const current = sessionMap.get(key);
  if (current) return current;

  const created: SessionWork = {
    id,
    sessionId: obs.sessionId,
    traceId: obs.traceId,
    startMs: null,
    endMs: null,
    models: new Set(),
    providers: new Set(),
    platforms: new Set(),
    parentObservationIds: new Set(),
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reportedCost: 0,
    estimatedCost: 0,
    hasEstimatedCost: false,
    effectiveCost: 0,
    costBases: new Set(),
    tokenEvidenceCount: 0,
    missingTokenEvidenceCount: 0,
    costEvidenceCount: 0,
    missingCostEvidenceCount: 0,
    estimatedCostRangeLow: 0,
    estimatedCostRangeHigh: 0,
    hasEstimatedCostRange: false,
    cost: 0,
    toolCallCount: 0,
    errorCount: 0,
    latestMs: null,
  };
  sessionMap.set(key, created);
  return created;
}

function finalizeSession(work: SessionWork): SessionTraceAggregate {
  const durationMs =
    work.startMs != null && work.endMs != null && work.endMs >= work.startMs
      ? work.endMs - work.startMs
      : null;

  return {
    id: work.id,
    sessionId: work.sessionId,
    traceId: work.traceId,
    parentObservationIds: Array.from(work.parentObservationIds).sort(),
    startTime: isoOrNull(work.startMs),
    endTime: isoOrNull(work.endMs),
    durationMs,
    models: Array.from(work.models).sort(),
    provider: firstSorted(work.providers),
    platform: firstSorted(work.platforms),
    inputTokens: work.inputTokens,
    outputTokens: work.outputTokens,
    totalTokens: work.totalTokens,
    cacheReadTokens: work.cacheReadTokens,
    cacheWriteTokens: work.cacheWriteTokens,
    reportedCost: roundMoney(work.reportedCost),
    estimatedCost: work.hasEstimatedCost ? roundMoney(work.estimatedCost) : null,
    effectiveCost: roundMoney(work.effectiveCost),
    costBasis: summarizeCostBasis(work.costBases),
    tokenState: summarizeValueState(work.tokenEvidenceCount, work.missingTokenEvidenceCount),
    costState: summarizeValueState(work.costEvidenceCount, work.missingCostEvidenceCount),
    ...(work.hasEstimatedCostRange
      ? {
          estimatedCostRange: {
            low: roundMoney(work.estimatedCostRangeLow),
            high: roundMoney(work.estimatedCostRangeHigh),
            basis: "Recognized model estimate range; Claude Opus 4.6 cache writes use 5m as estimate and 1h as upper bound when TTL is unknown.",
          },
        }
      : {}),
    cost: roundMoney(work.cost),
    toolCallCount: work.toolCallCount,
    errorCount: work.errorCount,
    status: work.errorCount > 0 ? "error" : "ok",
    latestTimestamp: isoOrNull(work.latestMs),
  };
}

function getOperationWork(operationMap: Map<string, OperationWork>, operationId: string) {
  const current = operationMap.get(operationId);
  if (current) return current;

  const created: OperationWork = {
    operationId,
    goalIds: new Set(),
    runIds: new Set(),
    stageIds: new Set(),
    traceIds: new Set(),
    sessionIds: new Set(),
    models: new Set(),
    providers: new Set(),
    platforms: new Set(),
    countedObservationKeys: new Set(),
    countedToolKeys: new Set(),
    calls: 0,
    generationCalls: 0,
    observations: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reportedCost: 0,
    estimatedCost: 0,
    hasEstimatedCost: false,
    effectiveCost: 0,
    costBases: new Set(),
    estimatedCostRangeLow: 0,
    estimatedCostRangeHigh: 0,
    hasEstimatedCostRange: false,
    toolCalls: 0,
    errors: 0,
    hasGraftSignal: false,
    startMs: null,
    endMs: null,
    latestMs: null,
  };
  operationMap.set(operationId, created);
  return created;
}

function finalizeOperation(work: OperationWork): OperationAggregate {
  const durationMs =
    work.startMs != null && work.endMs != null && work.endMs >= work.startMs
      ? work.endMs - work.startMs
      : null;

  return {
    operationId: work.operationId,
    goalId: firstSorted(work.goalIds),
    runId: firstSorted(work.runIds),
    stageId: firstSorted(work.stageIds),
    traceIds: boundedSorted(work.traceIds),
    sessionIds: boundedSorted(work.sessionIds),
    models: boundedSorted(work.models),
    providers: boundedSorted(work.providers),
    platforms: boundedSorted(work.platforms),
    calls: work.calls,
    generationCalls: work.generationCalls,
    observations: work.observations,
    inputTokens: work.inputTokens,
    outputTokens: work.outputTokens,
    totalTokens: work.totalTokens,
    cacheReadTokens: work.cacheReadTokens,
    cacheWriteTokens: work.cacheWriteTokens,
    reportedCost: roundMoney(work.reportedCost),
    estimatedCost: work.hasEstimatedCost ? roundMoney(work.estimatedCost) : null,
    effectiveCost: roundMoney(work.effectiveCost),
    costBasis: summarizeCostBasis(work.costBases),
    ...(work.hasEstimatedCostRange
      ? {
          estimatedCostRange: {
            low: roundMoney(work.estimatedCostRangeLow),
            high: roundMoney(work.estimatedCostRangeHigh),
            basis: "Recognized model estimate range; Claude Opus 4.6 cache writes use 5m as estimate and 1h as upper bound when TTL is unknown.",
          },
        }
      : {}),
    toolCalls: work.toolCalls,
    errors: work.errors,
    startTime: isoOrNull(work.startMs),
    endTime: isoOrNull(work.endMs),
    durationMs,
    latestTimestamp: isoOrNull(work.latestMs),
    status: work.errors > 0 ? "error" : "ok",
    cohort: work.hasGraftSignal ? "graft" : "baseline",
  };
}

function compareOperations(a: OperationAggregate, b: OperationAggregate) {
  const latestDelta = (Date.parse(b.latestTimestamp ?? "") || 0) - (Date.parse(a.latestTimestamp ?? "") || 0);
  if (latestDelta !== 0) return latestDelta;
  const costDelta = b.effectiveCost - a.effectiveCost;
  if (costDelta !== 0) return costDelta;
  const tokenDelta = b.totalTokens - a.totalTokens;
  if (tokenDelta !== 0) return tokenDelta;
  return a.operationId.localeCompare(b.operationId);
}

function buildCorrelationCoverage({
  totalObservations,
  eligibleObservations,
  withOperationId,
  withGoalId,
  withRunId,
  withStageId,
  invalidIdentifierObservations,
  fullyCorrelatedObservations,
  operations,
}: {
  totalObservations: number;
  eligibleObservations: number;
  withOperationId: number;
  withGoalId: number;
  withRunId: number;
  withStageId: number;
  invalidIdentifierObservations: number;
  fullyCorrelatedObservations: number;
  operations: OperationAggregate[];
}): CorrelationCoverage {
  const fullyCorrelatedOperations = operations.filter(
    (operation) => operation.goalId && operation.runId && operation.stageId,
  ).length;
  const percentage = eligibleObservations > 0 ? roundRatio(fullyCorrelatedObservations / eligibleObservations) : null;
  let status: CorrelationStatus = "missing";

  if (eligibleObservations === 0 || withOperationId === 0) {
    status = invalidIdentifierObservations > 0 ? "invalid" : "missing";
  } else if (
    invalidIdentifierObservations === 0 &&
    fullyCorrelatedObservations === eligibleObservations
  ) {
    status = "observed";
  } else {
    status = "partial";
  }

  return {
    status,
    totalObservations,
    eligibleObservations,
    withOperationId,
    withGoalId,
    withRunId,
    withStageId,
    invalidIdentifierObservations,
    fullyCorrelatedObservations,
    operationCount: operations.length,
    fullyCorrelatedOperations,
    percentage,
  };
}

function buildAccountingSummary(
  operations: OperationAggregate[],
  returnedOperations: number,
  coverage: CorrelationCoverage,
): AccountingSummary {
  const costBases = new Set<CostBasis>();
  let reportedCost = 0;
  let estimatedCost = 0;
  let hasEstimatedCost = false;
  let effectiveCost = 0;

  for (const operation of operations) {
    reportedCost += operation.reportedCost;
    effectiveCost += operation.effectiveCost;
    costBases.add(operation.costBasis);
    if (operation.estimatedCost != null) {
      estimatedCost += operation.estimatedCost;
      hasEstimatedCost = true;
    }
  }

  const warnings: string[] = [];
  if (coverage.status === "missing") {
    warnings.push("No allowlisted operation metadata was observed; operation rows are not fabricated.");
  }
  if (coverage.status === "invalid") {
    warnings.push("Allowlisted correlation fields were present but invalid; non-scalar or oversized identifiers were ignored.");
  }
  if (coverage.status === "partial") {
    warnings.push("Only part of the Langfuse window carries allowlisted operation, goal, run, and stage identifiers.");
  }
  if (coverage.status !== "invalid" && coverage.invalidIdentifierObservations > 0) {
    warnings.push("Allowlisted correlation fields were present but invalid; non-scalar or oversized identifiers were ignored.");
  }
  if (operations.length > MAX_OPERATION_ROWS) {
    warnings.push(`Operation rows capped at ${MAX_OPERATION_ROWS}; counts still use the full bounded fetch window.`);
  }

  return {
    operationCount: operations.length,
    rowCap: MAX_OPERATION_ROWS,
    returnedOperations,
    truncatedOperations: operations.length > MAX_OPERATION_ROWS,
    reportedCost: roundMoney(reportedCost),
    estimatedCost: hasEstimatedCost ? roundMoney(estimatedCost) : null,
    effectiveCost: roundMoney(effectiveCost),
    costBasis: summarizeCostBasis(costBases),
    reconciliation: coverage.status,
    warnings,
  };
}

function emptyCorrelationCoverage(): CorrelationCoverage {
  return {
    status: "missing",
    totalObservations: 0,
    eligibleObservations: 0,
    withOperationId: 0,
    withGoalId: 0,
    withRunId: 0,
    withStageId: 0,
    invalidIdentifierObservations: 0,
    fullyCorrelatedObservations: 0,
    operationCount: 0,
    fullyCorrelatedOperations: 0,
    percentage: null,
  };
}

function emptyAccountingSummary(): AccountingSummary {
  return {
    operationCount: 0,
    rowCap: MAX_OPERATION_ROWS,
    returnedOperations: 0,
    truncatedOperations: false,
    reportedCost: 0,
    estimatedCost: null,
    effectiveCost: 0,
    costBasis: "reported_only_unknown",
    reconciliation: "missing",
    warnings: ["Langfuse observations were unavailable; no operation accounting was inferred."],
  };
}

function summarizeCohort(rows: OperationAggregate[]): CohortSummary {
  let totalTokens = 0;
  let toolCalls = 0;
  let generationCalls = 0;
  let effectiveCost = 0;

  for (const row of rows) {
    totalTokens += row.totalTokens;
    toolCalls += row.toolCalls;
    generationCalls += row.generationCalls;
    effectiveCost += row.effectiveCost;
  }

  const operationCount = rows.length;
  return {
    operationCount,
    totalTokens: Math.round(totalTokens),
    toolCalls: Math.round(toolCalls),
    generationCalls: Math.round(generationCalls),
    effectiveCost: roundMoney(effectiveCost),
    avgTokensPerOperation: operationCount > 0 ? roundMoney(totalTokens / operationCount) : null,
    avgToolCallsPerOperation: operationCount > 0 ? roundMoney(toolCalls / operationCount) : null,
  };
}

function emptyCohortSummary(): CohortSummary {
  return {
    operationCount: 0,
    totalTokens: 0,
    toolCalls: 0,
    generationCalls: 0,
    effectiveCost: 0,
    avgTokensPerOperation: null,
    avgToolCallsPerOperation: null,
  };
}

function buildGraftCohortLens(allOperationRows: OperationAggregate[], signalObservations: number): GraftCohortLens {
  const graftRows = allOperationRows.filter((row) => row.cohort === "graft");
  const baselineRows = allOperationRows.filter((row) => row.cohort === "baseline");
  const graft = summarizeCohort(graftRows);
  const baseline = summarizeCohort(baselineRows);

  return {
    status: graft.operationCount > 0 ? "observed" : "missing",
    signalObservations,
    signalOperations: graft.operationCount,
    graft,
    baseline,
    delta: {
      totalTokens: graft.totalTokens - baseline.totalTokens,
      toolCalls: graft.toolCalls - baseline.toolCalls,
      generationCalls: graft.generationCalls - baseline.generationCalls,
      effectiveCost: roundMoney(graft.effectiveCost - baseline.effectiveCost),
      avgTokensPerOperation:
        graft.avgTokensPerOperation == null || baseline.avgTokensPerOperation == null
          ? null
          : roundMoney(graft.avgTokensPerOperation - baseline.avgTokensPerOperation),
      avgToolCallsPerOperation:
        graft.avgToolCallsPerOperation == null || baseline.avgToolCallsPerOperation == null
          ? null
          : roundMoney(graft.avgToolCallsPerOperation - baseline.avgToolCallsPerOperation),
    },
  };
}

function emptyGraftCohortLens(): GraftCohortLens {
  return {
    status: "missing",
    signalObservations: 0,
    signalOperations: 0,
    graft: emptyCohortSummary(),
    baseline: emptyCohortSummary(),
    delta: {
      totalTokens: 0,
      toolCalls: 0,
      generationCalls: 0,
      effectiveCost: 0,
      avgTokensPerOperation: null,
      avgToolCallsPerOperation: null,
    },
  };
}

function buildWasteFlags(
  sessions: SessionTraceAggregate[],
  repeatedTools: ToolAggregate[],
): WasteFlag[] {
  const flags: WasteFlag[] = [];
  const largest = [...sessions].sort((a, b) => b.totalTokens - a.totalTokens)[0];
  if (largest && largest.totalTokens > 0) {
    flags.push({
      kind: "largest_token_session",
      severity: largest.totalTokens >= 100_000 ? "down" : "warn",
      label: "Largest token session",
      detail: `${formatCount(largest.totalTokens)} tokens`,
      sessionId: largest.sessionId,
      traceId: largest.traceId,
      value: largest.totalTokens,
    });
  }

  const repeated = repeatedTools[0];
  if (repeated) {
    flags.push({
      kind: "repeated_tool",
      severity: repeated.count >= 5 ? "down" : "warn",
      label: "Repeated tool calls",
      detail: `${repeated.name} ran ${repeated.count} times`,
      value: repeated.count,
    });
  }

  const highRatio = [...sessions]
    .map((session) => ({
      session,
      ratio: session.outputTokens > 0 ? session.inputTokens / session.outputTokens : Infinity,
    }))
    .filter(({ session, ratio }) => session.inputTokens >= 1000 && ratio >= 4)
    .sort((a, b) => b.ratio - a.ratio)[0];

  if (highRatio) {
    flags.push({
      kind: "high_input_output_ratio",
      severity: highRatio.ratio >= 10 ? "down" : "warn",
      label: "High input/output ratio",
      detail:
        highRatio.ratio === Infinity
          ? `${formatCount(highRatio.session.inputTokens)} input tokens with no output`
          : `${highRatio.ratio.toFixed(1)}x more input than output`,
      sessionId: highRatio.session.sessionId,
      traceId: highRatio.session.traceId,
      value: highRatio.ratio,
    });
  }

  return flags.slice(0, 4);
}

function buildAmplification(
  totals: ObservabilityTotals,
  sessions: SessionTraceAggregate[],
): AmplificationMetrics {
  const inputOutputRatio =
    totals.outputTokens > 0 ? roundRatio(totals.inputTokens / totals.outputTokens) : totals.inputTokens > 0 ? null : 0;
  const medianSessionTokens = median(sessions.map((session) => session.totalTokens).filter((value) => value > 0));
  const contextAmplification =
    medianSessionTokens && medianSessionTokens > 0
      ? roundRatio((totals.totalTokens / Math.max(1, sessions.length)) / medianSessionTokens)
      : null;
  const cacheReadRatio = totals.inputTokens > 0 ? roundRatio(totals.cacheReadTokens / totals.inputTokens) : null;
  const cacheWriteRatio = totals.inputTokens > 0 ? roundRatio(totals.cacheWriteTokens / totals.inputTokens) : null;
  const deterministicFlags: string[] = [];

  if (inputOutputRatio != null && inputOutputRatio >= 4) {
    deterministicFlags.push("input_output_ratio_high");
  }
  if ((cacheReadRatio ?? 0) < 0.05 && totals.inputTokens >= 50_000) {
    deterministicFlags.push("low_cache_read_on_high_input");
  }
  if (sessions.some((session) => session.toolCallCount >= 8)) {
    deterministicFlags.push("tool_loop_pressure");
  }
  if (sessions.some((session) => session.totalTokens >= 100_000)) {
    deterministicFlags.push("large_context_trace");
  }

  return {
    inputOutputRatio,
    contextAmplification,
    cacheReadRatio,
    cacheWriteRatio,
    deterministicFlags,
  };
}

function buildRecommendations({
  totals,
  workflow,
  amplification,
  repeatedTools,
  topExpensiveTraces,
  topLargeTraces,
  wasteFlags,
  byModel,
}: {
  totals: ObservabilityTotals;
  workflow: WorkflowSummary;
  amplification: AmplificationMetrics;
  repeatedTools: ToolAggregate[];
  topExpensiveTraces: SessionTraceAggregate[];
  topLargeTraces: SessionTraceAggregate[];
  wasteFlags: WasteFlag[];
  byModel: ModelAggregate[];
}) {
  const recommendations: string[] = [];
  const repeated = repeatedTools[0];
  const expensive = topExpensiveTraces[0];
  const large = topLargeTraces[0];
  const expensiveModel = [...byModel].sort((a, b) => b.effectiveCost - a.effectiveCost)[0];
  const topCacheWrite = [...byModel].sort((a, b) => b.cacheWriteTokens - a.cacheWriteTokens)[0];
  const topCacheRead = [...byModel].sort((a, b) => b.cacheReadTokens - a.cacheReadTokens)[0];

  if (!workflow.langGraphDetected) {
    recommendations.push("Do not label these as LangGraph runs until trace metadata includes LangGraph graph/node fields.");
  }
  if (expensiveModel && expensiveModel.effectiveCost > 0) {
    recommendations.push(`Cost pressure is led by ${expensiveModel.model}: ${formatMoney(expensiveModel.effectiveCost)} effective on ${expensiveModel.costBasis}.`);
  }
  if (topCacheWrite && topCacheWrite.cacheWriteTokens > 0) {
    recommendations.push(`Cache-write pressure is led by ${topCacheWrite.model}: ${formatCount(topCacheWrite.cacheWriteTokens)} write tokens.`);
  }
  if (topCacheRead && topCacheRead.cacheReadTokens > 0) {
    recommendations.push(`Cache-read volume is led by ${topCacheRead.model}: ${formatCount(topCacheRead.cacheReadTokens)} read tokens.`);
  }
  if (repeated && repeated.count >= 2) {
    recommendations.push(`Inspect ${repeated.name}: ${repeated.count} calls in the window suggests a dedupe/cache boundary is missing.`);
  }
  if ((amplification.inputOutputRatio ?? 0) >= 4) {
    recommendations.push(`Tighten retrieved context or summaries: input/output ratio is ${amplification.inputOutputRatio}x.`);
  }
  if ((amplification.cacheReadRatio ?? 0) < 0.05 && totals.inputTokens >= 50_000) {
    recommendations.push("Enable or verify prompt/cache reuse for stable system, repository, and policy context.");
  }
  if (large && large.totalTokens >= 100_000) {
    recommendations.push(`Review large trace ${large.sessionId ?? large.traceId}: ${formatCount(large.totalTokens)} tokens may need compression earlier.`);
  }
  if (expensive && expensive.effectiveCost > 0) {
    recommendations.push(`Review top cost trace ${expensive.sessionId ?? expensive.traceId}: ${formatMoney(expensive.effectiveCost)} effective from ${expensive.models[0] ?? "unknown model"}.`);
  }
  if (workflow.errorNodes > 0) {
    recommendations.push(`Triage ${workflow.errorNodes} Langfuse error node${workflow.errorNodes === 1 ? "" : "s"} before adding new runtime work.`);
  }
  if (recommendations.length === 0 && wasteFlags.length === 0) {
    recommendations.push("No deterministic optimization flag fired in this window; keep metadata-only capture and revisit after more runs.");
  }

  return recommendations.slice(0, 6);
}

function failurePayload(
  window: ObservabilityWindow,
  range: { fromStartTime: string; toStartTime: string },
  warning: string,
): HermesObservability {
  return {
    source: {
      status: "error",
      source: "langfuse",
      message: "Langfuse unavailable",
      warning,
      lastSync: null,
      window,
      fromStartTime: range.fromStartTime,
      toStartTime: range.toStartTime,
      rows: 0,
      filteredRows: 0,
      includedRows: 0,
      pages: 0,
      truncated: false,
    },
    totals: null,
    completeness: null,
    byModel: [],
    byProvider: [],
    timeSeries: { window, bucketMs: window === "24h" ? 3_600_000 : 86_400_000, buckets: [] },
    correlationCoverage: emptyCorrelationCoverage(),
    operations: [],
    accounting: emptyAccountingSummary(),
    graftCohort: emptyGraftCohortLens(),
    workflow: null,
    amplification: null,
    sessions: [],
    tools: {
      recent: [],
      repeated: [],
    },
    topExpensiveTraces: [],
    topLargeTraces: [],
    wasteFlags: [],
    recommendations: [],
  };
}

function summarizeValueState(known: number, missing: number): ValueState {
  if (known > 0 && missing > 0) return "partial";
  if (known > 0) return "known";
  return "unknown";
}

function safeFailureMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Langfuse request failed.";
  if (error.message === "LANGFUSE_ENV_MISSING") return "Langfuse server credentials are not configured.";
  if (error.message === "LANGFUSE_ENV_INVALID") return "Langfuse base URL is invalid.";
  if (error.name === "AbortError") return "Langfuse request timed out.";
  if (error.message.startsWith("LANGFUSE_HTTP_")) {
    return `Langfuse returned HTTP ${error.message.replace("LANGFUSE_HTTP_", "")}.`;
  }
  return "Langfuse request failed.";
}

function roundTotals(totals: ObservabilityTotals) {
  totals.inputTokens = Math.round(totals.inputTokens);
  totals.outputTokens = Math.round(totals.outputTokens);
  totals.totalTokens = Math.round(totals.totalTokens);
  totals.cacheReadTokens = Math.round(totals.cacheReadTokens);
  totals.cacheWriteTokens = Math.round(totals.cacheWriteTokens);
  totals.reportedCost = roundMoney(totals.reportedCost);
  totals.estimatedCost = totals.estimatedCost == null ? null : roundMoney(totals.estimatedCost);
  totals.effectiveCost = roundMoney(totals.effectiveCost);
  if (totals.estimatedCostRange) {
    totals.estimatedCostRange.low = roundMoney(totals.estimatedCostRange.low);
    totals.estimatedCostRange.high = roundMoney(totals.estimatedCostRange.high);
  }
  totals.totalCost = roundMoney(totals.totalCost);
}

function roundMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 1_000_000) / 1_000_000;
}

function isErrorObservation(obs: Observation) {
  return obs.level?.toUpperCase() === "ERROR";
}

function isSyntheticObservation(obs: Observation) {
  const metadata = obs.metadata;
  const environment = safeText(metadata.environment ?? metadata.env)?.toLowerCase();
  if (environment === "test") return true;

  if (booleanValue(metadata.synthetic) || booleanValue(metadata.isSynthetic) || booleanValue(metadata.is_synthetic)) {
    return true;
  }

  const metadataModel = safeText(metadata.model ?? metadata.model_name)?.toLowerCase();
  const metadataProvider = safeText(metadata.provider)?.toLowerCase();
  return metadataModel === "synthetic" || metadataProvider === "synthetic";
}

function classifyToolObservation(obs: Observation, type: string): { name: string; count: number } | null {
  if (type === "GENERATION") return null;

  if (type === "TOOL") {
    return {
      name: safeToolName(obs.metadata.tool_name ?? obs.name),
      count: 1,
    };
  }

  if (type !== "SPAN" && type !== "EVENT") return null;

  const metadataToolName = safeText(obs.metadata.tool_name);
  const metadataToolCallId = safeText(obs.metadata.tool_call_id);
  const metadataToolCallCount = positiveInteger(obs.metadata.tool_call_count);
  const nameToolName = toolNameFromObservationName(obs.name);

  if (!metadataToolName && !metadataToolCallId && metadataToolCallCount == null && !nameToolName) {
    return null;
  }

  return {
    name: metadataToolName ?? nameToolName ?? safeToolName(obs.name),
    count: metadataToolCallCount ?? 1,
  };
}

function isGraftSignal(obs: Observation, toolName: string | null) {
  const markers = [
    toolName,
    safeText(obs.name),
    safeText(obs.metadata.tool_name),
    safeText(obs.metadata.command),
    safeText(obs.metadata.command_name),
    safeText(obs.metadata.toolset),
  ];
  return markers.some((value) => !!value && /\b(graft|graphify)\b/i.test(value));
}

function latencyToMs(value: number | null) {
  if (value == null || !Number.isFinite(value)) return null;
  return value < 1000 ? Math.round(value * 1000) : Math.round(value);
}

function hasLangGraphMetadata(metadata: Record<string, unknown>) {
  return Object.keys(metadata).some((key) => /langgraph|lang_graph|graph_node|graph_step/i.test(key));
}

function inferModelClass(provider: string | null, model: string | null): ProviderAggregate["modelClass"] {
  const text = `${provider ?? ""} ${model ?? ""}`.toLowerCase();
  if (!text.trim()) return "unknown";
  if (/(localhost|127\.0\.0\.1|ollama|lmstudio|custom|coder|reviewer|local|qwen|ornith)/.test(text)) return "local";
  if (/(openai|anthropic|gemini|google|bedrock|openrouter|claude|gpt)/.test(text)) return "cloud";
  return "unknown";
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function roundRatio(value: number) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function toolNameFromObservationName(value: unknown) {
  const text = safeText(value);
  if (!text) return null;

  const prefixed = text.match(/^tools?(?:_call)?[:./\s-]+(.+)$/i);
  if (prefixed?.[1]) return safeText(prefixed[1]);

  if (/\btool(?:_call)?\b/i.test(text)) return text;

  return null;
}

function safeToolName(value: unknown) {
  return safeText(value) ?? "unknown-tool";
}

function safeText(value: unknown) {
  const text = stringValue(value);
  if (!text) return null;
  return text.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 96);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function scalarText(value: unknown) {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveInteger(value: unknown): number | null {
  const parsed = numberValue(value);
  if (parsed == null || parsed < 1) return null;
  return Math.floor(parsed);
}

function booleanValue(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  return /^(true|1|yes)$/i.test(value.trim());
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function arrayValue(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function parseDateMs(value: string | null) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function isoOrNull(ms: number | null) {
  return ms == null ? null : new Date(ms).toISOString();
}

function maxIso(current: string | null, candidateMs: number | null) {
  const currentMs = parseDateMs(current);
  const maxMs = candidateMs == null ? currentMs : Math.max(currentMs ?? candidateMs, candidateMs);
  return isoOrNull(maxMs);
}

function addOptional(target: Set<string>, value: string | null) {
  if (value) target.add(value);
}

function firstSorted(values: Set<string>) {
  return Array.from(values).sort()[0] ?? null;
}

function boundedSorted(values: Set<string>) {
  return Array.from(values).sort().slice(0, MAX_OPERATION_NESTED_IDS);
}

function formatCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  return String(value);
}

function formatMoney(value: number) {
  return `$${roundMoney(value).toLocaleString("en-US", {
    minimumFractionDigits: value < 100 ? 2 : 0,
    maximumFractionDigits: value < 100 ? 2 : 0,
  })}`;
}
