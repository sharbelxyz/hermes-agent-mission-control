import assert from "node:assert/strict";
import test from "node:test";
import {
  collectHermesObservability,
  LANGFUSE_OBSERVATION_FIELDS,
  parseObservabilityWindow,
} from "../src/lib/langfuse-observability.ts";

const NOW = new Date("2026-08-05T12:00:00.000Z");

function setLangfuseEnv() {
  process.env.HERMES_LANGFUSE_BASE_URL = "https://langfuse.local";
  process.env.HERMES_LANGFUSE_PUBLIC_KEY = "pk-test";
  process.env.HERMES_LANGFUSE_SECRET_KEY = "sk-test";
}

test("collects paginated Langfuse observations into safe aggregates", async () => {
  setLangfuseEnv();
  const seenUrls: URL[] = [];
  const seenAuth: string[] = [];
  const quietSpanRows = Array.from({ length: 998 }, (_, index) => ({
    id: `quiet-span-${index}`,
    startTime: "2026-08-05T11:49:00.000Z",
    endTime: "2026-08-05T11:49:01.000Z",
    type: "SPAN",
    name: "workflow step",
    level: "DEFAULT",
    usageDetails: {},
    metadata: {
      tool_call_count: 0,
    },
  }));
  const pages = [
    {
      data: [
        {
          id: "obs-gen-1",
          traceId: "trace-1",
          sessionId: "session-1",
          startTime: "2026-08-05T11:50:00.000Z",
          endTime: "2026-08-05T11:50:02.000Z",
          type: "GENERATION",
          name: "generation",
          level: "DEFAULT",
          providedModelName: "gpt-5",
          usageDetails: {
            input: "1000",
            output: 200,
            total: "1200",
            cache_read_input_tokens: "50",
            cache_creation_input_tokens: null,
          },
          totalCost: "0.12",
          metadata: {
            provider: "openai",
            platform: "codex",
            tool_call_count: "2",
            tool_name: "should-not-count",
            prompt: "must not be returned",
          },
        },
        {
          id: "obs-tool-1",
          parentObservationId: "obs-gen-1",
          traceId: "trace-1",
          sessionId: "session-1",
          startTime: "2026-08-05T11:50:03.000Z",
          endTime: "2026-08-05T11:50:04.000Z",
          type: "TOOL",
          name: "web.run",
          level: "DEFAULT",
          usageDetails: {},
          metadata: {
            tool_name: "web.run",
            args: "must not be returned",
          },
        },
        ...quietSpanRows,
      ],
      meta: { cursor: "page-2" },
    },
    {
      data: [
        {
          id: "obs-gen-2",
          traceId: "trace-2",
          startTime: "2026-08-05T11:55:00.000Z",
          endTime: "2026-08-05T11:55:01.000Z",
          type: "GENERATION",
          name: "generation",
          level: "ERROR",
          statusMessage: "model failed",
          model: "claude-sonnet-4.5",
          usageDetails: {
            input: null,
            output: "0",
          },
          costDetails: {
            total: "0.03",
          },
          metadata: {
            provider: "anthropic",
            platform: "server",
          },
        },
        {
          id: "obs-tool-2",
          traceId: "trace-1",
          sessionId: "session-1",
          startTime: "2026-08-05T11:50:05.000Z",
          endTime: "2026-08-05T11:50:06.000Z",
          type: "TOOL",
          name: "web.run",
          level: "DEFAULT",
          metadata: {
            tool_name: "web.run",
          },
        },
        {
          id: "obs-span-tool-1",
          traceId: "trace-1",
          sessionId: "session-1",
          startTime: "2026-08-05T11:50:07.000Z",
          endTime: "2026-08-05T11:50:08.000Z",
          type: "SPAN",
          name: "agent step",
          level: "DEFAULT",
          metadata: {
            tool_name: "browser.search",
            tool_call_id: "call-safe",
            args: "must not be returned",
          },
        },
        {
          id: "obs-event-tool-1",
          traceId: "trace-1",
          sessionId: "session-1",
          startTime: "2026-08-05T11:50:09.000Z",
          endTime: "2026-08-05T11:50:10.000Z",
          type: "EVENT",
          name: "tool:memory.lookup",
          level: "DEFAULT",
          metadata: {
            tool_call_count: "2",
            args: "must not be returned",
          },
        },
      ],
    },
  ];

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    seenUrls.push(url);
    const headers = init?.headers;
    if (headers instanceof Headers) {
      seenAuth.push(String(headers.get("authorization") ?? ""));
    } else if (headers && !Array.isArray(headers)) {
      seenAuth.push(String((headers as Record<string, string>).Authorization ?? ""));
    } else {
      seenAuth.push("");
    }
    const page = pages[seenUrls.length - 1];
    return new Response(JSON.stringify(page), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const result = await collectHermesObservability("24h", {
    now: NOW,
    fetchImpl,
  });

  assert.equal(seenUrls.length, 2);
  assert.equal(pages[0].data.length, 1000);
  assert.equal(seenUrls[0].pathname, "/api/public/v2/observations");
  assert.equal(seenUrls[0].searchParams.get("limit"), "1000");
  assert.equal(seenUrls[0].searchParams.get("fields"), LANGFUSE_OBSERVATION_FIELDS);
  assert.equal(seenUrls[0].searchParams.get("fields")?.includes("io"), false);
  assert.equal(seenUrls[0].searchParams.has("fromStartTime"), true);
  assert.equal(seenUrls[0].searchParams.has("toStartTime"), true);
  assert.equal(seenUrls[1].searchParams.get("cursor"), "page-2");
  assert.equal(seenAuth.every((header) => header.startsWith("Basic ")), true);

  assert.equal(result.source.status, "ok");
  assert.equal(result.source.pages, 2);
  assert.equal(result.source.rows, 1004);
  assert.equal(result.totals?.inputTokens, 1000);
  assert.equal(result.totals?.outputTokens, 200);
  assert.equal(result.totals?.totalTokens, 1200);
  assert.equal(result.totals?.cacheReadTokens, 50);
  assert.equal(result.totals?.cacheWriteTokens, 0);
  assert.equal(result.totals?.totalCost, 0.15);
  assert.equal(result.totals?.generationCalls, 2);
  assert.equal(result.totals?.toolCalls, 5);
  assert.equal(result.totals?.uniqueTraces, 2);
  assert.equal(result.totals?.uniqueSessions, 1);
  assert.equal(result.totals?.errors, 1);
  assert.equal(result.workflow?.message, "LangGraph traces not detected");
  assert.equal(result.workflow?.modelGenerations, 2);
  assert.equal(result.workflow?.toolCalls, 5);
  assert.equal(result.workflow?.parentEdges, 1);
  assert.equal(result.workflow?.observationTypes.GENERATION, 2);
  assert.equal(result.amplification?.inputOutputRatio, 5);
  assert.equal(result.amplification?.deterministicFlags.includes("input_output_ratio_high"), true);
  assert.equal(result.byProvider[0].provider, "openai");
  assert.equal(result.byProvider[0].modelClass, "cloud");

  assert.deepEqual(
    result.byModel.map((model) => [model.model, model.totalTokens, model.cost, model.provider]),
    [
      ["gpt-5", 1200, 0.12, "openai"],
      ["claude-sonnet-4.5", 0, 0.03, "anthropic"],
    ],
  );

  const session = result.sessions.find((row) => row.sessionId === "session-1");
  assert.equal(session?.traceId, "trace-1");
  assert.equal(session?.totalTokens, 1200);
  assert.equal(session?.toolCallCount, 5);
  assert.equal(session?.provider, "openai");
  assert.equal(session?.platform, "codex");
  assert.deepEqual(
    result.tools.recent.map((tool) => [tool.name, tool.count]),
    [
      ["memory.lookup", 2],
      ["browser.search", 1],
      ["web.run", 2],
    ],
  );
  assert.deepEqual(
    result.tools.repeated.map((tool) => [tool.name, tool.count]),
    [
      ["memory.lookup", 2],
      ["web.run", 2],
    ],
  );
  assert.equal(result.tools.recent.some((tool) => tool.name === "should-not-count"), false);
  assert.equal(result.graftCohort.status, "missing");
  assert.equal(result.graftCohort.signalOperations, 0);
  assert.equal(result.wasteFlags.some((flag) => flag.kind === "largest_token_session"), true);
  assert.equal(result.wasteFlags.some((flag) => flag.kind === "high_input_output_ratio"), true);
  assert.equal(result.topLargeTraces[0].totalTokens, 1200);
  assert.equal(result.topExpensiveTraces[0].cost, 0.12);
  assert.equal(result.recommendations.some((item) => item.includes("LangGraph")), true);
  assert.equal(JSON.stringify(result).includes("must not be returned"), false);
});

test("derives bounded privacy-safe correlation and operation accounting", async () => {
  setLangfuseEnv();
  const page = {
    data: [
      {
        id: "planner-gen",
        traceId: "trace-shared",
        sessionId: "session-shared",
        startTime: "2026-08-05T11:40:00.000Z",
        endTime: "2026-08-05T11:40:01.000Z",
        type: "GENERATION",
        providedModelName: "claude-opus-4-6",
        usageDetails: {
          input: 1_000_000,
          output: 100_000,
          total: 1_100_000,
          cache_read_input_tokens: 2_000_000,
          cache_creation_input_tokens: 3_000_000,
        },
        totalCost: "0.02",
        metadata: {
          operation_id: "op-planner",
          goal_id: "goal-p1a",
          run_id: "run-001",
          stage: "planner",
          provider: "anthropic",
          platform: "mission-control",
          prompt: "raw planner prompt must not leak",
        },
      },
      {
        id: "coder-gen",
        traceId: "trace-shared",
        sessionId: "session-shared",
        startTime: "2026-08-05T11:41:00.000Z",
        endTime: "2026-08-05T11:41:02.000Z",
        type: "GENERATION",
        providedModelName: "qwen3-coder",
        usageDetails: {
          input: 2000,
          output: 500,
          total: 2500,
        },
        totalCost: "8",
        metadata: {
          operationId: "op-coder",
          goalId: "goal-p1a",
          runId: "run-001",
          stageId: "coder",
          provider: "custom",
          platform: "codex",
          response: "raw coder response must not leak",
        },
      },
      {
        id: "coder-gen",
        traceId: "trace-shared",
        sessionId: "session-shared",
        startTime: "2026-08-05T11:41:00.000Z",
        endTime: "2026-08-05T11:41:02.000Z",
        type: "GENERATION",
        providedModelName: "qwen3-coder",
        usageDetails: {
          input: 2000,
          output: 500,
          total: 2500,
        },
        totalCost: "8",
        metadata: {
          operationId: "op-coder",
          goalId: "goal-p1a",
          runId: "run-001",
          stageId: "coder",
          provider: "custom",
          tool_args: "duplicate content must not leak",
        },
      },
      {
        id: "coder-tool-1",
        traceId: "trace-shared",
        sessionId: "session-shared",
        startTime: "2026-08-05T11:41:03.000Z",
        endTime: "2026-08-05T11:41:04.000Z",
        type: "TOOL",
        name: "apply_patch",
        metadata: {
          operation_id: "op-coder",
          goal_id: "goal-p1a",
          run_id: "run-001",
          stage: "coder",
          tool_call_id: "tool-call-1",
          tool_name: "apply_patch",
          secret: "HERMES_SECRET_SHOULD_NOT_LEAK",
        },
      },
      {
        id: "coder-tool-2",
        traceId: "trace-shared",
        sessionId: "session-shared",
        startTime: "2026-08-05T11:41:05.000Z",
        endTime: "2026-08-05T11:41:06.000Z",
        type: "TOOL",
        name: "apply_patch",
        metadata: {
          operation_id: "op-coder",
          goal_id: "goal-p1a",
          run_id: "run-001",
          stage: "coder",
          tool_call_id: "tool-call-1",
          tool_name: "apply_patch",
          tool_result: "raw tool result must not leak",
        },
      },
      {
        id: "reviewer-gen",
        traceId: "trace-shared",
        sessionId: "session-shared",
        startTime: "2026-08-05T11:42:00.000Z",
        endTime: "2026-08-05T11:42:01.000Z",
        type: "GENERATION",
        providedModelName: "claude-future",
        usageDetails: {
          input: 1000,
          output: 100,
          total: 1100,
        },
        totalCost: "0.5",
        metadata: {
          operation: "op-reviewer",
          goal: "goal-p1a",
          run: "run-001",
          phase: "reviewer",
          provider: "anthropic",
          platform: "server",
        },
      },
      {
        id: "legacy-gen",
        traceId: "trace-legacy",
        sessionId: "session-legacy",
        startTime: "2026-08-05T11:43:00.000Z",
        type: "GENERATION",
        providedModelName: "gpt-5",
        usageDetails: {
          input: 50,
          output: 5,
          total: 55,
        },
        totalCost: "0.01",
        metadata: {
          provider: "openai",
          platform: "legacy",
        },
      },
      {
        id: "invalid-gen",
        traceId: "trace-invalid",
        startTime: "2026-08-05T11:44:00.000Z",
        type: "GENERATION",
        providedModelName: "gpt-5",
        usageDetails: {
          input: 10,
          output: 1,
          total: 11,
        },
        totalCost: "0.01",
        metadata: {
          operation_id: "x".repeat(120),
          goal_id: { nested: "not allowed" },
          run_id: "run with spaces",
          stage: ["review"],
          provider: "openai",
          args: "invalid row content must not leak",
        },
      },
    ],
  };
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify(page), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const result = await collectHermesObservability("24h", {
    now: NOW,
    fetchImpl,
  });

  assert.equal(result.correlationCoverage.status, "partial");
  assert.equal(result.correlationCoverage.totalObservations, 8);
  assert.equal(result.correlationCoverage.eligibleObservations, 7);
  assert.equal(result.correlationCoverage.withOperationId, 5);
  assert.equal(result.correlationCoverage.withGoalId, 5);
  assert.equal(result.correlationCoverage.withRunId, 5);
  assert.equal(result.correlationCoverage.withStageId, 5);
  assert.equal(result.correlationCoverage.invalidIdentifierObservations, 1);
  assert.equal(result.correlationCoverage.fullyCorrelatedObservations, 5);
  assert.equal(result.correlationCoverage.operationCount, 3);
  assert.equal(result.correlationCoverage.fullyCorrelatedOperations, 3);
  assert.equal(result.correlationCoverage.percentage, 0.71);
  assert.equal(result.source.rows, 8);
  assert.equal(result.source.includedRows, 8);

  assert.deepEqual(
    result.operations.map((operation) => operation.operationId),
    ["op-reviewer", "op-coder", "op-planner"],
  );

  const planner = result.operations.find((operation) => operation.operationId === "op-planner");
  assert.equal(planner?.goalId, "goal-p1a");
  assert.equal(planner?.runId, "run-001");
  assert.equal(planner?.stageId, "planner");
  assert.deepEqual(planner?.providers, ["anthropic"]);
  assert.deepEqual(planner?.platforms, ["mission-control"]);
  assert.equal(planner?.reportedCost, 0.02);
  assert.equal(planner?.estimatedCost, 27.25);
  assert.equal(planner?.effectiveCost, 27.25);
  assert.equal(planner?.costBasis, "anthropic_claude_opus_4_6_estimate_cache_write_5m_assumed");

  const coder = result.operations.find((operation) => operation.operationId === "op-coder");
  assert.equal(coder?.observations, 3);
  assert.equal(coder?.calls, 2);
  assert.equal(coder?.generationCalls, 1);
  assert.equal(coder?.toolCalls, 1);
  assert.equal(coder?.totalTokens, 2500);
  assert.equal(coder?.reportedCost, 8);
  assert.equal(coder?.estimatedCost, 0);
  assert.equal(coder?.effectiveCost, 0);
  assert.equal(coder?.costBasis, "mixed");

  const reviewer = result.operations.find((operation) => operation.operationId === "op-reviewer");
  assert.equal(reviewer?.effectiveCost, 0.5);
  assert.equal(reviewer?.estimatedCost, null);
  assert.equal(reviewer?.costBasis, "reported_only_unknown_cloud");

  assert.equal(result.accounting.operationCount, 3);
  assert.equal(result.accounting.returnedOperations, 3);
  assert.equal(result.accounting.truncatedOperations, false);
  assert.equal(result.accounting.reportedCost, 8.52);
  assert.equal(result.accounting.estimatedCost, 27.25);
  assert.equal(result.accounting.effectiveCost, 27.75);
  assert.equal(result.accounting.costBasis, "mixed");
  assert.equal(result.accounting.reconciliation, "partial");
  assert.equal(result.accounting.warnings.some((warning) => warning.includes("part")), true);
  assert.equal(result.accounting.warnings.some((warning) => warning.includes("invalid")), true);

  assert.equal(result.byProvider.some((provider) => provider.provider === "anthropic"), true);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("raw planner prompt must not leak"), false);
  assert.equal(serialized.includes("raw coder response must not leak"), false);
  assert.equal(serialized.includes("duplicate content must not leak"), false);
  assert.equal(serialized.includes("HERMES_SECRET_SHOULD_NOT_LEAK"), false);
  assert.equal(serialized.includes("raw tool result must not leak"), false);
  assert.equal(serialized.includes("invalid row content must not leak"), false);
  assert.equal(serialized.includes("x".repeat(120)), false);
});

