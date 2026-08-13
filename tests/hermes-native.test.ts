import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readHermesNativeSnapshot } from "../src/lib/hermes-native.ts";
import { isHermesBridgeMirrorStale } from "../src/lib/hermes-native-mirror.ts";

async function makeRoots() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-native-"));
  const mission = path.join(root, "mission-control");
  const profiles = path.join(root, "profiles");
  await fs.mkdir(path.join(mission, "runtime/goals/ready"), { recursive: true });
  await fs.mkdir(path.join(mission, "runtime/goals/running"), { recursive: true });
  await fs.mkdir(path.join(mission, "runtime/goals/done"), { recursive: true });
  await fs.mkdir(path.join(mission, "runtime/goals/failed"), { recursive: true });
  await fs.mkdir(path.join(mission, "archive/goals"), { recursive: true });
  await fs.mkdir(profiles, { recursive: true });
  return { root, mission, profiles };
}

async function writeJson(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2));
}

async function seedRoster(mission: string, profiles: string) {
  await writeJson(path.join(mission, "agent-roster.json"), {
    policy: {
      primary_cloud_orchestrator: "default",
      always_on_workers: false,
      model_loads_permitted_by_roster: false,
      langfuse_mode: "metadata-only; content disabled",
    },
    profiles: [
      {
        profile: "explorer",
        role: "Read-only repository explorer.",
        model_class: "local",
        model: "qwen3-coder-next",
        provider: "coder",
        capabilities: ["repository search"],
        forbidden_actions: ["file edits", "secret disclosure"],
        cloud_orchestrator_call_when: "Use for orientation.",
        status_note: "on-demand specialist",
      },
    ],
  });
  await fs.mkdir(path.join(profiles, "explorer"), { recursive: true });
  await fs.writeFile(
    path.join(profiles, "explorer/config.yaml"),
    [
      "model:",
      "  default: qwen3-coder-next",
      "  provider: coder",
      "  api_key: SECRET_SHOULD_NOT_RETURN",
      "  context_length: 262144",
      "compression:",
      "  enabled: true",
      "  threshold: 0.5",
      "  target_ratio: 0.25",
      "",
    ].join("\n"),
  );
}

