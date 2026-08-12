import assert from "node:assert/strict";
import test from "node:test";
import { collectLangfuseEvaluationControl } from "../src/lib/langfuse-evaluation-control.ts";

const NOW = new Date("2026-08-05T12:00:00.000Z");

function setLangfuseEnv() {
  process.env.HERMES_LANGFUSE_BASE_URL = "https://langfuse.local";
  process.env.HERMES_LANGFUSE_PUBLIC_KEY = "pk-test";
  process.env.HERMES_LANGFUSE_SECRET_KEY = "sk-test";
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("collects paginated Scores API v3 values into typed safe aggregates", async () => {
  setLangfuseEnv();
  const seenUrls: URL[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    seenUrls.push(url);

    if (url.pathname === "/api/public/v3/scores" && !url.searchParams.has("cursor")) {
      return jsonResponse({
        data: [
          {
            id: "score-1",
            name: "tool_success_rate",
            source: "API",
            dataType: "NUMERIC",
            value: "0.8",
            subject: { kind: "TRACE", id: "trace-1" },
            timestamp: "2026-08-05T11:00:00.000Z",
            comment: "must not be returned",
            projectId: "proj_safe_123",
          },
          {
            id: "score-2",
            name: "trace_complete",
            source: "EVAL",
            dataType: "BOOLEAN",
            value: true,
            subject: { kind: "session", id: "session-1" },
            reasoning: "must not be returned",
          },
        ],
        meta: { cursor: "next" },
      });
    }

    if (url.pathname === "/api/public/v3/scores") {
      return jsonResponse({
        data: [
          {
            id: "score-3",
            name: "pipeline_health",
            source: "EVAL",
            dataType: "CATEGORICAL",
            value: "healthy",
            subject: { kind: "OBSERVATION", id: "obs-1" },
          },
          {
            id: "score-4",
            name: "judge_note",
            source: "ANNOTATION",
            dataType: "TEXT",
            value: "private judge note must not be returned",
            subject: { kind: "EXPERIMENT", id: "experiment-1" },
          },
        ],
      });
    }

    if (url.pathname === "/api/public/v2/prompts") return jsonResponse({ data: [] });
    return jsonResponse({ error: "unsupported" }, 404);
  };

  const result = await collectLangfuseEvaluationControl("24h", {
    now: NOW,
    fetchImpl,
  });

  const scoreUrls = seenUrls.filter((url) => url.pathname === "/api/public/v3/scores");
  assert.equal(scoreUrls.length, 2);
  assert.equal(scoreUrls[0].searchParams.get("limit"), "100");
  assert.equal(scoreUrls[0].searchParams.get("fields"), "subject");
  assert.equal(scoreUrls[0].searchParams.has("fromTimestamp"), true);
  assert.equal(scoreUrls[1].searchParams.get("cursor"), "next");
  assert.equal(result.scores.health.status, "ok");
  assert.equal(result.scores.data.totalScores, 4);
  assert.equal(result.scores.data.uniqueTargets, 4);
  assert.equal(result.scores.data.traceTargets, 1);
  assert.equal(result.scores.data.sessionTargets, 1);
  assert.equal(result.scores.data.observationTargets, 1);
  assert.equal(result.scores.data.experimentTargets, 1);
  assert.equal(result.scores.data.datasetRunTargets, 1);

  const numeric = result.scores.data.aggregates.find((score) => score.name === "tool_success_rate");
  assert.equal(numeric?.numeric?.avg, 0.8);
  assert.equal(numeric?.langfusePath, "/project/proj_safe_123/scores");

  const boolean = result.scores.data.aggregates.find((score) => score.name === "trace_complete");
  assert.equal(boolean?.boolean?.trueRate, 1);

  const categorical = result.scores.data.aggregates.find((score) => score.name === "pipeline_health");
  assert.deepEqual(categorical?.categorical, [{ value: "healthy", count: 1 }]);

  const text = result.scores.data.aggregates.find((score) => score.name === "judge_note");
  assert.equal(text?.textCount, 1);
  assert.equal(JSON.stringify(result).includes("must not be returned"), false);
  assert.equal(JSON.stringify(result).includes("private judge note"), false);
  assert.equal(JSON.stringify(result).includes("sk-test"), false);
});

test("counts score coverage from v3 subjects and ignores missing subjects", async () => {
  setLangfuseEnv();
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/public/v3/scores") {
      return jsonResponse({
        data: [
          { name: "quality", dataType: "NUMERIC", value: 0.8, subject: { kind: "TRACE", id: "trace-repeat" } },
          { name: "cost", dataType: "NUMERIC", value: 0.2, subject: { kind: "trace", id: "trace-repeat" } },
          { name: "session_quality", dataType: "BOOLEAN", value: "pass", subject: { kind: "SESSION", id: "session-1" } },
          { name: "latency", dataType: "NUMERIC", value: 1.2, subject: { kind: "OBSERVATION", id: "obs-1" } },
          { name: "experiment_score", dataType: "NUMERIC", value: 1, subject: { kind: "EXPERIMENT", id: "experiment-1" } },
          { name: "untargeted", dataType: "NUMERIC", value: 1 },
        ],
      });
    }
    if (url.pathname === "/api/public/v2/prompts") return jsonResponse({ data: [] });
    return jsonResponse({ data: [] }, 404);
  };

  const result = await collectLangfuseEvaluationControl("24h", { now: NOW, fetchImpl });

  assert.equal(result.scores.data.totalScores, 6);
  assert.equal(result.scores.data.uniqueTargets, 4);
  assert.equal(result.scores.data.traceTargets, 1);
  assert.equal(result.scores.data.sessionTargets, 1);
  assert.equal(result.scores.data.observationTargets, 1);
  assert.equal(result.scores.data.experimentTargets, 1);

  const quality = result.scores.data.aggregates.find((score) => score.name === "quality");
  assert.equal(quality?.targetCount, 1);
  const untargeted = result.scores.data.aggregates.find((score) => score.name === "untargeted");
  assert.equal(untargeted?.targetCount, 0);
});

