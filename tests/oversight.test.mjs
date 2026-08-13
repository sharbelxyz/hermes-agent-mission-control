import assert from "node:assert/strict";
import test from "node:test";
import { computeOversight } from "../hermes-bridge/lib/oversight.mjs";

const ts = (iso) => Date.parse(iso) / 1000;

test("computes oversight ladder, win-rate, time, failures, and prefixes", () => {
  const rows = [
    {
      ts: ts("2026-07-20T10:00:00.000Z"),
      goal_id: "g_260720_api_alpha",
      rung: 0,
      attempt: 0,
      model: "ollama/qwen",
      failure_kind: "",
      outcome: "done",
      wall_s: 600,
      diff_files: 1,
      notes: "",
    },
    {
      ts: ts("2026-07-21T10:00:00.000Z"),
      goal_id: "g_260721_ui_beta",
      rung: 0,
      attempt: 0,
      model: "ollama/qwen",
      failure_kind: "no_diff",
      outcome: "fail",
      wall_s: 120,
      diff_files: 2,
      notes: "",
    },
    {
      ts: ts("2026-07-21T10:10:00.000Z"),
      goal_id: "g_260721_ui_beta",
      rung: 1,
      attempt: 1,
      model: "anthropic/claude-sonnet",
      failure_kind: "",
      outcome: "pass",
      wall_s: 1800,
      diff_files: 3,
      notes: "",
    },
    {
      ts: ts("2026-07-22T10:00:00.000Z"),
      goal_id: "g_260722_ops_gamma",
      rung: 0,
      attempt: 0,
      model: "local-coder",
      failure_kind: "stall",
      outcome: "timeout",
      wall_s: 90,
      diff_files: 0,
      notes: "",
    },
    {
      ts: ts("2026-07-22T10:15:00.000Z"),
      goal_id: "g_260722_ops_gamma",
      rung: 0,
      attempt: 1,
      model: "local-coder",
      failure_kind: "gate_fail",
      outcome: "fail",
      wall_s: 110,
      diff_files: 0,
      notes: "",
    },
    {
      ts: ts("2026-07-22T10:30:00.000Z"),
      goal_id: "g_260722_ops_gamma",
      rung: 0,
      attempt: 2,
      model: "local-coder",
      failure_kind: "",
      outcome: "win",
      wall_s: 3600,
      diff_files: 7,
      notes: "",
    },
    {
      ts: ts("2026-07-23T10:00:00.000Z"),
      goal_id: "g_260723_api_delta",
      rung: 0,
      attempt: 0,
      model: "openai/gpt-5",
      failure_kind: "crash",
      outcome: "crash",
      wall_s: 60,
      diff_files: 4,
      notes: "",
    },
    {
      ts: ts("2026-07-24T10:00:00.000Z"),
      goal_id: "g_260724_api_epsilon",
      rung: 2,
      attempt: 0,
      model: "ollama/qwen3-coder",
      failure_kind: "",
      outcome: "done",
      wall_s: 1200,
      diff_files: 2,
      notes: "",
    },
  ];

  const result = computeOversight([...rows].sort((a, b) => b.ts - a.ts), new Date("2026-08-06T00:00:00.000Z"));

  assert.deepEqual(result.totals, { goals: 5, runs: 8, wins: 4 });
  assert.deepEqual(result.successLadder, {
    firstTry: 2,
    secondAttempt: 1,
    thirdPlus: 1,
    cloudAssisted: 2,
    neverWon: 1,
  });

  assert.deepEqual(
    result.modelWinRate.map((row) => [row.model, row.wins, row.total, row.pct]),
    [
      ["local-coder", 1, 3, 33.3],
      ["ollama", 2, 3, 66.7],
      ["anthropic", 1, 1, 100],
      ["openai", 0, 1, 0],
    ],
  );

  assert.deepEqual(result.time, { medianMin: 25, p90Min: 51, maxMin: 60 });
  assert.deepEqual(result.difficulty, [
    { bucket: "1 file", n: 1, medianMin: 10 },
    { bucket: "2-3", n: 2, medianMin: 25 },
    { bucket: "4-6", n: 0, medianMin: 0 },
    { bucket: "7+", n: 1, medianMin: 60 },
  ]);

  assert.deepEqual(result.failureMix, [
    { kind: "crash", count: 1 },
    { kind: "gate_fail", count: 1 },
    { kind: "no_diff", count: 1 },
    { kind: "stall", count: 1 },
  ]);

  assert.equal(result.weekly.length, 1);
  assert.deepEqual(result.weekly[0], {
    week: "2026-W30",
    goals: 5,
    firstTryPct: 40,
    localWinPct: 50,
    cloudSharePct: 25,
  });

  assert.deepEqual(result.strengths, [
    { prefix: "api", goals: 3, firstTryPct: 66.7 },
    { prefix: "ops", goals: 1, firstTryPct: 0 },
    { prefix: "ui", goals: 1, firstTryPct: 0 },
  ]);
});

test("caps emitted oversight lists", () => {
  const rows = [];
  for (let index = 0; index < 30; index += 1) {
    rows.push({
      ts: ts(`2026-01-${String((index % 28) + 1).padStart(2, "0")}T10:00:00.000Z`) + index,
      goal_id: `g_260101_p${String(index).padStart(2, "0")}_goal`,
      rung: 0,
      attempt: 0,
      model: `local-model-${String(index).padStart(2, "0")}`,
      failure_kind: "",
      outcome: index % 2 === 0 ? "done" : "fail",
      wall_s: 60,
      diff_files: 1,
      notes: "",
    });
  }

  const result = computeOversight([...rows].sort((a, b) => b.ts - a.ts), new Date("2026-08-06T00:00:00.000Z"));

  assert.equal(result.modelWinRate.length, 20);
  assert.equal(result.strengths.length, 10);
  assert.ok(result.weekly.length <= 12);
});
