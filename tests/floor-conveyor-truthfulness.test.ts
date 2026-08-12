import assert from "node:assert/strict";
import test from "node:test";

/**
 * Tests for stale trace classification and self-heal logic.
 * Ensures that stale traces are not treated as active in reliability/self-heal logic.
 */

interface TraceRun {
  id: string;
  startTime: number;
  status: "running" | "completed" | "failed";
  liveController?: boolean;
}

function classifyTraceAsStale(run: TraceRun, now: number): boolean {
  const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
  const ageMs = now - run.startTime;
  return ageMs > STALE_THRESHOLD_MS;
}

function isTraceRunning(run: TraceRun, isStale: boolean): boolean {
  if (isStale) return false;
  return run.status === "running";
}

test("Stale traces are correctly identified based on age", () => {
  const now = Date.now();
  const recentRun: TraceRun = {
    id: "recent",
    startTime: now - 5 * 60 * 1000, // 5 minutes ago
    status: "running",
  };
  const oldRun: TraceRun = {
    id: "old",
    startTime: now - 45 * 60 * 1000, // 45 minutes ago
    status: "running",
  };

  assert(!classifyTraceAsStale(recentRun, now), "Recent run should not be stale");
  assert(classifyTraceAsStale(oldRun, now), "Old run should be stale");
});

test("Stale traces are not counted as running for self-heal logic", () => {
  const now = Date.now();
  const staleRun: TraceRun = {
    id: "stale-but-marked-running",
    startTime: now - 45 * 60 * 1000, // 45 minutes ago
    status: "running",
  };

  const isStale = classifyTraceAsStale(staleRun, now);
  const running = isTraceRunning(staleRun, isStale);

  assert(isStale, "Trace should be classified as stale");
  assert(!running, "Stale trace should not be counted as running for self-heal");
});

test("Recent running traces are counted as active", () => {
  const now = Date.now();
  const activeRun: TraceRun = {
    id: "active",
    startTime: now - 10 * 60 * 1000, // 10 minutes ago
    status: "running",
  };

  const isStale = classifyTraceAsStale(activeRun, now);
  const running = isTraceRunning(activeRun, isStale);

  assert(!isStale, "Recent trace should not be stale");
  assert(running, "Recent running trace should be active");
});

test("Completed traces are not counted as running regardless of age", () => {
  const now = Date.now();
  const completedRecent: TraceRun = {
    id: "completed-recent",
    startTime: now - 5 * 60 * 1000, // 5 minutes ago
    status: "completed",
  };
  const completedOld: TraceRun = {
    id: "completed-old",
    startTime: now - 45 * 60 * 1000, // 45 minutes ago
    status: "completed",
  };

  const running1 = isTraceRunning(completedRecent, false);
  const running2 = isTraceRunning(completedOld, true);

  assert(!running1, "Completed recent trace should not be running");
  assert(!running2, "Completed old trace should not be running");
});

test("Failed traces are not counted as running", () => {
  const now = Date.now();
  const failedRun: TraceRun = {
    id: "failed",
    startTime: now - 10 * 60 * 1000,
    status: "failed",
  };

  const isStale = classifyTraceAsStale(failedRun, now);
  const running = isTraceRunning(failedRun, isStale);

  assert(!running, "Failed trace should not be running");
});

test("Live controller count excludes stale instances", () => {
  const now = Date.now();
  const runs: Array<TraceRun & { liveController?: boolean }> = [
    {
      id: "live-1",
      startTime: now - 5 * 60 * 1000, // 5 minutes ago - ACTIVE
      status: "running",
      liveController: true,
    },
    {
      id: "live-2",
      startTime: now - 10 * 60 * 1000, // 10 minutes ago - ACTIVE
      status: "running",
      liveController: true,
    },
    {
      id: "ghost-live",
      startTime: now - 50 * 60 * 1000, // 50 minutes ago - STALE
      status: "running",
      liveController: true,
    },
  ];

  const liveCount = runs.filter(
    (r) => r.liveController === true && !classifyTraceAsStale(r, now)
  ).length;

  assert.equal(liveCount, 2, "Should count 2 live controllers (excluding stale)");
});

test("Ghost trace count tracks only stale runs", () => {
  const now = Date.now();
  const runs: TraceRun[] = [
    {
      id: "recent-1",
      startTime: now - 5 * 60 * 1000,
      status: "running",
    },
    {
      id: "old-1",
      startTime: now - 45 * 60 * 1000,
      status: "running",
    },
    {
      id: "old-2",
      startTime: now - 60 * 60 * 1000,
      status: "running",
    },
    {
      id: "recent-2",
      startTime: now - 15 * 60 * 1000,
      status: "running",
    },
  ];

  const ghostCount = runs.filter((r) => classifyTraceAsStale(r, now)).length;
  assert.equal(ghostCount, 2, "Should identify 2 ghost (stale) traces");
});

test("Stale threshold is consistently applied", () => {
  const now = Date.now();
  const STALE_THRESHOLD_MS = 30 * 60 * 1000;

  // Exactly at threshold boundary
  const atThreshold: TraceRun = {
    id: "at-boundary",
    startTime: now - STALE_THRESHOLD_MS,
    status: "running",
  };

  // Just before threshold
  const beforeThreshold: TraceRun = {
    id: "before-boundary",
    startTime: now - STALE_THRESHOLD_MS + 1000,
    status: "running",
  };

  // Just after threshold
  const afterThreshold: TraceRun = {
    id: "after-boundary",
    startTime: now - STALE_THRESHOLD_MS - 1000,
    status: "running",
  };

  // At the boundary, > comparison should be false (not stale)
  assert(!classifyTraceAsStale(atThreshold, now), "At threshold should not be stale (boundary case)");
  assert(!classifyTraceAsStale(beforeThreshold, now), "Just before threshold should not be stale");
  assert(classifyTraceAsStale(afterThreshold, now), "Just after threshold should be stale");
});

test("Summary metrics are calculated correctly", () => {
  const now = Date.now();
  const runs: Array<TraceRun & { liveController?: boolean }> = [
    {
      id: "run-1",
      startTime: now - 5 * 60 * 1000,
      status: "running",
      liveController: true,
    },
    {
      id: "run-2",
      startTime: now - 45 * 60 * 1000,
      status: "running",
      liveController: true,
    },
    {
      id: "run-3",
      startTime: now - 10 * 60 * 1000,
      status: "completed",
      liveController: false,
    },
  ];

  const enriched = runs.map((r) => ({
    ...r,
    isStale: classifyTraceAsStale(r, now),
    traceRunning: isTraceRunning(r, classifyTraceAsStale(r, now)),
  }));

  const total = enriched.length;
  const liveController = enriched.filter((r) => r.liveController === true && !r.isStale).length;
  const ghost = enriched.filter((r) => r.isStale).length;
  const traceRunning = enriched.filter((r) => r.traceRunning).length;

  assert.equal(total, 3, "Total should be 3");
  assert.equal(liveController, 1, "Live controller should be 1 (run-1 is recent and marked)");
  assert.equal(ghost, 1, "Ghost should be 1 (run-2 is stale)");
  assert.equal(traceRunning, 1, "Trace running should be 1 (only run-1)");
});