test("retains first valid alias while marking any malformed alias invalid", async () => {
  setLangfuseEnv();
  const page = {
    data: [
      {
        id: "alias-invalid-first",
        traceId: "trace-alias-a",
        sessionId: "session-alias-a",
        startTime: "2026-08-05T11:50:00.000Z",
        type: "GENERATION",
        providedModelName: "gpt-5",
        usageDetails: { input: 10, output: 2, total: 12 },
        totalCost: "0.01",
        metadata: {
          operation_id: "bad operation",
          operationId: "op-alias-a",
          goal_id: "goal-alias",
          run_id: "run-alias",
          stage: "execute",
          provider: "openai",
        },
      },
      {
        id: "alias-invalid-second",
        traceId: "trace-alias-b",
        sessionId: "session-alias-b",
        startTime: "2026-08-05T11:51:00.000Z",
        type: "GENERATION",
        providedModelName: "gpt-5",
        usageDetails: { input: 20, output: 3, total: 23 },
        totalCost: "0.02",
        metadata: {
          operationId: "not reached by alias order",
          operation_id: "op-alias-b",
          goal_id: "goal-alias",
          run_id: "run-alias",
          stage: "execute",
          provider: "openai",
        },
      },
    ],
  };
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify(page), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const result = await collectHermesObservability("24h", {
    now: NOW,
    fetchImpl,
  });

  assert.deepEqual(
    result.operations.map((operation) => operation.operationId).sort(),
    ["op-alias-a", "op-alias-b"],
  );
  assert.equal(result.correlationCoverage.status, "partial");
  assert.equal(result.correlationCoverage.withOperationId, 2);
  assert.equal(result.correlationCoverage.invalidIdentifierObservations, 2);
  assert.equal(result.correlationCoverage.fullyCorrelatedObservations, 0);
  assert.equal(result.accounting.warnings.some((warning) => warning.includes("invalid")), true);
});

