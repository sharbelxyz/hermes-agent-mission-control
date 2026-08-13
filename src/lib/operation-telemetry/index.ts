import { createHash } from "node:crypto";

export const OPERATION_TELEMETRY_SCHEMA_VERSION = "mc.operation.v1" as const;

const MAX_ERRORS = 16;
const MAX_STRING_LENGTH = 128;
const MAX_NAME_LENGTH = 160;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CANONICAL_INPUT_KEYS = [
  "schema_version",
  "record_kind",
  "operation_id",
  "attempt_id",
  "span_id",
  "parent_span_id",
  "retry_of",
  "goal_id",
  "run_id",
  "stage",
  "operation_type",
  "operation_name",
  "status",
  "started_at",
  "ended_at",
  "duration_ms",
  "provider",
  "model",
] as const;
const CANONICAL_INPUT_KEY_SET = new Set<string>(CANONICAL_INPUT_KEYS);

const FORBIDDEN_FIELD_NAMES = new Set([
  "args",
  "arguments",
  "body",
  "command",
  "content",
  "customer",
  "customer_data",
  "email",
  "employee",
  "environment",
  "file_body",
  "input",
  "output",
  "pii",
  "prompt",
  "request",
  "response",
  "result",
  "secret",
  "stderr",
  "stdout",
  "token",
  "tool_args",
  "tool_arguments",
  "tool_input",
  "tool_output",
  "tool_result",
  "vault",
]);

const START_STATUSES = ["started"] as const;
const RECORD_KINDS = ["operation_start", "operation_terminal", "export_state"] as const;
const TERMINAL_STATUSES = ["succeeded", "failed", "blocked", "cancelled"] as const;
const EXPORT_STATUSES = [
  "local_only",
  "dual_written",
  "replayed",
  "duplicate",
  "partial_upload",
  "schema_mismatch",
] as const;
const OPERATION_TYPES = ["planner", "coder", "reviewer", "model", "tool", "export"] as const;
const COST_BASIS = ["none", "reported", "estimated"] as const;
const TOOL_FAILURE_CLASSES = [
  "none",
  "blocked",
  "cancelled",
  "provider_error",
  "schema_error",
  "network_outage",
  "tool_error",
] as const;
const USAGE_KEYS = ["input_tokens", "output_tokens", "total_tokens", "cache_read_tokens", "cache_write_tokens"] as const;
const TOOL_NUMERIC_KEYS = ["argument_bytes", "result_bytes"] as const;
const TIMESTAMP_DURATION_TOLERANCE_MS = 1;
const FUTURE_TIMESTAMP_TOLERANCE_MS = 60_000;

const COMMON_KEYS = [
  "schema_version",
  "record_kind",
  "operation_id",
  "attempt_id",
  "span_id",
  "parent_span_id",
  "retry_of",
  "idempotency_key",
  "goal_id",
  "run_id",
  "stage",
  "operation_type",
  "operation_name",
  "status",
  "started_at",
  "provider",
  "model",
  "usage",
  "cost",
  "privacy",
] as const;

const COMMON_REQUIRED_KEYS = [
  "schema_version",
  "record_kind",
  "operation_id",
  "attempt_id",
  "span_id",
  "idempotency_key",
  "goal_id",
  "run_id",
  "stage",
  "operation_type",
  "operation_name",
  "status",
  "started_at",
  "usage",
  "cost",
  "privacy",
] as const;

const TERMINAL_EXTRA_KEYS = ["ended_at", "duration_ms", "tool"] as const;
const EXPORT_EXTRA_KEYS = ["ended_at", "duration_ms", "export"] as const;

export type OperationRecordKind = "operation_start" | "operation_terminal" | "export_state";
export type OperationType = (typeof OPERATION_TYPES)[number];
export type OperationTerminalStatus = (typeof TERMINAL_STATUSES)[number];
export type OperationExportStatus = (typeof EXPORT_STATUSES)[number];

export type OperationUsage = {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
};

export type OperationCost = {
  basis: (typeof COST_BASIS)[number];
  amount_usd: number;
};

export type OperationPrivacy = {
  metadata_only: true;
  content_recorded: false;
  tool_io_recorded: false;
};