test("parses roster and profile hints without returning secrets", async () => {
  const { root, mission, profiles } = await makeRoots();
  try {
    await seedRoster(mission, profiles);
    await writeJson(path.join(mission, "operator-tasks.json"), { tasks: [] });
    await writeJson(path.join(mission, "archive/goals/import-manifest.json"), {
      counts: { done: 0, failed: 0, total: 0 },
      artifact_counts: { done: 0, failed: 0, total: 0 },
      files: [],
      artifacts: [],
    });

    const snapshot = await readHermesNativeSnapshot({ missionControlRoot: mission, profilesRoot: profiles });
    assert.equal(snapshot.agents.some((agent) => agent.profile === "default"), false);
    const explorer = snapshot.agents.find((agent) => agent.profile === "explorer");
    assert.equal(explorer?.status, "on-demand");
    assert.equal(explorer?.contextLength, 262144);
    assert.equal(explorer?.compressionPolicy, "enabled=true threshold=0.5 target=0.25");
    assert.deepEqual(snapshot.agents.map((agent) => agent.profile), ["explorer"]);
    assert.equal(JSON.stringify(snapshot).includes("SECRET_SHOULD_NOT_RETURN"), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("loads operator tasks, live goal metadata, and archive manifest counts", async () => {
  const { root, mission, profiles } = await makeRoots();
  try {
    await seedRoster(mission, profiles);
    await writeJson(path.join(mission, "operator-tasks.json"), {
      updated_at: "2026-08-05T00:00:00+10:00",
      tasks: [
        { id: "import-native", title: "import native goals/tasks", status: "in_progress", priority: "high" },
        { id: "deploy", title: "deploy mission-control.reliabletradies.app", status: "pending", priority: "medium" },
      ],
    });
    await fs.writeFile(
      path.join(mission, "runtime/goals/running/current.md"),
      [
        "---",
        "status: running",
        "updated_at: 2026-08-05T10:00:00+10:00",
        "evidence:",
        "  - tests queued",
        "---",
        "# Wire native Mission Control",
        "Body should not be needed by callers.",
      ].join("\n"),
    );
    await writeJson(path.join(mission, "archive/goals/import-manifest.json"), {
      counts: { done: 1, failed: 1, total: 2 },
      artifact_counts: { done: 1, failed: 0, total: 1 },
      files: [
        { kind: "goal", status: "done", name: "alpha.md", path: "done/alpha.md", bytes: 10, sha256: "a".repeat(64) },
        { kind: "goal", status: "failed", name: "beta.md", path: "failed/beta.md", bytes: 20, sha256: "b".repeat(64) },
      ],
      artifacts: [
        { kind: "artifact", status: "done", name: "autopsy.md", path: "done/alpha/autopsy.md", goal: "alpha", bytes: 30, sha256: "c".repeat(64) },
      ],
    });

    const snapshot = await readHermesNativeSnapshot({ missionControlRoot: mission, profilesRoot: profiles });
    assert.equal(snapshot.operatorTasks.tasks.length, 2);
    assert.equal(snapshot.operatorTasks.counts.in_progress, 1);
    assert.equal(snapshot.goals.current?.title, "Wire native Mission Control");
    assert.deepEqual(snapshot.goals.current?.evidence, ["tests queued"]);
    assert.deepEqual(snapshot.archive.counts, { done: 1, failed: 1, total: 2 });
    assert.deepEqual(snapshot.archive.artifact_counts, { done: 1, failed: 0, total: 1 });
    assert.equal(snapshot.archive.recent[0].sha256, "b".repeat(64));
    assert.equal(snapshot.archive.recentArtifacts[0].path, "done/alpha/autopsy.md");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("does not count nested archive artifacts as goals in legacy manifests", async () => {
  const { root, mission, profiles } = await makeRoots();
  try {
    await seedRoster(mission, profiles);
    await writeJson(path.join(mission, "operator-tasks.json"), { tasks: [] });
    await writeJson(path.join(mission, "archive/goals/import-manifest.json"), {
      counts: { done: 2, failed: 2, total: 4 },
      files: [
        { status: "done", name: "alpha.md", bytes: 10, sha256: "a".repeat(64) },
        { status: "done", name: "alpha/autopsy.md", bytes: 11, sha256: "b".repeat(64) },
        { status: "failed", name: "beta.md", bytes: 12, sha256: "c".repeat(64) },
        { status: "failed", name: "beta/evidence.md", bytes: 13, sha256: "d".repeat(64) },
      ],
    });

    const snapshot = await readHermesNativeSnapshot({ missionControlRoot: mission, profilesRoot: profiles });
    assert.deepEqual(snapshot.archive.counts, { done: 1, failed: 1, total: 2 });
    assert.deepEqual(snapshot.archive.artifact_counts, { done: 1, failed: 1, total: 2 });
    assert.equal(snapshot.archive.recent.length, 2);
    assert.equal(snapshot.archive.recent.some((goal) => goal.title.includes("autopsy")), false);
    assert.deepEqual(
      snapshot.archive.recentArtifacts.map((artifact) => artifact.path).sort(),
      ["done/alpha/autopsy.md", "failed/beta/evidence.md"],
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("rejects symlink and oversized live goal files", async () => {
  const { root, mission, profiles } = await makeRoots();
  try {
    await seedRoster(mission, profiles);
    await writeJson(path.join(mission, "operator-tasks.json"), { tasks: [] });
    await writeJson(path.join(mission, "archive/goals/import-manifest.json"), {
      counts: { done: 0, failed: 0, total: 0 },
      artifact_counts: { done: 0, failed: 0, total: 0 },
      files: [],
      artifacts: [],
    });
    await fs.writeFile(path.join(root, "outside.md"), "# outside");
    await fs.symlink(path.join(root, "outside.md"), path.join(mission, "runtime/goals/ready/link.md"));
    await fs.writeFile(path.join(mission, "runtime/goals/ready/too-big.md"), "x".repeat(70 * 1024));

    const snapshot = await readHermesNativeSnapshot({ missionControlRoot: mission, profilesRoot: profiles });
    assert.equal(snapshot.goals.counts.ready, 0);
    assert.equal(snapshot.source.status, "warning");
    assert.equal(snapshot.source.warnings.some((warning) => warning.includes("symlink rejected")), true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("returns empty states when native files are valid but empty", async () => {
  const { root, mission, profiles } = await makeRoots();
  try {
    await writeJson(path.join(mission, "agent-roster.json"), {
      policy: { primary_cloud_orchestrator: "default" },
      profiles: [],
    });
    await writeJson(path.join(mission, "operator-tasks.json"), { tasks: [] });
    await writeJson(path.join(mission, "archive/goals/import-manifest.json"), {
      counts: { done: 0, failed: 0, total: 0 },
      artifact_counts: { done: 0, failed: 0, total: 0 },
      files: [],
      artifacts: [],
    });

    const snapshot = await readHermesNativeSnapshot({ missionControlRoot: mission, profilesRoot: profiles });
    assert.equal(snapshot.agents.length, 0);
    assert.equal(snapshot.source.status, "warning");
    assert.equal(snapshot.source.warnings.some((warning) => warning.includes("no configured profiles")), true);
    assert.equal(snapshot.operatorTasks.tasks.length, 0);
    assert.equal(snapshot.goals.current, null);
    assert.equal(snapshot.archive.counts.total, 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("missing roster is an explicit source error with no fabricated agents", async () => {
  const { root, mission, profiles } = await makeRoots();
  try {
    await writeJson(path.join(mission, "operator-tasks.json"), { tasks: [] });
    await writeJson(path.join(mission, "archive/goals/import-manifest.json"), {
      counts: { done: 0, failed: 0, total: 0 },
      artifact_counts: { done: 0, failed: 0, total: 0 },
      files: [],
      artifacts: [],
    });

    const snapshot = await readHermesNativeSnapshot({ missionControlRoot: mission, profilesRoot: profiles });
    assert.equal(snapshot.source.status, "error");
    assert.equal(snapshot.source.errors.some((error) => error.includes("agent-roster.json")), true);
    assert.equal(snapshot.agents.length, 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("invalid roster is an explicit source error with no fabricated agents", async () => {
  const { root, mission, profiles } = await makeRoots();
  try {
    await fs.writeFile(path.join(mission, "agent-roster.json"), "{not-json");
    await writeJson(path.join(mission, "operator-tasks.json"), { tasks: [] });
    await writeJson(path.join(mission, "archive/goals/import-manifest.json"), {
      counts: { done: 0, failed: 0, total: 0 },
      artifact_counts: { done: 0, failed: 0, total: 0 },
      files: [],
      artifacts: [],
    });

    const snapshot = await readHermesNativeSnapshot({ missionControlRoot: mission, profilesRoot: profiles });
    assert.equal(snapshot.source.status, "error");
    assert.equal(snapshot.source.errors.some((error) => error.includes("invalid JSON")), true);
    assert.equal(snapshot.agents.length, 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("bridge mirror staleness is explicit", () => {
  const now = Date.parse("2026-08-05T00:02:00.000Z");
  assert.equal(isHermesBridgeMirrorStale("2026-08-05T00:01:00.000Z", now), false);
  assert.equal(isHermesBridgeMirrorStale("2026-08-05T00:00:00.000Z", now), true);
  assert.equal(isHermesBridgeMirrorStale("not-a-date", now), true);
});