test("does not fabricate operations when correlation metadata is absent", async () => {
  setLangfuseEnv();
  const page = {
    data: [
      {
        id: "legacy-only",
        traceId: "trace-only",
        sessionId: "session-only",
        startTime: "2026-08-05T11:50:00.000Z",
        type: "GENERATION",
        providedModelName: "gpt-5",
        usageDetails: { input: 10, output: 5, total: 15 },
        totalCost: "0.01",
        metadata: {
          provider: "openai",
          prompt: "absent metadata content must not leak",
        },
      },
    ],
  };
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify(page), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const result = await collectHermesObservability("24h", {
    now: NOW,
    fetchImpl,
  });

  assert.equal(result.correlationCoverage.status, "missing");
  assert.equal(result.correlationCoverage.eligibleObservations, 1);
  assert.equal(result.correlationCoverage.withOperationId, 0);
  assert.equal(result.correlationCoverage.operationCount, 0);
  assert.deepEqual(result.operations, []);
  assert.equal(result.accounting.reconciliation, "missing");
  assert.equal(result.accounting.warnings.some((warning) => warning.includes("not fabricated")), true);
  assert.equal(JSON.stringify(result).includes("absent metadata content must not leak"), false);
});

test("deduplicates duplicate partial correlation rows before coverage status and percentage", async () => {
  setLangfuseEnv();
  const page = {
    data: [
      {
        id: "complete-gen",
        traceId: "trace-complete",
        sessionId: "session-complete",
        startTime: "2026-08-05T11:50:00.000Z",
        endTime: "2026-08-05T11:50:01.000Z",
        type: "GENERATION",
        providedModelName: "gpt-5",
        usageDetails: { input: 20, output: 5, total: 25 },
        totalCost: "0.01",
        metadata: {
          operation_id: "op-complete",
          goal_id: "goal-p1a",
          run_id: "run-001",
          stage: "execute",
          provider: "openai",
        },
      },
      {
        id: "partial-duplicate",
        traceId: "trace-partial",
        sessionId: "session-partial",
        startTime: "2026-08-05T11:50:02.000Z",
        endTime: "2026-08-05T11:50:03.000Z",
        type: "TOOL",
        name: "web.run",
        metadata: {
          operation_id: "op-partial",
          tool_name: "web.run",
        },
      },
      {
        id: "partial-duplicate",
        traceId: "trace-partial",
        sessionId: "session-partial",
        startTime: "2026-08-05T11:50:02.000Z",
        endTime: "2026-08-05T11:50:03.000Z",
        type: "TOOL",
        name: "web.run",
        metadata: {
          operation_id: "op-partial",
          tool_name: "web.run",
        },
      },
    ],
  };
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify(page), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const result = await collectHermesObservability("24h", {
    now: NOW,
    fetchImpl,
  });

  assert.equal(result.source.rows, 3);
  assert.equal(result.source.includedRows, 3);
  assert.equal(result.correlationCoverage.status, "partial");
  assert.equal(result.correlationCoverage.totalObservations, 3);
  assert.equal(result.correlationCoverage.eligibleObservations, 2);
  assert.equal(result.correlationCoverage.withOperationId, 2);
  assert.equal(result.correlationCoverage.withGoalId, 1);
  assert.equal(result.correlationCoverage.withRunId, 1);
  assert.equal(result.correlationCoverage.withStageId, 1);
  assert.equal(result.correlationCoverage.fullyCorrelatedObservations, 1);
  assert.equal(result.correlationCoverage.percentage, 0.5);

  const partial = result.operations.find((operation) => operation.operationId === "op-partial");
  assert.equal(partial?.observations, 1);
  assert.equal(partial?.toolCalls, 1);
});