export type OperationToolMetadata = {
  tool_signature_hash: string;
  argument_bytes: number;
  result_bytes: number;
  failure_class: (typeof TOOL_FAILURE_CLASSES)[number];
};

type OperationExportMetadataBase = {
  state: OperationExportStatus;
  local_recorded: boolean;
  upstream_recorded: boolean;
  replay_count: number;
};

export type OperationExportMetadata =
  | (OperationExportMetadataBase & { state: "local_only"; upstream_recorded: false })
  | (OperationExportMetadataBase & { state: "dual_written"; upstream_recorded: true })
  | (OperationExportMetadataBase & { state: "replayed"; upstream_recorded: true; replay_count: number })
  | (OperationExportMetadataBase & {
      state: "duplicate";
      upstream_recorded: false;
      duplicate_of_idempotency_key: string;
    })
  | (OperationExportMetadataBase & { state: "partial_upload"; upstream_recorded: true })
  | (OperationExportMetadataBase & {
      state: "schema_mismatch";
      upstream_recorded: false;
      mismatch_schema_version: string;
    });

type ParsedExportMetadata = OperationExportMetadataBase & {
  duplicate_of_idempotency_key?: string;
  mismatch_schema_version?: string;
};

type OperationRecordBase = {
  schema_version: typeof OPERATION_TELEMETRY_SCHEMA_VERSION;
  record_kind: OperationRecordKind;
  operation_id: string;
  attempt_id: string;
  span_id: string;
  parent_span_id?: string;
  retry_of?: string;
  idempotency_key: string;
  goal_id: string;
  run_id: string;
  stage: string;
  operation_type: OperationType;
  operation_name: string;
  status: string;
  started_at: string;
  provider?: string;
  model?: string;
  usage: OperationUsage;
  cost: OperationCost;
  privacy: OperationPrivacy;
};

export type OperationStartRecord = OperationRecordBase & {
  record_kind: "operation_start";
  status: "started";
};

type OperationTerminalRecordBase = OperationRecordBase & {
  record_kind: "operation_terminal";
  status: OperationTerminalStatus;
  ended_at: string;
  duration_ms: number;
};

export type OperationTerminalRecord =
  | (OperationTerminalRecordBase & {
      operation_type: "tool";
      tool: OperationToolMetadata;
    })
  | (OperationTerminalRecordBase & {
      operation_type: Exclude<OperationType, "tool">;
      tool?: OperationToolMetadata;
    });

export type OperationTerminalToolRecord = OperationTerminalRecordBase & {
  operation_type: "tool";
  tool?: OperationToolMetadata;
};

export type OperationExportStateRecord = OperationRecordBase & {
  record_kind: "export_state";
  status: OperationExportStatus;
  ended_at: string;
  duration_ms: number;
  export: OperationExportMetadata;
};

export type OperationTelemetryRecord =
  | OperationStartRecord
  | OperationTerminalRecord
  | OperationExportStateRecord;

export type OperationValidationIssue = {
  code: string;
  path: string;
  message: string;
};

export type OperationValidationResult =
  | { ok: true; value: OperationTelemetryRecord }
  | { ok: false; errors: OperationValidationIssue[] };

type MutableRecord = Record<string, unknown>;
type IssueCollector = {
  issues: OperationValidationIssue[];
  add: (code: string, path: string, message: string) => void;
};

function makeCollector(): IssueCollector {
  const issues: OperationValidationIssue[] = [];
  return {
    issues,
    add(code: string, path: string, message: string) {
      if (issues.length >= MAX_ERRORS) {
        return;
      }
      issues.push({ code, path, message });
    },
  };
}

function isPlainRecord(value: unknown): value is MutableRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasForbiddenFieldName(key: string): boolean {
  const normalized = key.toLowerCase();
  return FORBIDDEN_FIELD_NAMES.has(normalized);
}

function validateUnknownKeys(
  record: MutableRecord,
  allowedKeys: readonly string[],
  collector: IssueCollector,
  path = "/",
) {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(record)) {
    if (hasForbiddenFieldName(key)) {
      collector.add("content_field_forbidden", path, "content-bearing field is forbidden");
      continue;
    }
    if (!allowed.has(key)) {
      collector.add("unknown_field", path, "unknown field is forbidden");
    }
  }
}