test("preserves explicit legacy experiment fixtures without dataset-run targeting", async () => {
  setLangfuseEnv();
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/public/v3/scores") {
      return jsonResponse({
        data: [
          { name: "legacy_experiment", dataType: "NUMERIC", value: 1, experimentId: "experiment-legacy" },
          { name: "legacy_dataset_run", dataType: "NUMERIC", value: 1, datasetRunId: "dataset-run-legacy" },
        ],
      });
    }
    if (url.pathname === "/api/public/v2/prompts") return jsonResponse({ data: [] });
    return jsonResponse({ data: [] }, 404);
  };

  const result = await collectLangfuseEvaluationControl("24h", { now: NOW, fetchImpl });

  assert.equal(result.scores.data.uniqueTargets, 2);
  assert.equal(result.scores.data.experimentTargets, 2);
  assert.equal(result.scores.data.datasetRunTargets, 2);
});

test("collects Prompt API v2 family metadata without returning prompt bodies", async () => {
  setLangfuseEnv();
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/public/v3/scores") {
      return jsonResponse({
        data: [
          {
            name: "main-turn-quality",
            source: "API",
            dataType: "NUMERIC",
            value: 0.7,
          },
        ],
      });
    }
    if (url.pathname === "/api/public/v2/prompts") {
      return jsonResponse({
        prompts: [
          {
            name: "main.turn",
            type: "chat",
            labels: ["production", "candidate"],
            tags: ["agent", "control"],
            createdAt: "2026-08-01T00:00:00.000Z",
            lastUpdatedAt: "2026-08-05T10:00:00.000Z",
            prompt: "raw production prompt must not be returned",
            versions: [1, 2, 3],
            metadata: { family: "main" },
            projectId: "proj_safe_123",
          },
        ],
      });
    }
    return jsonResponse({ data: [] }, 404);
  };

  const result = await collectLangfuseEvaluationControl("7d", {
    now: NOW,
    fetchImpl,
  });

  assert.equal(result.prompts.health.status, "ok");
  assert.equal(result.prompts.data.families, 1);
  assert.equal(result.prompts.data.versions, 3);
  assert.equal(result.prompts.data.prompts.length, 3);
  assert.equal(result.prompts.data.prompts[0].name, "main.turn");
  assert.equal(result.prompts.data.prompts[0].family, "main");
  assert.equal(result.prompts.data.prompts[0].version, 1);
  assert.deepEqual(result.prompts.data.prompts[0].labels, ["production", "candidate"]);
  assert.deepEqual(result.prompts.data.prompts[0].tags, ["agent", "control"]);
  assert.equal(result.prompts.data.prompts[0].hash, null);
  assert.equal(result.prompts.data.prompts[0].updatedAt, "2026-08-05T10:00:00.000Z");
  assert.equal(result.prompts.data.prompts[0].langfusePath, "/project/proj_safe_123/prompts/main.turn");
  assert.equal(JSON.stringify(result).includes("raw production prompt"), false);
});