test("does not collapse distinct no-id tool observations during dedupe", async () => {
  setLangfuseEnv();
  const page = {
    data: [
      {
        id: "agent-gen-no-id-tools",
        traceId: "trace-no-id-tools",
        sessionId: "session-no-id-tools",
        startTime: "2026-08-05T11:50:00.000Z",
        endTime: "2026-08-05T11:50:01.000Z",
        type: "GENERATION",
        providedModelName: "gpt-5",
        usageDetails: { input: 100, output: 10, total: 110 },
        totalCost: "0.01",
        metadata: {
          operation_id: "op-no-id-tools",
          goal_id: "goal-p1a",
          run_id: "run-001",
          stage: "execute",
          provider: "openai",
        },
      },
      {
        traceId: "trace-no-id-tools",
        sessionId: "session-no-id-tools",
        parentObservationId: "agent-gen-no-id-tools",
        startTime: "2026-08-05T11:50:02.000Z",
        endTime: "2026-08-05T11:50:03.000Z",
        type: "TOOL",
        name: "apply_patch",
        metadata: {
          operation_id: "op-no-id-tools",
          tool_call_id: "tool-call-a",
          tool_name: "apply_patch",
        },
      },
      {
        traceId: "trace-no-id-tools",
        sessionId: "session-no-id-tools",
        parentObservationId: "agent-gen-no-id-tools",
        startTime: "2026-08-05T11:50:02.000Z",
        endTime: "2026-08-05T11:50:03.000Z",
        type: "TOOL",
        name: "apply_patch",
        metadata: {
          operation_id: "op-no-id-tools",
          tool_call_id: "tool-call-b",
          tool_name: "apply_patch",
        },
      },
    ],
  };
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify(page), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const result = await collectHermesObservability("24h", {
    now: NOW,
    fetchImpl,
  });

  assert.equal(result.source.rows, 3);
  assert.equal(result.correlationCoverage.eligibleObservations, 3);
  assert.equal(result.correlationCoverage.withOperationId, 3);
  assert.equal(result.correlationCoverage.fullyCorrelatedObservations, 1);

  const operation = result.operations.find((row) => row.operationId === "op-no-id-tools");
  assert.equal(operation?.observations, 3);
  assert.equal(operation?.calls, 3);
  assert.equal(operation?.toolCalls, 2);
});