function requireString(
  record: MutableRecord,
  key: string,
  collector: IssueCollector,
  options: { path?: string; maxLength?: number; pattern?: RegExp; enumValues?: readonly string[] } = {},
): string | undefined {
  const path = options.path ?? `/${key}`;
  const value = record[key];
  if (typeof value !== "string") {
    collector.add("invalid_string", path, "field must be a bounded string");
    return undefined;
  }
  const maxLength = options.maxLength ?? MAX_STRING_LENGTH;
  if (value.length === 0 || value.length > maxLength) {
    collector.add("invalid_string_length", path, "field length is outside bounds");
    return undefined;
  }
  if (options.pattern && !options.pattern.test(value)) {
    collector.add("invalid_string_pattern", path, "field does not match required pattern");
    return undefined;
  }
  if (options.enumValues && !options.enumValues.includes(value)) {
    collector.add("invalid_enum", path, "field is not an allowed enum value");
    return undefined;
  }
  return value;
}

function requireEnum<const T extends readonly string[]>(
  record: MutableRecord,
  key: string,
  collector: IssueCollector,
  enumValues: T,
  options: { path?: string; maxLength?: number; pattern?: RegExp } = {},
): T[number] | undefined {
  const path = options.path ?? `/${key}`;
  const value = requireString(record, key, collector, options);
  if (!value) {
    return undefined;
  }
  if (!isEnumValue(enumValues, value)) {
    collector.add("invalid_enum", path, "field is not an allowed enum value");
    return undefined;
  }
  return value;
}

function isEnumValue<const T extends readonly string[]>(enumValues: T, value: string): value is T[number] {
  return enumValues.some((item) => item === value);
}

function optionalString(
  record: MutableRecord,
  key: string,
  collector: IssueCollector,
  options: { path?: string; maxLength?: number; pattern?: RegExp } = {},
): string | undefined {
  if (!(key in record)) {
    return undefined;
  }
  return requireString(record, key, collector, options);
}

function requireConst<T extends string | boolean>(
  record: MutableRecord,
  key: string,
  expected: T,
  collector: IssueCollector,
  path = `/${key}`,
): T | undefined {
  if (record[key] !== expected) {
    collector.add("invalid_const", path, "field does not match required value");
    return undefined;
  }
  return expected;
}

function requireNonNegativeInteger(
  record: MutableRecord,
  key: string,
  collector: IssueCollector,
  path = `/${key}`,
): number | undefined {
  const value = record[key];
  if (!Number.isInteger(value) || typeof value !== "number" || value < 0) {
    collector.add("invalid_non_negative_integer", path, "field must be a non-negative integer");
    return undefined;
  }
  return value;
}

function optionalNonNegativeInteger(
  record: MutableRecord,
  key: string,
  collector: IssueCollector,
  path = `/${key}`,
): number | undefined {
  if (!(key in record)) {
    return undefined;
  }
  return requireNonNegativeInteger(record, key, collector, path);
}

function requireNonNegativeNumber(
  record: MutableRecord,
  key: string,
  collector: IssueCollector,
  path = `/${key}`,
): number | undefined {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    collector.add("invalid_non_negative_number", path, "field must be a non-negative number");
    return undefined;
  }
  return value;
}

function hasRequiredNumbers<T extends string>(
  values: Record<T, number | undefined>,
  keys: readonly T[],
): values is Record<T, number> {
  return keys.every((key) => values[key] !== undefined);
}

function requireTimestamp(record: MutableRecord, key: string, collector: IssueCollector): string | undefined {
  const value = requireString(record, key, collector, { pattern: ISO_TIMESTAMP_PATTERN });
  if (!value) {
    return undefined;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    collector.add("invalid_timestamp", `/${key}`, "field must be a canonical UTC timestamp");
    return undefined;
  }
  if (parsed > Date.now() + FUTURE_TIMESTAMP_TOLERANCE_MS) {
    collector.add("invalid_future_timestamp", `/${key}`, "field must not be future dated");
    return undefined;
  }
  return value;
}

