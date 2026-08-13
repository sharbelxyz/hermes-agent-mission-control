import type { OperationValidationIssue } from "./index";

const MAX_SCHEMA_ERRORS = 16;
const TIMESTAMP_DURATION_TOLERANCE_MS = 1;
const FUTURE_TIMESTAMP_TOLERANCE_MS = 60_000;

type JsonSchema = {
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
  not?: JsonSchema;
  if?: JsonSchema;
  then?: JsonSchema;
  else?: JsonSchema;
  type?: string;
  const?: unknown;
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, JsonSchema>;
  additionalProperties?: boolean;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  pattern?: string;
  format?: string;
};

type SchemaValidationResult = { ok: true } | { ok: false; errors: OperationValidationIssue[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function add(errors: OperationValidationIssue[], code: string, path: string, message: string) {
  if (errors.length < MAX_SCHEMA_ERRORS) {
    errors.push({ code, path, message });
  }
}

function validateType(schema: JsonSchema, value: unknown, path: string, errors: OperationValidationIssue[]) {
  if (!schema.type) {
    return;
  }
  if (schema.type === "object" && !isRecord(value)) {
    add(errors, "schema_invalid_type", path, "field does not match schema type");
  } else if (schema.type === "string" && typeof value !== "string") {
    add(errors, "schema_invalid_type", path, "field does not match schema type");
  } else if (schema.type === "integer" && (!Number.isInteger(value) || typeof value !== "number")) {
    add(errors, "schema_invalid_type", path, "field does not match schema type");
  } else if (schema.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
    add(errors, "schema_invalid_type", path, "field does not match schema type");
  } else if (schema.type === "boolean" && typeof value !== "boolean") {
    add(errors, "schema_invalid_type", path, "field does not match schema type");
  }
}

function validateSchemaNode(schema: JsonSchema, value: unknown, path: string, errors: OperationValidationIssue[]) {
  if (schema.oneOf) {
    const passing = schema.oneOf.filter((branch) => {
      const branchErrors: OperationValidationIssue[] = [];
      validateSchemaNode(branch, value, path, branchErrors);
      return branchErrors.length === 0;
    });
    if (passing.length !== 1) {
      add(errors, "schema_one_of", path, "record does not match exactly one schema branch");
    }
  }
  if (schema.anyOf) {
    const passing = schema.anyOf.some((branch) => {
      const branchErrors: OperationValidationIssue[] = [];
      validateSchemaNode(branch, value, path, branchErrors);
      return branchErrors.length === 0;
    });
    if (!passing) {
      add(errors, "schema_any_of", path, "record does not match an allowed schema branch");
    }
  }
  if (schema.allOf) {
    for (const branch of schema.allOf) {
      validateSchemaNode(branch, value, path, errors);
    }
  }
  if (schema.not) {
    const notErrors: OperationValidationIssue[] = [];
    validateSchemaNode(schema.not, value, path, notErrors);
    if (notErrors.length === 0) {
      add(errors, "schema_not", path, "field matches a forbidden schema branch");
    }
  }
  if (schema.if) {
    const ifErrors: OperationValidationIssue[] = [];
    validateSchemaNode(schema.if, value, path, ifErrors);
    const branch = ifErrors.length === 0 ? schema.then : schema.else;
    if (branch) {
      validateSchemaNode(branch, value, path, errors);
    }
  }

  validateType(schema, value, path, errors);
  if (errors.length >= MAX_SCHEMA_ERRORS) {
    return;
  }
  if ("const" in schema && value !== schema.const) {
    add(errors, "schema_invalid_const", path, "field does not match required schema value");
  }
  if (schema.enum && !schema.enum.includes(value)) {
    add(errors, "schema_invalid_enum", path, "field is not an allowed schema enum value");
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      add(errors, "schema_invalid_length", path, "field length is outside schema bounds");
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      add(errors, "schema_invalid_length", path, "field length is outside schema bounds");
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      add(errors, "schema_invalid_pattern", path, "field does not match schema pattern");
    }
    if (schema.format === "date-time" && Number.isNaN(Date.parse(value))) {
      add(errors, "schema_invalid_timestamp", path, "field does not match schema timestamp format");
    }
  }
  if (typeof value === "number" && schema.minimum !== undefined && value < schema.minimum) {
    add(errors, "schema_invalid_minimum", path, "field is below schema minimum");
  }
  if (
    (schema.type === "object" ||
      schema.properties ||
      schema.required ||
      schema.additionalProperties !== undefined) &&
    isRecord(value)
  ) {
    const properties = schema.properties ?? {};
    if (schema.required) {
      for (const key of schema.required) {
        if (!(key in value)) {
          add(errors, "schema_missing_required", `${path}${path === "/" ? "" : "/"}${key}`, "required field is missing");
        }
      }
    }
    for (const [key, item] of Object.entries(value)) {
      const property = properties[key];
      if (!property) {
        if (schema.additionalProperties === false) {
          add(errors, "schema_unknown_field", path, "unknown field is forbidden");
        }
        continue;
      }
      validateSchemaNode(property, item, `${path}${path === "/" ? "" : "/"}${key}`, errors);
    }
  }
}

function readPath(record: Record<string, unknown>, path: string): unknown {
  return path.split("/").filter(Boolean).reduce<unknown>((value, key) => {
    if (!isRecord(value)) {
      return undefined;
    }
    return value[key];
  }, record);
}

function validateOperationTelemetryContract(value: unknown, errors: OperationValidationIssue[]) {
  if (!isRecord(value)) {
    return;
  }
  const usage = readPath(value, "/usage");
  if (isRecord(usage)) {
    const inputTokens = usage.input_tokens;
    const outputTokens = usage.output_tokens;
    const totalTokens = usage.total_tokens;
    if (
      typeof inputTokens === "number" &&
      typeof outputTokens === "number" &&
      typeof totalTokens === "number" &&
      totalTokens !== inputTokens + outputTokens
    ) {
      add(errors, "schema_invalid_token_total", "/usage/total_tokens", "field does not match token counters");
    }
  }
  const cost = readPath(value, "/cost");
  if (isRecord(cost) && cost.basis === "none" && cost.amount_usd !== 0) {
    add(errors, "schema_invalid_cost_amount", "/cost/amount_usd", "field does not match cost basis");
  }
  if (typeof value.started_at === "string" && typeof value.ended_at === "string" && typeof value.duration_ms === "number") {
    const startedMs = Date.parse(value.started_at);
    const endedMs = Date.parse(value.ended_at);
    if (Number.isFinite(startedMs) && Number.isFinite(endedMs)) {
      const latestAllowedMs = Date.now() + FUTURE_TIMESTAMP_TOLERANCE_MS;
      if (startedMs > latestAllowedMs) {
        add(errors, "schema_invalid_future_timestamp", "/started_at", "field must not be future dated");
      }
      if (endedMs > latestAllowedMs) {
        add(errors, "schema_invalid_future_timestamp", "/ended_at", "field must not be future dated");
      }
      if (endedMs < startedMs) {
        add(errors, "schema_invalid_time_range", "/ended_at", "field does not match time range");
      } else if (Math.abs(value.duration_ms - (endedMs - startedMs)) > TIMESTAMP_DURATION_TOLERANCE_MS) {
        add(errors, "schema_invalid_duration", "/duration_ms", "field does not match timestamp difference");
      }
    }
  } else if (typeof value.started_at === "string") {
    const startedMs = Date.parse(value.started_at);
    if (Number.isFinite(startedMs) && startedMs > Date.now() + FUTURE_TIMESTAMP_TOLERANCE_MS) {
      add(errors, "schema_invalid_future_timestamp", "/started_at", "field must not be future dated");
    }
  }
  if (value.record_kind !== "export_state") {
    return;
  }
  const exportMetadata = value.export;
  if (!isRecord(exportMetadata) || typeof value.status !== "string" || typeof exportMetadata.state !== "string") {
    return;
  }
  if (value.status !== exportMetadata.state) {
    add(errors, "schema_invalid_const", "/export/state", "field does not match required schema value");
  }
  const expectedUpstreamRecorded =
    exportMetadata.state === "dual_written" ||
    exportMetadata.state === "replayed" ||
    exportMetadata.state === "partial_upload";
  if (exportMetadata.upstream_recorded !== expectedUpstreamRecorded) {
    add(errors, "schema_invalid_const", "/export/upstream_recorded", "field does not match required schema value");
  }
  if (exportMetadata.state === "duplicate" && typeof exportMetadata.duplicate_of_idempotency_key !== "string") {
    add(errors, "schema_missing_required", "/export/duplicate_of_idempotency_key", "required field is missing");
  } else if (exportMetadata.state !== "duplicate" && "duplicate_of_idempotency_key" in exportMetadata) {
    add(errors, "schema_invalid_state_field", "/export/duplicate_of_idempotency_key", "field does not match export state");
  }
  if (exportMetadata.state === "replayed") {
    if (typeof value.retry_of !== "string") {
      add(errors, "schema_missing_required", "/retry_of", "required field is missing");
    }
    if (typeof exportMetadata.replay_count !== "number") {
      add(errors, "schema_missing_required", "/export/replay_count", "required field is missing");
    } else if (exportMetadata.replay_count < 1) {
      add(errors, "schema_invalid_minimum", "/export/replay_count", "field is below schema minimum");
    }
  } else if (typeof exportMetadata.replay_count === "number" && exportMetadata.replay_count !== 0) {
    add(errors, "schema_invalid_state_field", "/export/replay_count", "field does not match export state");
  }
  if (exportMetadata.state === "schema_mismatch") {
    if (typeof exportMetadata.mismatch_schema_version !== "string") {
      add(errors, "schema_missing_required", "/export/mismatch_schema_version", "required field is missing");
    } else if (exportMetadata.mismatch_schema_version === "mc.operation.v1") {
      add(errors, "schema_invalid_const", "/export/mismatch_schema_version", "field matches forbidden schema value");
    }
  } else if ("mismatch_schema_version" in exportMetadata) {
    add(errors, "schema_invalid_state_field", "/export/mismatch_schema_version", "field does not match export state");
  }
}

export function validateOperationTelemetryJsonSchema(schema: unknown, value: unknown): SchemaValidationResult {
  if (!isRecord(schema)) {
    return {
      ok: false,
      errors: [{ code: "schema_invalid", path: "/", message: "schema must be an object" }],
    };
  }
  const errors: OperationValidationIssue[] = [];
  validateSchemaNode(schema as JsonSchema, value, "/", errors);
  validateOperationTelemetryContract(value, errors);
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