test("keeps supported prompt version detail only when version payload provides it", async () => {
  setLangfuseEnv();
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/public/v3/scores") return jsonResponse({ data: [] });
    if (url.pathname === "/api/public/v2/prompts") {
      return jsonResponse({
        data: [
          {
            name: "main.detail",
            type: "text",
            labels: ["family-label"],
            versions: [
              {
                version: 4,
                labels: ["version-label"],
                tags: ["version-tag"],
                updatedAt: "2026-08-04T10:00:00.000Z",
                metadata: { hash: "abc123def456" },
                prompt: "version body must not leak",
              },
            ],
          },
        ],
      });
    }
    return jsonResponse({ data: [] }, 404);
  };

  const result = await collectLangfuseEvaluationControl("7d", { now: NOW, fetchImpl });

  assert.equal(result.prompts.data.versions, 1);
  assert.equal(result.prompts.data.prompts[0].version, 4);
  assert.equal(result.prompts.data.prompts[0].hash, "abc123def456");
  assert.deepEqual(result.prompts.data.prompts[0].labels, ["family-label", "version-label"]);
  assert.deepEqual(result.prompts.data.prompts[0].tags, ["version-tag"]);
  assert.equal(JSON.stringify(result).includes("version body"), false);
});

test("isolates unsupported evaluator/dataset/experiment APIs as unavailable", async () => {
  setLangfuseEnv();
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/public/v3/scores") return jsonResponse({ data: [] });
    if (url.pathname === "/api/public/v2/prompts") return jsonResponse({ data: [] });
    return jsonResponse({ error: "not found" }, 404);
  };

  const result = await collectLangfuseEvaluationControl("24h", {
    now: NOW,
    fetchImpl,
  });

  assert.equal(result.scores.health.status, "ok");
  assert.equal(result.prompts.health.status, "ok");
  assert.equal(result.evaluators.health.status, "unavailable");
  assert.equal(result.datasets.health.status, "unavailable");
  assert.equal(result.experiments.health.status, "unavailable");
  assert.deepEqual(result.evaluators.data, []);
});

test("keeps score and prompt data when one optional resource fails malformed", async () => {
  setLangfuseEnv();
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/public/v3/scores") return jsonResponse({ data: [{ name: "ok", dataType: "BOOLEAN", value: false }] });
    if (url.pathname === "/api/public/v2/prompts") return jsonResponse({ data: [{ name: "safe.prompt", version: 1 }] });
    if (url.pathname === "/api/public/datasets") return jsonResponse({ nope: true });
    return jsonResponse({ data: [] }, 404);
  };

  const result = await collectLangfuseEvaluationControl("24h", {
    now: NOW,
    fetchImpl,
  });

  assert.equal(result.scores.data.totalScores, 1);
  assert.equal(result.prompts.data.prompts.length, 1);
  assert.equal(result.datasets.health.status, "error");
  assert.equal(result.datasets.health.message, "Langfuse returned an unexpected payload shape.");
});

test("applies timeout and pagination caps without leaking credentials", async () => {
  setLangfuseEnv();
  const timedOutFetch: typeof fetch = async (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    });

  const timedOut = await collectLangfuseEvaluationControl("24h", {
    now: NOW,
    fetchImpl: timedOutFetch,
    timeoutMs: 1,
  });
  assert.equal(timedOut.scores.health.message, "Langfuse request timed out.");
  assert.equal(JSON.stringify(timedOut).includes("pk-test"), false);

  const cappedFetch: typeof fetch = async () =>
    jsonResponse({
      data: [{ name: "score", dataType: "NUMERIC", value: 1 }],
      meta: { cursor: "again" },
    });

  const capped = await collectLangfuseEvaluationControl("24h", {
    now: NOW,
    fetchImpl: cappedFetch,
    maxPages: 1,
    maxRows: 1,
  });
  assert.equal(capped.scores.health.truncated, true);
  assert.equal(capped.scores.health.pages, 1);
});