function requireUsage(value: unknown, collector: IssueCollector): OperationUsage | undefined {
  if (!isPlainRecord(value)) {
    collector.add("invalid_object", "/usage", "field must be an object");
    return undefined;
  }
  validateUnknownKeys(
    value,
    USAGE_KEYS,
    collector,
    "/usage",
  );
  const usage: { [K in keyof OperationUsage]: number | undefined } = {
    input_tokens: requireNonNegativeInteger(value, "input_tokens", collector, "/usage/input_tokens"),
    output_tokens: requireNonNegativeInteger(value, "output_tokens", collector, "/usage/output_tokens"),
    total_tokens: requireNonNegativeInteger(value, "total_tokens", collector, "/usage/total_tokens"),
    cache_read_tokens: requireNonNegativeInteger(value, "cache_read_tokens", collector, "/usage/cache_read_tokens"),
    cache_write_tokens: requireNonNegativeInteger(
      value,
      "cache_write_tokens",
      collector,
      "/usage/cache_write_tokens",
    ),
  };
  if (!hasRequiredNumbers(usage, USAGE_KEYS)) {
    return undefined;
  }
  if (usage.total_tokens !== usage.input_tokens + usage.output_tokens) {
    collector.add("invalid_token_total", "/usage/total_tokens", "field must equal input and output token counters");
    return undefined;
  }
  return usage;
}

function requireCost(value: unknown, collector: IssueCollector): OperationCost | undefined {
  if (!isPlainRecord(value)) {
    collector.add("invalid_object", "/cost", "field must be an object");
    return undefined;
  }
  validateUnknownKeys(value, ["basis", "amount_usd"], collector, "/cost");
  const basis = requireEnum(value, "basis", collector, COST_BASIS, { path: "/cost/basis" });
  const amountUsd = requireNonNegativeNumber(value, "amount_usd", collector, "/cost/amount_usd");
  if (!basis || amountUsd === undefined) {
    return undefined;
  }
  if (basis === "none" && amountUsd !== 0) {
    collector.add("invalid_cost_amount", "/cost/amount_usd", "field must match cost basis");
    return undefined;
  }
  return { basis, amount_usd: amountUsd };
}

function requirePrivacy(value: unknown, collector: IssueCollector): OperationPrivacy | undefined {
  if (!isPlainRecord(value)) {
    collector.add("invalid_object", "/privacy", "field must be an object");
    return undefined;
  }
  validateUnknownKeys(value, ["metadata_only", "content_recorded", "tool_io_recorded"], collector, "/privacy");
  const metadataOnly = requireConst(value, "metadata_only", true, collector, "/privacy/metadata_only");
  const contentRecorded = requireConst(value, "content_recorded", false, collector, "/privacy/content_recorded");
  const toolIoRecorded = requireConst(value, "tool_io_recorded", false, collector, "/privacy/tool_io_recorded");
  if (metadataOnly === undefined || contentRecorded === undefined || toolIoRecorded === undefined) {
    return undefined;
  }
  return { metadata_only: true, content_recorded: false, tool_io_recorded: false };
}

function optionalTool(value: unknown, collector: IssueCollector): OperationToolMetadata | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isPlainRecord(value)) {
    collector.add("invalid_object", "/tool", "field must be an object");
    return undefined;
  }
  validateUnknownKeys(
    value,
    ["tool_signature_hash", ...TOOL_NUMERIC_KEYS, "failure_class"],
    collector,
    "/tool",
  );
  const signatureHash = requireString(value, "tool_signature_hash", collector, {
    path: "/tool/tool_signature_hash",
    pattern: HASH_PATTERN,
    maxLength: 71,
  });
  const numericFields: Record<(typeof TOOL_NUMERIC_KEYS)[number], number | undefined> = {
    argument_bytes: requireNonNegativeInteger(value, "argument_bytes", collector, "/tool/argument_bytes"),
    result_bytes: requireNonNegativeInteger(value, "result_bytes", collector, "/tool/result_bytes"),
  };
  const failureClass = requireEnum(value, "failure_class", collector, TOOL_FAILURE_CLASSES, { path: "/tool/failure_class" });
  if (!signatureHash || !hasRequiredNumbers(numericFields, TOOL_NUMERIC_KEYS) || !failureClass) {
    return undefined;
  }
  return {
    tool_signature_hash: signatureHash,
    argument_bytes: numericFields.argument_bytes,
    result_bytes: numericFields.result_bytes,
    failure_class: failureClass,
  };
}

