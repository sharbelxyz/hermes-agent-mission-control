import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { listRuns, parseRunTrace, toDisplayPath, scrubTextPaths } from "../hermes-bridge/lib/parse-runs.mjs";
import {
  buildNativeSnapshotRequest,
  buildMirrorEnvelope,
  fetchNativeSnapshot,
  hermesChat,
  liveControllerGoals,
  parseLiveControllerGoals,
  requestKindsForPolicy,
  unsupportedRequestFailures,
  validateBridgeConfig,
  validateSnapshot,
} from "../hermes-bridge/bridge.mjs";

function sampleSnapshot() {
  const now = new Date().toISOString();
  return {
    source: {
      mode: "local-native",
      status: "ok",
      message: "Native Hermes truth loaded",
      roots: { missionControl: "/fixed", profiles: "/profiles", runtime: "/fixed/runtime", archive: "/fixed/archive/goals" },
      warnings: [],
      errors: [],
      checkedAt: now,
      lastSeen: now,
      stale: false,
    },
    policy: {
      primaryCloudOrchestrator: "default",
      alwaysOnWorkers: false,
      modelLoadsPermittedByRoster: false,
      langfuseMode: "metadata-only",
      runtimeNote: "Only roster-declared running profiles are shown as running.",
    },
    agents: [],
    operatorTasks: { updatedAt: null, tasks: [], counts: {} },
    goals: { live: { ready: [], running: [], done: [], failed: [] }, counts: { ready: 0, running: 0, done: 0, failed: 0 }, current: null, recentFailed: [] },
    archive: { root: "/fixed/archive/goals", counts: { done: 0, failed: 0, total: 0 }, artifact_counts: { done: 0, failed: 0, total: 0 }, manifestSha256: null, recent: [], recentArtifacts: [] },
  };
}