test("dedupes duplicate same-id observations across global aggregates while preserving raw rows", async () => {
  setLangfuseEnv();
  const page = {
    data: [
      {
        id: "dup-gen",
        traceId: "trace-counted",
        sessionId: "session-counted",
        startTime: "2026-08-05T11:50:00.000Z",
        endTime: "2026-08-05T11:50:01.000Z",
        type: "GENERATION",
        providedModelName: "gpt-5",
        usageDetails: {
          input: 100,
          output: 20,
          total: 120,
          cache_read_input_tokens: 5,
          cache_creation_input_tokens: 2,
        },
        totalCost: "0.02",
        metadata: {
          operation_id: "op-dedupe",
          goal_id: "goal-p1a",
          run_id: "run-001",
          stage: "execute",
          provider: "openai",
          platform: "codex",
        },
      },
      {
        id: "dup-gen",
        traceId: "trace-duplicate",
        sessionId: "session-duplicate",
        startTime: "2026-08-05T11:59:00.000Z",
        endTime: "2026-08-05T11:59:59.000Z",
        type: "GENERATION",
        level: "ERROR",
        providedModelName: "claude-opus-4-6",
        usageDetails: {
          input: 1_000_000,
          output: 500_000,
          total: 1_500_000,
          cache_read_input_tokens: 300_000,
          cache_creation_input_tokens: 200_000,
        },
        totalCost: "99",
        metadata: {
          operation_id: "op-dedupe-duplicate",
          goal_id: "goal-duplicate",
          run_id: "run-duplicate",
          stage: "duplicate",
          provider: "anthropic",
          platform: "server",
        },
      },
      {
        id: "dup-tool",
        parentObservationId: "dup-gen",
        traceId: "trace-counted",
        sessionId: "session-counted",
        startTime: "2026-08-05T11:50:02.000Z",
        endTime: "2026-08-05T11:50:03.000Z",
        type: "TOOL",
        name: "web.run",
        metadata: {
          operation_id: "op-dedupe",
          goal_id: "goal-p1a",
          run_id: "run-001",
          stage: "execute",
          tool_name: "web.run",
          tool_call_id: "tool-1",
        },
      },
      {
        id: "dup-tool",
        parentObservationId: "dup-gen",
        traceId: "trace-duplicate",
        sessionId: "session-duplicate",
        startTime: "2026-08-05T12:00:00.000Z",
        endTime: "2026-08-05T12:00:30.000Z",
        type: "TOOL",
        name: "apply_patch",
        level: "ERROR",
        metadata: {
          operation_id: "op-dedupe-duplicate",
          goal_id: "goal-duplicate",
          run_id: "run-duplicate",
          stage: "duplicate",
          tool_name: "apply_patch",
          tool_call_id: "tool-duplicate",
          tool_call_count: 9,
        },
      },
    ],
  };
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify(page), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const result = await collectHermesObservability("24h", {
    now: NOW,
    fetchImpl,
  });

  assert.equal(result.source.rows, 4);
  assert.equal(result.source.filteredRows, 0);
  assert.equal(result.source.includedRows, 4);
  assert.equal(result.correlationCoverage.totalObservations, 4);
  assert.equal(result.correlationCoverage.eligibleObservations, 2);
  assert.equal(result.correlationCoverage.withOperationId, 2);
  assert.equal(result.correlationCoverage.fullyCorrelatedObservations, 2);
  assert.equal(result.correlationCoverage.percentage, 1);

  assert.equal(result.totals?.inputTokens, 100);
  assert.equal(result.totals?.outputTokens, 20);
  assert.equal(result.totals?.totalTokens, 120);
  assert.equal(result.totals?.cacheReadTokens, 5);
  assert.equal(result.totals?.cacheWriteTokens, 2);
  assert.equal(result.totals?.reportedCost, 0.02);
  assert.equal(result.totals?.effectiveCost, 0.02);
  assert.equal(result.totals?.generationCalls, 1);
  assert.equal(result.totals?.toolCalls, 1);
  assert.equal(result.totals?.errors, 0);
  assert.equal(result.totals?.uniqueTraces, 1);
  assert.equal(result.totals?.uniqueSessions, 1);
  assert.equal(result.totals?.latestTimestamp, "2026-08-05T11:50:03.000Z");

  assert.deepEqual(result.byModel.map((model) => model.model), ["gpt-5"]);
  assert.equal(result.byModel[0]?.calls, 1);
  assert.deepEqual(result.byProvider.map((provider) => provider.provider), ["openai"]);
  assert.equal(result.byProvider[0]?.calls, 1);
  assert.deepEqual(result.sessions.map((session) => session.traceId), ["trace-counted"]);
  assert.equal(result.sessions[0]?.totalTokens, 120);
  assert.equal(result.sessions[0]?.toolCallCount, 1);
  assert.equal(result.sessions[0]?.status, "ok");
  assert.deepEqual(result.tools.recent.map((tool) => `${tool.name}:${tool.count}`), ["web.run:1"]);
  assert.deepEqual(result.tools.repeated, []);

  assert.deepEqual(result.workflow?.observationTypes, { GENERATION: 1, TOOL: 1 });
  assert.equal(result.workflow?.parentEdges, 1);
  assert.equal(result.workflow?.rootNodes, 1);
  assert.equal(result.workflow?.modelGenerations, 1);
  assert.equal(result.workflow?.toolCalls, 1);
  assert.equal(result.workflow?.errorNodes, 0);

  assert.equal(result.operations.length, 1);
  assert.equal(result.operations[0]?.operationId, "op-dedupe");
  assert.equal(result.operations[0]?.observations, 2);
  assert.equal(result.operations[0]?.calls, 2);
  assert.equal(result.operations[0]?.generationCalls, 1);
  assert.equal(result.operations[0]?.toolCalls, 1);
  assert.equal(result.operations[0]?.totalTokens, 120);
  assert.equal(result.operations[0]?.effectiveCost, 0.02);
  assert.equal(result.accounting.operationCount, 1);
  assert.equal(result.accounting.effectiveCost, 0.02);

  assert.deepEqual(result.topLargeTraces.map((trace) => trace.traceId), ["trace-counted"]);
  assert.deepEqual(result.topExpensiveTraces.map((trace) => trace.traceId), ["trace-counted"]);
  assert.equal(result.wasteFlags.find((flag) => flag.kind === "largest_token_session")?.value, 120);
  assert.equal(JSON.stringify(result).includes("trace-duplicate"), false);
  assert.equal(JSON.stringify(result).includes("apply_patch"), false);
});