function expectedUpstreamRecordedForExport(state: OperationExportStatus): boolean {
  return state === "dual_written" || state === "replayed" || state === "partial_upload";
}

function normalizeExportMetadata(parsed: ParsedExportMetadata): OperationExportMetadata | undefined {
  switch (parsed.state) {
    case "duplicate":
      if (!parsed.duplicate_of_idempotency_key) {
        return undefined;
      }
      return { ...parsed, state: "duplicate", upstream_recorded: false, duplicate_of_idempotency_key: parsed.duplicate_of_idempotency_key };
    case "schema_mismatch":
      if (!parsed.mismatch_schema_version) {
        return undefined;
      }
      return { ...parsed, state: "schema_mismatch", upstream_recorded: false, mismatch_schema_version: parsed.mismatch_schema_version };
    case "replayed":
      return { ...parsed, state: "replayed", upstream_recorded: true };
    case "dual_written":
      return { ...parsed, state: "dual_written", upstream_recorded: true };
    case "partial_upload":
      return { ...parsed, state: "partial_upload", upstream_recorded: true };
    case "local_only":
      return { ...parsed, state: "local_only", upstream_recorded: false };
  }
}

function requireExport(
  value: unknown,
  collector: IssueCollector,
  retryOf: string | undefined,
): OperationExportMetadata | undefined {
  if (!isPlainRecord(value)) {
    collector.add("invalid_object", "/export", "field must be an object");
    return undefined;
  }
  validateUnknownKeys(
    value,
    [
      "state",
      "local_recorded",
      "upstream_recorded",
      "replay_count",
      "duplicate_of_idempotency_key",
      "mismatch_schema_version",
    ],
    collector,
    "/export",
  );
  const state = requireEnum(value, "state", collector, EXPORT_STATUSES, { path: "/export/state" });
  const localRecorded = typeof value.local_recorded === "boolean" ? value.local_recorded : undefined;
  if (localRecorded === undefined) {
    collector.add("invalid_boolean", "/export/local_recorded", "field must be a boolean");
  }
  const upstreamRecorded = typeof value.upstream_recorded === "boolean" ? value.upstream_recorded : undefined;
  if (upstreamRecorded === undefined) {
    collector.add("invalid_boolean", "/export/upstream_recorded", "field must be a boolean");
  }
  const replayCount = optionalNonNegativeInteger(value, "replay_count", collector, "/export/replay_count");
  const duplicateOf = optionalString(value, "duplicate_of_idempotency_key", collector, {
    path: "/export/duplicate_of_idempotency_key",
    pattern: HASH_PATTERN,
    maxLength: 71,
  });
  const mismatchSchemaVersion = optionalString(value, "mismatch_schema_version", collector, {
    path: "/export/mismatch_schema_version",
    maxLength: MAX_STRING_LENGTH,
  });
  if (!state || localRecorded === undefined || upstreamRecorded === undefined) {
    return undefined;
  }
  const expectedUpstreamRecorded = expectedUpstreamRecordedForExport(state);
  if (upstreamRecorded !== expectedUpstreamRecorded) {
    collector.add("invalid_const", "/export/upstream_recorded", "field does not match required value");
  }
  if (state === "duplicate") {
    if (!duplicateOf) {
      collector.add("missing_required_field", "/export/duplicate_of_idempotency_key", "required field is missing");
    }
  } else if (duplicateOf) {
    collector.add("invalid_export_state_field", "/export/duplicate_of_idempotency_key", "field must match export state");
  }
  if (state === "replayed") {
    if (!retryOf) {
      collector.add("missing_required_field", "/retry_of", "required field is missing");
    }
    if (replayCount === undefined) {
      collector.add("missing_required_field", "/export/replay_count", "required field is missing");
    } else if (replayCount < 1) {
      collector.add("invalid_replay_count", "/export/replay_count", "field must match export state");
    }
  } else if (replayCount !== undefined && replayCount !== 0) {
    collector.add("invalid_replay_count", "/export/replay_count", "field must match export state");
  }
  if (state === "schema_mismatch") {
    if (!mismatchSchemaVersion) {
      collector.add("missing_required_field", "/export/mismatch_schema_version", "required field is missing");
    } else if (mismatchSchemaVersion === OPERATION_TELEMETRY_SCHEMA_VERSION) {
      collector.add("invalid_schema_version", "/export/mismatch_schema_version", "field must differ from current schema version");
    }
  } else if (mismatchSchemaVersion) {
    collector.add("invalid_export_state_field", "/export/mismatch_schema_version", "field must match export state");
  }
  if (collector.issues.length > 0) {
    return undefined;
  }
  const parsed: ParsedExportMetadata = {
    state,
    local_recorded: localRecorded,
    upstream_recorded: upstreamRecorded,
    replay_count: replayCount ?? 0,
  };
  if (duplicateOf) {
    parsed.duplicate_of_idempotency_key = duplicateOf;
  }
  if (mismatchSchemaVersion) {
    parsed.mismatch_schema_version = mismatchSchemaVersion;
  }
  return normalizeExportMetadata(parsed);
}

