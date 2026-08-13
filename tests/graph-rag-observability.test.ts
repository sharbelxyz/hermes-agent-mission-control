import assert from "node:assert/strict";
import test from "node:test";
import { buildGraphRagObservability } from "../src/lib/graph-rag-observability";

const NOW = new Date("2026-08-10T00:00:00.000Z");

test("returns error when payload is missing", () => {
  const result = buildGraphRagObservability(null, NOW);
  assert.equal(result.status, "error");
  assert.equal(result.indexCount, 0);
  assert.equal(result.graphCount, 0);
});

test("returns warning for partial coverage", () => {
  const result = buildGraphRagObservability(
    {
      syncedAt: "2026-08-09T23:59:40.000Z",
      index: [{ goal: "g1" }, { goal: "g2" }, { goal: "g3" }, { goal: "g4" }, { goal: "g5" }],
      graphs: { g1: {}, g2: {}, g3: {} },
    },
    NOW,
  );
  assert.equal(result.status, "warning");
  assert.equal(result.coveragePct, 60);
  assert.equal(result.missingGraphs, 2);
  assert.equal(result.stale, false);
});

test("returns ok for fresh high coverage", () => {
  const result = buildGraphRagObservability(
    {
      syncedAt: "2026-08-09T23:59:50.000Z",
      index: [{ goal: "g1" }, { goal: "g2" }, { goal: "g3" }, { goal: "g4" }],
      graphs: { g1: {}, g2: {}, g3: {}, g4: {} },
    },
    NOW,
  );
  assert.equal(result.status, "ok");
  assert.equal(result.coveragePct, 100);
  assert.equal(result.missingGraphs, 0);
});