test("keeps operation calls distinct from observations for span and event rows", async () => {
  setLangfuseEnv();
  const page = {
    data: [
      {
        id: "calls-gen",
        traceId: "trace-calls",
        sessionId: "session-calls",
        startTime: "2026-08-05T11:50:00.000Z",
        type: "GENERATION",
        providedModelName: "gpt-5",
        usageDetails: { input: 100, output: 10, total: 110 },
        totalCost: "0.01",
        metadata: {
          operation_id: "op-calls",
          goal_id: "goal-p1a",
          run_id: "run-001",
          stage: "execute",
          provider: "openai",
        },
      },
      {
        id: "calls-span-tool",
        traceId: "trace-calls",
        sessionId: "session-calls",
        startTime: "2026-08-05T11:50:01.000Z",
        type: "SPAN",
        name: "agent tool",
        metadata: {
          operation_id: "op-calls",
          tool_name: "browser.search",
          tool_call_id: "tool-span",
        },
      },
      {
        id: "calls-event-tool",
        traceId: "trace-calls",
        sessionId: "session-calls",
        startTime: "2026-08-05T11:50:02.000Z",
        type: "EVENT",
        name: "tool:memory.lookup",
        metadata: {
          operation_id: "op-calls",
          tool_call_count: "2",
        },
      },
      {
        id: "calls-span-no-tool",
        traceId: "trace-calls",
        sessionId: "session-calls",
        startTime: "2026-08-05T11:50:03.000Z",
        type: "SPAN",
        name: "agent bookkeeping",
        metadata: {
          operation_id: "op-calls",
        },
      },
      {
        id: "calls-event-no-tool",
        traceId: "trace-calls",
        sessionId: "session-calls",
        startTime: "2026-08-05T11:50:04.000Z",
        type: "EVENT",
        name: "checkpoint",
        metadata: {
          operation_id: "op-calls",
        },
      },
    ],
  };
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify(page), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const result = await collectHermesObservability("24h", {
    now: NOW,
    fetchImpl,
  });

  const operation = result.operations.find((row) => row.operationId === "op-calls");
  assert.equal(operation?.observations, 5);
  assert.equal(operation?.generationCalls, 1);
  assert.equal(operation?.toolCalls, 3);
  assert.equal(operation?.calls, 4);
});

test("reports operation-only tool observations as partial row-level correlation", async () => {
  setLangfuseEnv();
  const page = {
    data: [
      {
        id: "agent-gen",
        traceId: "trace-agent",
        sessionId: "session-agent",
        startTime: "2026-08-05T11:50:00.000Z",
        endTime: "2026-08-05T11:50:01.000Z",
        type: "GENERATION",
        providedModelName: "gpt-5",
        usageDetails: { input: 100, output: 25, total: 125 },
        totalCost: "0.02",
        metadata: {
          operation_id: "op-agent",
          goal_id: "goal-p1a",
          run_id: "run-001",
          stage: "execute",
          provider: "openai",
          platform: "codex",
        },
      },
      {
        id: "agent-tool-1",
        traceId: "trace-agent",
        sessionId: "session-agent",
        startTime: "2026-08-05T11:50:02.000Z",
        endTime: "2026-08-05T11:50:03.000Z",
        type: "TOOL",
        name: "web.run",
        metadata: {
          operation_id: "op-agent",
          tool_name: "web.run",
        },
      },
      {
        id: "agent-tool-2",
        traceId: "trace-agent",
        sessionId: "session-agent",
        startTime: "2026-08-05T11:50:04.000Z",
        endTime: "2026-08-05T11:50:05.000Z",
        type: "TOOL",
        name: "apply_patch",
        metadata: {
          operation_id: "op-agent",
          tool_name: "apply_patch",
        },
      },
    ],
  };
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify(page), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const result = await collectHermesObservability("24h", {
    now: NOW,
    fetchImpl,
  });

  assert.equal(result.correlationCoverage.status, "partial");
  assert.equal(result.correlationCoverage.totalObservations, 3);
  assert.equal(result.correlationCoverage.eligibleObservations, 3);
  assert.equal(result.correlationCoverage.withOperationId, 3);
  assert.equal(result.correlationCoverage.withGoalId, 1);
  assert.equal(result.correlationCoverage.withRunId, 1);
  assert.equal(result.correlationCoverage.withStageId, 1);
  assert.equal(result.correlationCoverage.invalidIdentifierObservations, 0);
  assert.equal(result.correlationCoverage.fullyCorrelatedObservations, 1);
  assert.equal(result.correlationCoverage.operationCount, 1);
  assert.equal(result.correlationCoverage.fullyCorrelatedOperations, 1);
  assert.equal(result.correlationCoverage.percentage, 0.33);
  assert.equal(result.accounting.reconciliation, "partial");
});

test("caps operation rows and nested identifiers deterministically", async () => {
  setLangfuseEnv();
  const data = Array.from({ length: 45 }, (_, index) => ({
    id: `cap-gen-${index}`,
    traceId: `trace-${String(index).padStart(2, "0")}`,
    sessionId: `session-${String(index).padStart(2, "0")}`,
    startTime: `2026-08-05T11:${String(index).padStart(2, "0")}:00.000Z`,
    endTime: `2026-08-05T11:${String(index).padStart(2, "0")}:01.000Z`,
    type: "GENERATION",
    providedModelName: "gpt-5",
    usageDetails: { input: index + 1, output: 1, total: index + 2 },
    totalCost: "0.01",
    metadata: {
      operation_id: `op-${String(index).padStart(2, "0")}`,
      goal_id: "goal-cap",
      run_id: "run-cap",
      stage: "stage-cap",
      provider: "openai",
      platform: "cap-test",
    },
  }));
  const page = { data };
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify(page), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const result = await collectHermesObservability("24h", {
    now: NOW,
    fetchImpl,
  });

  assert.equal(result.correlationCoverage.status, "observed");
  assert.equal(result.correlationCoverage.fullyCorrelatedObservations, 45);
  assert.equal(result.correlationCoverage.operationCount, 45);
  assert.equal(result.operations.length, 40);
  assert.equal(result.accounting.operationCount, 45);
  assert.equal(result.accounting.returnedOperations, 40);
  assert.equal(result.accounting.truncatedOperations, true);
  assert.equal(result.operations[0].operationId, "op-44");
  assert.equal(result.operations[39].operationId, "op-05");
  assert.equal(result.operations.every((operation) => operation.traceIds.length <= 6), true);
});