function validateTiming(startedAt: string, endedAt: string, durationMs: number, collector: IssueCollector) {
  const startedMs = Date.parse(startedAt);
  const endedMs = Date.parse(endedAt);
  if (endedMs < startedMs) {
    collector.add("invalid_time_range", "/ended_at", "field must be on or after start time");
    return;
  }
  if (Math.abs(durationMs - (endedMs - startedMs)) > TIMESTAMP_DURATION_TOLERANCE_MS) {
    collector.add("invalid_duration", "/duration_ms", "field must match timestamp difference");
  }
}

function requiredKeysForKind(kind: OperationRecordKind | undefined): string[] {
  if (kind === "operation_start") {
    return [...COMMON_REQUIRED_KEYS];
  }
  if (kind === "operation_terminal") {
    return [...COMMON_REQUIRED_KEYS, "ended_at", "duration_ms"];
  }
  if (kind === "export_state") {
    return [...COMMON_REQUIRED_KEYS, "ended_at", "duration_ms", "export"];
  }
  return ["schema_version", "record_kind"];
}

function allowedKeysForKind(kind: OperationRecordKind | undefined): string[] {
  if (kind === "operation_start") {
    return [...COMMON_KEYS];
  }
  if (kind === "operation_terminal") {
    return [...COMMON_KEYS, ...TERMINAL_EXTRA_KEYS];
  }
  if (kind === "export_state") {
    return [...COMMON_KEYS, ...EXPORT_EXTRA_KEYS];
  }
  return [...COMMON_KEYS, ...TERMINAL_EXTRA_KEYS, ...EXPORT_EXTRA_KEYS];
}

function validateRequiredKeys(record: MutableRecord, kind: OperationRecordKind | undefined, collector: IssueCollector) {
  for (const key of requiredKeysForKind(kind)) {
    if (!(key in record)) {
      collector.add("missing_required_field", `/${key}`, "required field is missing");
    }
  }
}

