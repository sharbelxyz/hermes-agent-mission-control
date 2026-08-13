import assert from "node:assert/strict";
import test from "node:test";
import { getConveyorFloorView } from "../src/app/floor/page.tsx";

function conveyor(overrides: Record<string, unknown> = {}) {
  return {
    conveyorOn: false,
    controllerPids: [],
    liveGoals: [],
    active: [],
    upNext: [],
    planRequired: [],
    blocked: [],
    counts: {},
    focusPrefixes: [],
    message: "",
    boxes: [],
    statusAgeSec: 12,
    statusMissing: false,
    syncedAt: "2026-08-08T00:00:00.000Z",
    ...overrides,
  };
}

test("floor conveyor view shows loading labels before the first conveyor response", () => {
  const view = getConveyorFloorView(null);

  assert.equal(view.mode, "loading");
  assert.equal(view.headerConveyorLabel, "Syncing conveyor");
  assert.equal(view.headerCountLabel, "checking active goal");
  assert.equal(view.headerStatusLabel, "syncing status");
  assert.deepEqual(view.buildingNow, []);
});

test("floor conveyor view preserves live controller labels and Building now entries", () => {
  const liveGoal = { goalId: "g_live", live: true, status: "running", rung: 1, attempts: 2, pr: null };
  const view = getConveyorFloorView(conveyor({ conveyorOn: true, active: [liveGoal] }));

  assert.equal(view.mode, "live");
  assert.equal(view.headerConveyorLabel, "Conveyor ON");
  assert.equal(view.headerCountLabel, "1 building now");
  assert.deepEqual(view.buildingNow.map((entry) => entry.goalId), ["g_live"]);
});

test("floor conveyor view treats non-live running active goals as recovering work", () => {
  const recoveringGoal = { goalId: "g_recovering", live: false, status: "running", rung: 0, attempts: 3, pr: null };
  const stagedGoal = { goalId: "g_staged", live: false, status: "staged", rung: 0, attempts: 1, pr: null };
  const view = getConveyorFloorView(conveyor({
    conveyorOn: false,
    active: [recoveringGoal, stagedGoal],
    message: "status-only refresh (no dispatch)",
  }));

  assert.equal(view.mode, "recovering");
  assert.equal(view.headerConveyorLabel, "Conveyor recovering");
  assert.equal(view.headerCountLabel, "1 recovering");
  assert.deepEqual(view.recoveringActive.map((entry) => entry.goalId), ["g_recovering"]);
  assert.deepEqual(view.buildingNow.map((entry) => entry.goalId), ["g_recovering"]);
});

test("floor conveyor view still renders a genuinely off conveyor as off and idle", () => {
  const view = getConveyorFloorView(conveyor({ conveyorOn: false, active: [] }));

  assert.equal(view.mode, "off");
  assert.equal(view.headerConveyorLabel, "Conveyor OFF");
  assert.equal(view.headerCountLabel, "idle");
  assert.deepEqual(view.buildingNow, []);
});