test("caps nested operation trace and session identifiers to deterministic six", async () => {
  setLangfuseEnv();
  const data = Array.from({ length: 8 }, (_, index) => ({
    id: `nested-gen-${index}`,
    traceId: `trace-nested-${String(7 - index).padStart(2, "0")}`,
    sessionId: `session-nested-${String(7 - index).padStart(2, "0")}`,
    startTime: `2026-08-05T11:5${index}:00.000Z`,
    type: "GENERATION",
    providedModelName: "gpt-5",
    usageDetails: { input: 1, output: 1, total: 2 },
    totalCost: "0.01",
    metadata: {
      operation_id: "op-nested-cap",
      goal_id: "goal-cap",
      run_id: "run-cap",
      stage: "stage-cap",
      provider: "openai",
    },
  }));
  const page = { data };
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify(page), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const result = await collectHermesObservability("24h", {
    now: NOW,
    fetchImpl,
  });

  assert.equal(result.operations.length, 1);
  assert.deepEqual(result.operations[0].traceIds, [
    "trace-nested-00",
    "trace-nested-01",
    "trace-nested-02",
    "trace-nested-03",
    "trace-nested-04",
    "trace-nested-05",
  ]);
  assert.deepEqual(result.operations[0].sessionIds, [
    "session-nested-00",
    "session-nested-01",
    "session-nested-02",
    "session-nested-03",
    "session-nested-04",
    "session-nested-05",
  ]);
});

test("keeps zero-cost null-estimate rows in operation cost-basis reconciliation", async () => {
  setLangfuseEnv();
  const page = {
    data: [
      {
        id: "zero-cloud",
        traceId: "trace-zero-cloud",
        sessionId: "session-zero-cloud",
        startTime: "2026-08-05T11:50:00.000Z",
        type: "GENERATION",
        providedModelName: "claude-future",
        usageDetails: { input: 0, output: 0, total: 0 },
        totalCost: "0",
        metadata: {
          operation_id: "op-zero-cloud",
          goal_id: "goal-zero",
          run_id: "run-zero",
          stage: "execute",
          provider: "anthropic",
        },
      },
      {
        id: "zero-local",
        traceId: "trace-zero-local",
        sessionId: "session-zero-local",
        startTime: "2026-08-05T11:51:00.000Z",
        type: "GENERATION",
        providedModelName: "qwen3-coder",
        usageDetails: { input: 0, output: 0, total: 0 },
        totalCost: "0",
        metadata: {
          operation_id: "op-zero-local",
          goal_id: "goal-zero",
          run_id: "run-zero",
          stage: "execute",
          provider: "custom",
        },
      },
    ],
  };
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify(page), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const result = await collectHermesObservability("24h", {
    now: NOW,
    fetchImpl,
  });

  const cloud = result.operations.find((operation) => operation.operationId === "op-zero-cloud");
  const local = result.operations.find((operation) => operation.operationId === "op-zero-local");
  assert.equal(cloud?.estimatedCost, null);
  assert.equal(cloud?.costBasis, "reported_only_unknown_cloud");
  assert.equal(local?.estimatedCost, 0);
  assert.equal(local?.costBasis, "local_zero");
  assert.equal(result.accounting.reportedCost, 0);
  assert.equal(result.accounting.estimatedCost, 0);
  assert.equal(result.accounting.effectiveCost, 0);
  assert.equal(result.accounting.costBasis, "mixed");
});

test("separates reported, estimated, and effective costs without guessing unknown pricing", async () => {
  setLangfuseEnv();
  const page = {
    data: [
      {
        id: "opus-real",
        traceId: "trace-opus",
        sessionId: "session-opus",
        startTime: "2026-08-05T11:50:00.000Z",
        endTime: "2026-08-05T11:50:01.000Z",
        type: "GENERATION",
        providedModelName: "claude-opus-4-6",
        usageDetails: {
          input: 1_000_000,
          output: 100_000,
          total: 1_100_000,
          cache_read_input_tokens: 2_000_000,
          cache_creation_input_tokens: 3_000_000,
        },
        totalCost: "0.02",
        metadata: {
          provider: "anthropic",
          prompt: "raw content must not leak",
        },
      },
      {
        id: "local-qwen",
        traceId: "trace-local",
        startTime: "2026-08-05T11:51:00.000Z",
        type: "GENERATION",
        providedModelName: "qwen3-coder",
        usageDetails: {
          input: 10_000,
          output: 1_000,
          total: 11_000,
        },
        totalCost: "9",
        metadata: {
          provider: "custom",
          environment: "development",
        },
      },
      {
        id: "unknown-cloud",
        traceId: "trace-unknown",
        startTime: "2026-08-05T11:52:00.000Z",
        type: "GENERATION",
        providedModelName: "claude-future",
        usageDetails: {
          input: 1000,
          output: 100,
          total: 1100,
        },
        totalCost: "0.5",
        metadata: {
          provider: "anthropic",
        },
      },
      {
        id: "synthetic-env",
        traceId: "trace-test",
        startTime: "2026-08-05T11:53:00.000Z",
        type: "GENERATION",
        providedModelName: "claude-opus-4-6",
        usageDetails: {
          input: 9_000_000,
          output: 9_000_000,
          cache_creation_input_tokens: 9_000_000,
        },
        totalCost: "999",
        metadata: {
          provider: "anthropic",
          environment: "test",
        },
      },
      {
        id: "synthetic-provider",
        traceId: "trace-synthetic",
        startTime: "2026-08-05T11:54:00.000Z",
        type: "GENERATION",
        providedModelName: "fake-model",
        usageDetails: {
          input: 1_000_000,
          output: 1_000_000,
        },
        totalCost: "999",
        metadata: {
          provider: "synthetic",
        },
      },
    ],
  };
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify(page), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const result = await collectHermesObservability("24h", {
    now: NOW,
    fetchImpl,
  });

  assert.equal(result.source.rows, 5);
  assert.equal(result.source.filteredRows, 2);
  assert.equal(result.source.includedRows, 3);
  assert.equal(result.totals?.reportedCost, 9.52);
  assert.equal(result.totals?.estimatedCost, 27.25);
  assert.equal(result.totals?.effectiveCost, 27.75);
  assert.equal(result.totals?.totalCost, 27.75);
  assert.equal(result.totals?.costBasis, "mixed");
  assert.equal(result.totals?.estimatedCostRange?.low, 27.25);
  assert.equal(result.totals?.estimatedCostRange?.high, 38.5);

  const opus = result.byModel.find((model) => model.model === "claude-opus-4-6");
  assert.equal(opus?.reportedCost, 0.02);
  assert.equal(opus?.estimatedCost, 27.25);
  assert.equal(opus?.effectiveCost, 27.25);
  assert.equal(opus?.costBasis, "anthropic_claude_opus_4_6_estimate_cache_write_5m_assumed");
  assert.equal(opus?.estimatedCostRange?.high, 38.5);
  assert.equal(opus?.cacheReadTokens, 2_000_000);
  assert.equal(opus?.cacheWriteTokens, 3_000_000);

  const local = result.byModel.find((model) => model.model === "qwen3-coder");
  assert.equal(local?.reportedCost, 9);
  assert.equal(local?.estimatedCost, 0);
  assert.equal(local?.effectiveCost, 0);
  assert.equal(local?.costBasis, "local_zero");

  const unknown = result.byModel.find((model) => model.model === "claude-future");
  assert.equal(unknown?.reportedCost, 0.5);
  assert.equal(unknown?.estimatedCost, null);
  assert.equal(unknown?.effectiveCost, 0.5);
  assert.equal(unknown?.costBasis, "reported_only_unknown_cloud");

  assert.equal(result.topExpensiveTraces[0].traceId, "trace-opus");
  assert.equal(result.topExpensiveTraces[0].reportedCost, 0.02);
  assert.equal(result.topExpensiveTraces[0].effectiveCost, 27.25);
  assert.equal(result.byProvider.find((provider) => provider.provider === "custom")?.effectiveCost, 0);
  assert.equal(JSON.stringify(result).includes("raw content must not leak"), false);
  assert.equal(JSON.stringify(result).includes("trace-test"), false);
  assert.equal(JSON.stringify(result).includes("trace-synthetic"), false);
});