function validateCommon(record: MutableRecord, collector: IssueCollector) {
  const schemaVersion = requireConst(
    record,
    "schema_version",
    OPERATION_TELEMETRY_SCHEMA_VERSION,
    collector,
  );
  const operationId = requireString(record, "operation_id", collector, { pattern: ID_PATTERN });
  const attemptId = requireString(record, "attempt_id", collector, { pattern: ID_PATTERN });
  const spanId = requireString(record, "span_id", collector, { pattern: ID_PATTERN });
  const parentSpanId = optionalString(record, "parent_span_id", collector, { pattern: ID_PATTERN });
  const retryOf = optionalString(record, "retry_of", collector, { pattern: ID_PATTERN });
  const idempotencyKey = requireString(record, "idempotency_key", collector, {
    pattern: HASH_PATTERN,
    maxLength: 71,
  });
  const goalId = requireString(record, "goal_id", collector, { pattern: ID_PATTERN });
  const runId = requireString(record, "run_id", collector, { pattern: ID_PATTERN });
  const stage = requireString(record, "stage", collector);
  const operationType = requireEnum(record, "operation_type", collector, OPERATION_TYPES);
  const operationName = requireString(record, "operation_name", collector, { maxLength: MAX_NAME_LENGTH });
  const startedAt = requireTimestamp(record, "started_at", collector);
  const provider = optionalString(record, "provider", collector);
  const model = optionalString(record, "model", collector);
  const usage = requireUsage(record.usage, collector);
  const cost = requireCost(record.cost, collector);
  const privacy = requirePrivacy(record.privacy, collector);

  if (
    !schemaVersion ||
    !operationId ||
    !attemptId ||
    !spanId ||
    !idempotencyKey ||
    !goalId ||
    !runId ||
    !stage ||
    !operationType ||
    !operationName ||
    !startedAt ||
    !usage ||
    !cost ||
    !privacy
  ) {
    return undefined;
  }

  const normalized: OperationRecordBase = {
    schema_version: schemaVersion,
    record_kind: "operation_start",
    operation_id: operationId,
    attempt_id: attemptId,
    span_id: spanId,
    idempotency_key: idempotencyKey,
    goal_id: goalId,
    run_id: runId,
    stage,
    operation_type: operationType,
    operation_name: operationName,
    status: "",
    started_at: startedAt,
    usage,
    cost,
    privacy,
  };
  if (parentSpanId) {
    normalized.parent_span_id = parentSpanId;
  }
  if (retryOf) {
    normalized.retry_of = retryOf;
  }
  if (provider) {
    normalized.provider = provider;
  }
  if (model) {
    normalized.model = model;
  }
  return normalized;
}

export function validateOperationTelemetryRecord(input: unknown): OperationValidationResult {
  const collector = makeCollector();
  if (!isPlainRecord(input)) {
    collector.add("invalid_record", "/", "record must be an object");
    return { ok: false, errors: collector.issues };
  }

  const rawKind = input.record_kind;
  const kind = typeof rawKind === "string" && isEnumValue(RECORD_KINDS, rawKind) ? rawKind : undefined;
  validateUnknownKeys(input, allowedKeysForKind(kind), collector);
  validateRequiredKeys(input, kind, collector);

  if (!kind) {
    collector.add("invalid_enum", "/record_kind", "field is not an allowed enum value");
    return { ok: false, errors: collector.issues };
  }

  const base = validateCommon(input, collector);
  if (!base) {
    return { ok: false, errors: collector.issues };
  }
  base.record_kind = kind;

  if (kind === "operation_start") {
    const status = requireEnum(input, "status", collector, START_STATUSES);
    if (!status || collector.issues.length > 0) {
      return { ok: false, errors: collector.issues };
    }
    return { ok: true, value: { ...base, record_kind: kind, status } };
  }

  const endedAt = requireTimestamp(input, "ended_at", collector);
  const durationMs = requireNonNegativeInteger(input, "duration_ms", collector);
  if (base.started_at && endedAt && durationMs !== undefined) {
    validateTiming(base.started_at, endedAt, durationMs, collector);
  }

  if (kind === "operation_terminal") {
    const status = requireEnum(input, "status", collector, TERMINAL_STATUSES);
    const tool = optionalTool(input.tool, collector);
    if (base.operation_type === "tool" && !tool) {
      collector.add("missing_required_field", "/tool", "required field is missing");
    }
    if (!status || !endedAt || durationMs === undefined || collector.issues.length > 0) {
      return { ok: false, errors: collector.issues };
    }
    const normalized: OperationTerminalRecordBase & { tool?: OperationToolMetadata } = {
      ...base,
      record_kind: kind,
      status,
      ended_at: endedAt,
      duration_ms: durationMs,
    };
    if (tool) {
      normalized.tool = tool;
    }
    return { ok: true, value: normalized as OperationTerminalRecord };
  }

  const status = requireEnum(input, "status", collector, EXPORT_STATUSES);
  const exportMetadata = requireExport(input.export, collector, base.retry_of);
  if (
    !status ||
    !endedAt ||
    durationMs === undefined ||
    !exportMetadata ||
    status !== exportMetadata.state ||
    collector.issues.length > 0
  ) {
    if (status && exportMetadata && status !== exportMetadata.state) {
      collector.add("invalid_const", "/export/state", "field does not match required value");
    }
    return { ok: false, errors: collector.issues };
  }
  return {
    ok: true,
    value: {
      ...base,
      record_kind: kind,
      status,
      ended_at: endedAt,
      duration_ms: durationMs,
      export: exportMetadata,
    },
  };
}