test("chat dispatch sends prompt on stdin, not argv or env", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-bridge-"));
  try {
    const capture = path.join(root, "capture.json");
    const bin = path.join(root, "fake-hermes.mjs");
    await fs.writeFile(bin, [
      "#!/usr/bin/env node",
      "import fs from 'node:fs';",
      "let stdin = '';",
      "process.stdin.setEncoding('utf8');",
      "process.stdin.on('data', chunk => { stdin += chunk; });",
      `process.stdin.on('end', () => { fs.writeFileSync(${JSON.stringify(capture)}, JSON.stringify({ argv: process.argv.slice(2), env: process.env, stdin })); console.log('ok'); });`,
      "",
    ].join("\n"), { mode: 0o700 });

    const prompt = "super sensitive mission prompt";
    const result = await hermesChat(prompt, {
      hermesBin: bin,
      runTimeoutMs: 5000,
      maxResultChars: 1000,
    });
    const captured = JSON.parse(await fs.readFile(capture, "utf8"));

    assert.equal(result, "ok");
    assert.equal(captured.stdin, prompt);
    assert.equal(captured.argv.includes(prompt), false);
    assert.equal(JSON.stringify(captured.env).includes(prompt), false);
    assert.deepEqual(captured.argv, ["--profile", "default", "chat", "--query-file", "-", "--source", "mission-control-bridge"]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("chat dispatch errors do not include echoed prompt", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-bridge-"));
  try {
    const bin = path.join(root, "fake-hermes-fail.mjs");
    await fs.writeFile(bin, [
      "#!/usr/bin/env node",
      "let stdin = '';",
      "process.stdin.setEncoding('utf8');",
      "process.stdin.on('data', chunk => { stdin += chunk; });",
      "process.stdin.on('end', () => { console.error(stdin); process.exit(12); });",
      "",
    ].join("\n"), { mode: 0o700 });

    const prompt = "prompt must not appear in error";
    await assert.rejects(
      () => hermesChat(prompt, { hermesBin: bin, runTimeoutMs: 5000, maxResultChars: 1000 }),
      (error) => error instanceof Error && !error.message.includes(prompt) && /Hermes exited 12/.test(error.message),
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("mirror envelope schema is strict and sanitized", () => {
  const snapshot = validateSnapshot(sampleSnapshot());
  const envelope = buildMirrorEnvelope(snapshot, { db: true, hermesCli: true, nativeSnapshot: true, detail: "ready" });

  assert.equal(envelope.schemaVersion, 1);
  assert.equal(envelope.source, "bridge-mirror");
  assert.equal(envelope.heartbeat.db, true);
  assert.equal(envelope.heartbeat.hermesCli, true);
  assert.equal(envelope.heartbeat.nativeSnapshot, true);
  assert.equal(envelope.snapshot.source.status, "ok");
});

test("native snapshot fetch sends internal secret only to configured localhost URL", async () => {
  const secret = "bridge-secret-0123456789";
  let captured = null;
  const server = http.createServer((req, res) => {
    captured = { url: req.url, headers: req.headers };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(sampleSnapshot()));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    const snapshot = await fetchNativeSnapshot({
      nativeSnapshotUrl: `http://127.0.0.1:${port}/api/hermes/native`,
      nativeInternalSecret: secret,
      fetchTimeoutMs: 5000,
    });

    assert.equal(snapshot.source.status, "ok");
    assert.equal(captured.url, "/api/hermes/native");
    assert.equal(captured.headers["x-internal-secret"], secret);
    assert.equal(captured.headers.authorization, undefined);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("native snapshot secret is absent from errors and exported mirror snapshot", async () => {
  const secret = "bridge-secret-redacted-0123456789";
  const server = http.createServer((req, res) => {
    const snapshot = sampleSnapshot();
    snapshot.source.status = "warning";
    snapshot.source.message = `loaded ${req.headers["x-internal-secret"]}`;
    snapshot.source.warnings = [`warning ${req.headers["x-internal-secret"]}`];
    snapshot.source.errors = [`error ${req.headers["x-internal-secret"]}`];
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(snapshot));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    const snapshot = await fetchNativeSnapshot({
      nativeSnapshotUrl: `http://127.0.0.1:${port}/api/hermes/native`,
      nativeInternalSecret: secret,
      fetchTimeoutMs: 5000,
    });
    const envelope = buildMirrorEnvelope(snapshot, { db: true, hermesCli: true, nativeSnapshot: true, detail: `detail ${secret}` });
    const exported = JSON.stringify(envelope);

    assert.equal(exported.includes(secret), false);
    assert.equal(exported.includes("x-internal-secret"), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("native snapshot config fails closed without a bounded secret or localhost URL", () => {
  assert.throws(
    () => validateBridgeConfig({ nativeSnapshotUrl: "http://127.0.0.1:3020/api/hermes/native", nativeInternalSecret: "" }),
    /HERMES_NATIVE_INTERNAL_SECRET is required/,
  );
  assert.throws(
    () => buildNativeSnapshotRequest({ nativeSnapshotUrl: "https://example.com/api/hermes/native", nativeInternalSecret: "bridge-secret-0123456789" }),
    /HERMES_NATIVE_SNAPSHOT_URL must be http localhost/,
  );
});

test("bridge process fails startup when native internal secret is missing", async () => {
  const child = spawn(process.execPath, ["hermes-bridge/bridge.mjs"], {
    cwd: path.resolve(import.meta.dirname, ".."),
    env: {
      ...process.env,
      DATABASE_URL: "postgres://user:pass@127.0.0.1:5432/hermes",
      HERMES_NATIVE_SNAPSHOT_URL: "http://127.0.0.1:3020/api/hermes/native",
      HERMES_NATIVE_INTERNAL_SECRET: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const code = await new Promise((resolve) => child.on("close", resolve));

  assert.notEqual(code, 0);
  assert.match(stderr, /HERMES_NATIVE_INTERNAL_SECRET is required/);
  assert.equal(stderr.includes("x-internal-secret"), false);
});

test("invalid mirror snapshot shape is rejected", () => {
  assert.throws(() => validateSnapshot({ source: { status: "ok" } }), /schema invalid/);
});

test("unsupported request kinds are failed instead of left queued", () => {
  const failures = unsupportedRequestFailures();

  assert.deepEqual(failures, [
    { kind: "briefing.generate", error: "Daily briefing generation is not supported in this Mission Control release." },
    { kind: "memory.write", error: "Wiki memory writes are not supported in this Mission Control release." },
  ]);
  assert.equal(requestKindsForPolicy().includes("briefing.generate"), false);
  assert.equal(requestKindsForPolicy().includes("memory.write"), false);
});

test("unsupported requests have no environment opt-in path", () => {
  const kinds = requestKindsForPolicy({ unsupportedRequests: true });

  assert.equal(unsupportedRequestFailures({ unsupportedRequests: true }).length, 2);
  assert.equal(kinds.includes("briefing.generate"), false);
  assert.equal(kinds.includes("memory.write"), false);
});

test("listRuns excludes dot-prefixed run directories", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-runs-"));
  try {
    const normalDir = path.join(root, "g_normal");
    const supersededDir = path.join(root, ".superseded-foo");
    await fs.mkdir(normalDir, { recursive: true });
    await fs.mkdir(supersededDir, { recursive: true });
    await fs.writeFile(path.join(normalDir, "attempt-1-events.jsonl"), `${JSON.stringify({ data: { event_type: "NODE_START", node_id: "Planner" } })}\n`, "utf8");
    await fs.writeFile(path.join(supersededDir, "attempt-1-events.jsonl"), `${JSON.stringify({ data: { event_type: "NODE_START", node_id: "Planner" } })}\n`, "utf8");

    const rows = await listRuns(root, { goalStateDir: path.join(root, "state") });

    assert.deepEqual(rows.map((row) => row.goal), ["g_normal"]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("live controller argv parser only trusts the ChatDev bridge controller", () => {
  const bridgeDir = "/home/phillip_downs/ChatDev/bridge";
  const python = "/x/.venv/bin/python3";
  const script = path.join(bridgeDir, "escalate.py");

  assert.deepEqual(
    [...parseLiveControllerGoals([python, script, "run", "g_x"], bridgeDir)],
    ["g_x"],
  );

  assert.deepEqual(
    [...parseLiveControllerGoals(["python3", "-c", "import time;time.sleep(9)", script, "run", "g_fake"], bridgeDir)],
    [],
  );

  assert.deepEqual(
    [...parseLiveControllerGoals(["python3", "/tmp/escalate.py", "run", "g_x"], bridgeDir)],
    [],
  );

  assert.deepEqual(
    [...parseLiveControllerGoals(["sleep", "999", "/tmp/escalate.py", "run", "g_x"], bridgeDir)],
    [],
  );

  assert.deepEqual(
    [...parseLiveControllerGoals(["python3", script, "stop", "g_x"], bridgeDir)],
    [],
  );

  assert.deepEqual(
    [...parseLiveControllerGoals(["python3", script, "padding", "run", "g_x"], bridgeDir)],
    [],
  );
});

test("liveControllerGoals resolves absolute-path goals even when /proc/<pid>/cwd is unreadable (EACCES under hardened service)", async () => {
  const bridgeDir = "/home/phillip_downs/ChatDev/bridge";
  const script = path.join(bridgeDir, "escalate.py");
  // Fake pgrep child that emits one pid then exits 0.
  const fakeSpawn = () => {
    const listeners = {};
    const child = {
      pid: 4242,
      stdout: {
        setEncoding() {},
        on(event, cb) { if (event === "data") cb("4242\n"); },
      },
      on(event, cb) { listeners[event] = cb; if (event === "close") queueMicrotask(() => cb(0)); return child; },
      kill() {},
    };
    return child;
  };
  // Fake /proc where cmdline has an ABSOLUTE escalate.py path and cwd readlink throws EACCES.
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-proc-"));
  const procDir = path.join(root, "4242");
  await fs.mkdir(procDir, { recursive: true });
  const argv = ["/x/.venv/bin/python3", script, "run", "g_live_abs"].join("\u0000") + "\u0000";
  await fs.writeFile(path.join(procDir, "cmdline"), argv);
  // Do NOT create a "cwd" symlink → readlink throws ENOENT/EACCES-like failure,
  // which must NOT prevent the absolute-path goal from being reported.
  const goals = await liveControllerGoals({
    spawnFn: fakeSpawn,
    procRoot: root,
    trustedBridgeDir: bridgeDir,
    timeoutMs: 2000,
  });
  assert.deepEqual([...goals], ["g_live_abs"]);
  await fs.rm(root, { recursive: true, force: true });
});

test("run trace parser bounds oversized lines and redacts scribe previews and display paths", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-runs-"));
  try {
    const goalDir = path.join(root, "sample-goal");
    await fs.mkdir(goalDir, { recursive: true });
    const secret = "bridge-secret-value-0123456789";
    const repoPath = path.join(os.homedir(), "Documents", "GitHub", "client-project", "src", "app-file.ts");
    const chatDevPath = path.join(os.homedir(), "ChatDev", "runs", "sample-goal", "attempt-1-events.jsonl");
    const event = {
      data: {
        event_type: "TOOL_CALL",
        node_id: "agent-one",
        timestamp: "2026-08-06T00:00:00.000Z",
        details: {
          tool_name: "read_repo_file",
          tool_args: { path: repoPath },
        },
      },
    };
    const giantLine = `${JSON.stringify({ data: { event_type: "MODEL_CALL", node_id: "ignored", details: { model: "x".repeat(210 * 1024) } } })}\n`;
    await fs.writeFile(path.join(goalDir, "attempt-1-events.jsonl"), `${giantLine}${JSON.stringify(event)}\n`, "utf8");
    await fs.writeFile(path.join(goalDir, "scribe.md"), [
      "## Attempt 1",
      "### Learned",
      `- first ${secret} ${"a".repeat(220)}`,
      "- second",
      "- third",
      "- fourth",
      "- fifth",
      "- sixth",
      "- seventh",
      "### Inferred",
      "- inferred value",
      "",
    ].join("\n"), "utf8");

    const graph = await parseRunTrace(goalDir, { secrets: [secret] });
    const serialized = JSON.stringify(graph);

    assert.equal(serialized.includes(secret), false);
    assert.equal(graph.counts.events, 1);
    assert.equal(graph.files[0].path, "src/app-file.ts");
    assert.equal(graph.touches[0].path, "src/app-file.ts");
    assert.equal(graph.learnings[0].learnedCount, 7);
    assert.equal(graph.learnings[0].inferredCount, 1);
    assert.equal(graph.learnings[0].learned.length + graph.learnings[0].inferred.length, 6);
    assert.ok(graph.learnings[0].learned[0].length <= 160);
    assert.equal(toDisplayPath(chatDevPath), "runs/sample-goal/attempt-1-events.jsonl");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("toDisplayPath never emits an absolute path outside recognized roots", () => {
  assert.equal(toDisplayPath("/etc/passwd"), "passwd");
  assert.equal(toDisplayPath("/var/secret/keys/id_rsa"), "id_rsa");
  assert.equal(toDisplayPath("C:/Users/phil/secret.txt"), "secret.txt");
  const home = process.env.HOME || "";
  // Embedded double-slash must not survive prefix stripping as an absolute path.
  for (const p of [
    "/etc/shadow", "/root/.ssh/config", "/tmp/x/y/z.log",
    `${home}/Documents/GitHub/repo//tmp/secret.txt`,
    `${home}/ChatDev//tmp/secret.txt`,
  ]) {
    assert.equal(/^(\/|[A-Za-z]:\/|\/\/)/.test(toDisplayPath(p)), false, `leaked: ${p}`);
  }
});

test("scrubTextPaths collapses absolute paths but leaves URLs intact", () => {
  const prose = "Failed reading /home/phillip_downs/secret/config.env and /etc/shadow during repair";
  const scrubbed = scrubTextPaths(prose);
  assert.equal(scrubbed.includes("/home/phillip_downs"), false);
  assert.equal(scrubbed.includes("/etc/shadow"), false);
  assert.match(scrubbed, /config\.env/);
  assert.match(scrubbed, /shadow/);
  // URLs must not be corrupted by the path scrubber.
  const withUrl = scrubTextPaths("see https://example.com/a/b and error at /home/phil/x/y.log");
  assert.ok(withUrl.includes("https://example.com/a/b"), "url corrupted");
  assert.equal(withUrl.includes("/home/phil"), false);
});


test("run trace parser exposes live cursor fields", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-runs-"));
  try {
    const goalDir = path.join(root, "live-goal");
    await fs.mkdir(goalDir, { recursive: true });
    const repoPath = path.join(os.homedir(), "Documents/GitHub/client-project/src/live-file.ts");
    const ev = (event_type, node_id, sec, details = {}) => ({ data: { event_type, node_id, timestamp: new Date(Date.UTC(2026, 7, 6, 0, 0, sec)).toISOString(), details } });
    const events = [ev("NODE_START", "Planner", 0), ev("NODE_END", "Planner", 1), ev("NODE_START", "Local Implementer", 2)];
    for (let i = 0; i < 33; i += 1) events.push(ev("MODEL_CALL", "Local Implementer", 3 + i, { model: "qwen3-coder-next" }));
    events.push(ev("TOOL_CALL", "Local Implementer", 36, { tool_name: "apply_patch", tool_args: { path: repoPath } }));
    await fs.writeFile(path.join(goalDir, "attempt-1-events.jsonl"), events.map(JSON.stringify).join("\n") + "\n", "utf8");
    const graph = await parseRunTrace(goalDir);
    const liveFields = JSON.stringify({ currentAgent: graph.currentAgent, currentActivity: graph.currentActivity, timeline: graph.timeline });
    assert.equal(graph.currentAgent, "Local Implementer");
    assert.equal(graph.currentActivity.node, "Local Implementer");
    assert.equal(graph.currentActivity.kind, "tool");
    assert.equal(graph.currentActivity.tool, "apply_patch");
    assert.equal(graph.currentActivity.file, "src/live-file.ts");
    assert.equal(graph.timeline.length, 30);
    assert.equal(graph.timeline.at(-1).file, "src/live-file.ts");
    assert.equal(liveFields.includes(os.homedir()), false);
    assert.equal(liveFields.includes("\"file\":\"/"), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