test("returns failure health without fake totals when Langfuse fails", async () => {
  setLangfuseEnv();
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify({ error: "nope" }), { status: 500 });

  const result = await collectHermesObservability("7d", {
    now: NOW,
    fetchImpl,
  });

  assert.equal(result.source.status, "error");
  assert.equal(result.source.message, "Langfuse unavailable");
  assert.equal(result.totals, null);
  assert.deepEqual(result.byModel, []);
  assert.deepEqual(result.byProvider, []);
  assert.equal(result.correlationCoverage.status, "missing");
  assert.equal(result.correlationCoverage.eligibleObservations, 0);
  assert.deepEqual(result.operations, []);
  assert.equal(result.accounting.reconciliation, "missing");
  assert.equal(result.graftCohort.status, "missing");
  assert.equal(result.workflow, null);
  assert.equal(result.amplification, null);
  assert.deepEqual(result.recommendations, []);
  assert.equal(JSON.stringify(result).includes("sk-test"), false);
  assert.equal(JSON.stringify(result).includes("pk-test"), false);
});

test("validates supported observability windows", () => {
  assert.equal(parseObservabilityWindow("24h"), "24h");
  assert.equal(parseObservabilityWindow("7d"), "7d");
  assert.equal(parseObservabilityWindow("30d"), null);
  assert.equal(parseObservabilityWindow(null), null);
});

test("builds graft cohort lens from operation-tagged tool activity", async () => {
  setLangfuseEnv();
  const page = {
    data: [
      {
        id: "gen-a",
        traceId: "trace-a",
        sessionId: "session-a",
        startTime: "2026-08-05T11:30:00.000Z",
        endTime: "2026-08-05T11:30:01.000Z",
        type: "GENERATION",
        providedModelName: "gpt-5",
        usageDetails: { input: 200, output: 100, total: 300 },
        metadata: { provider: "openai", operation_id: "op-a", goal_id: "g-a", run_id: "r-a", stage_id: "s-a" },
      },
      {
        id: "tool-a",
        traceId: "trace-a",
        sessionId: "session-a",
        startTime: "2026-08-05T11:30:02.000Z",
        endTime: "2026-08-05T11:30:03.000Z",
        type: "TOOL",
        name: "graft.ask",
        metadata: { tool_name: "graft.ask", operation_id: "op-a", goal_id: "g-a", run_id: "r-a", stage_id: "s-a" },
      },
      {
        id: "gen-b",
        traceId: "trace-b",
        sessionId: "session-b",
        startTime: "2026-08-05T11:40:00.000Z",
        endTime: "2026-08-05T11:40:01.000Z",
        type: "GENERATION",
        providedModelName: "gpt-5",
        usageDetails: { input: 100, output: 50, total: 150 },
        metadata: { provider: "openai", operation_id: "op-b", goal_id: "g-b", run_id: "r-b", stage_id: "s-b" },
      },
      {
        id: "tool-b",
        traceId: "trace-b",
        sessionId: "session-b",
        startTime: "2026-08-05T11:40:02.000Z",
        endTime: "2026-08-05T11:40:03.000Z",
        type: "TOOL",
        name: "web.run",
        metadata: { tool_name: "web.run", operation_id: "op-b", goal_id: "g-b", run_id: "r-b", stage_id: "s-b" },
      },
    ],
  };

  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify(page), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const result = await collectHermesObservability("24h", {
    now: NOW,
    fetchImpl,
  });

  assert.equal(result.graftCohort.status, "observed");
  assert.equal(result.graftCohort.signalOperations, 1);
  assert.equal(result.graftCohort.graft.operationCount, 1);
  assert.equal(result.graftCohort.baseline.operationCount, 1);
  assert.equal(result.graftCohort.graft.totalTokens, 300);
  assert.equal(result.graftCohort.baseline.totalTokens, 150);
  assert.equal(result.graftCohort.delta.totalTokens, 150);
  assert.equal(result.graftCohort.graft.toolCalls, 1);
  assert.equal(result.graftCohort.baseline.toolCalls, 1);

  const opA = result.operations.find((operation) => operation.operationId === "op-a");
  const opB = result.operations.find((operation) => operation.operationId === "op-b");
  assert.equal(opA?.cohort, "graft");
  assert.equal(opB?.cohort, "baseline");
});