export type OperationIdSeed = {
  schema_version?: typeof OPERATION_TELEMETRY_SCHEMA_VERSION;
  goal_id: string;
  run_id: string;
  stage: string;
  operation_type: OperationType;
  operation_name: string;
  attempt?: number;
  parent_span_id?: string;
  retry_of?: string;
};

function assertBoundedScalarMetadata(value: Record<string, unknown>) {
  for (const [key, item] of Object.entries(value)) {
    if (!CANONICAL_INPUT_KEY_SET.has(key) && key !== "attempt") {
      throw new Error("unsupported id input");
    }
    if (typeof item === "string" && (item.length === 0 || item.length > MAX_NAME_LENGTH)) {
      throw new Error("invalid id input");
    }
    if (typeof item === "number" && (!Number.isInteger(item) || item < 0)) {
      throw new Error("invalid id input");
    }
    if (typeof item !== "string" && typeof item !== "number" && typeof item !== "undefined") {
      throw new Error("invalid id input");
    }
    if (hasForbiddenFieldName(key)) {
      throw new Error("forbidden id input");
    }
  }
}

export function canonicalizeOperationIdSeed(seed: OperationIdSeed): string {
  const canonical: Record<string, string | number> = {
    schema_version: seed.schema_version ?? OPERATION_TELEMETRY_SCHEMA_VERSION,
    goal_id: seed.goal_id,
    run_id: seed.run_id,
    stage: seed.stage,
    operation_type: seed.operation_type,
    operation_name: seed.operation_name,
  };
  if (seed.attempt !== undefined) {
    canonical.attempt = seed.attempt;
  }
  if (seed.parent_span_id) {
    canonical.parent_span_id = seed.parent_span_id;
  }
  if (seed.retry_of) {
    canonical.retry_of = seed.retry_of;
  }
  assertBoundedScalarMetadata(canonical);
  return JSON.stringify(
    Object.fromEntries(Object.entries(canonical).sort(([left], [right]) => left.localeCompare(right))),
  );
}

function hashPrefix(prefix: string, value: string): string {
  return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 32)}`;
}

export function makeOperationId(seed: OperationIdSeed): string {
  return hashPrefix("op", canonicalizeOperationIdSeed({ ...seed, attempt: undefined }));
}

export function makeAttemptId(seed: OperationIdSeed): string {
  return hashPrefix("att", canonicalizeOperationIdSeed(seed));
}

export function makeSpanId(seed: OperationIdSeed & { record_kind: OperationRecordKind }): string {
  return hashPrefix("span", `${seed.record_kind}:${canonicalizeOperationIdSeed(seed)}`);
}

export type OperationIdempotencyInput = {
  schema_version: typeof OPERATION_TELEMETRY_SCHEMA_VERSION;
  record_kind: OperationRecordKind;
  operation_id: string;
  attempt_id: string;
  span_id: string;
  status: string;
  started_at: string;
  ended_at?: string;
};

export function makeIdempotencyKey(record: OperationIdempotencyInput): string {
  const canonical = JSON.stringify(
    Object.fromEntries(
      Object.entries(record)
        .filter(([, value]) => value !== undefined)
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  );
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

export function recordsHaveSameIdempotency(left: OperationTelemetryRecord, right: OperationTelemetryRecord): boolean {
  return left.idempotency_key === right.idempotency_key;
}

export function canonicalOperationRecordString(record: OperationTelemetryRecord): string {
  return JSON.stringify(record);
}
