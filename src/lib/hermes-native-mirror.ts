import type { HermesNativeSnapshot } from "./hermes-native.ts";
import { readHermesNativeSnapshot } from "./hermes-native.ts";
import { prisma } from "./prisma.ts";

const MIRROR_KEY = "hermes-native";
const DEFAULT_STALE_MS = 90_000;

type MirrorStatus = "ok" | "warning" | "error";

export interface HermesBridgeHealth {
  online: boolean;
  gateway: string;
  detail: string | null;
  lastSeen: string | null;
  stale: boolean;
  ageMs: number | null;
  source: "bridge-mirror";
  checks: {
    db: boolean;
    hermesCli: boolean;
    nativeSnapshot: boolean;
  };
}

interface MirrorEnvelope {
  schemaVersion: 1;
  source: "bridge-mirror";
  mirroredAt: string;
  heartbeat: {
    db: boolean;
    hermesCli: boolean;
    nativeSnapshot: boolean;
    detail?: string | null;
  };
  snapshot: HermesNativeSnapshot;
}

export async function readHermesNativeSnapshotForServer(): Promise<HermesNativeSnapshot> {
  const local = await readHermesNativeSnapshot();
  if (local.source.status !== "error") return local;

  const mirror = await readHermesNativeMirror();
  return mirror ?? local;
}

export async function readHermesNativeMirror(): Promise<HermesNativeSnapshot | null> {
  const row = await prisma.dataStore.findUnique({ where: { key: MIRROR_KEY } });
  const envelope = parseMirrorEnvelope(row?.data);
  if (!envelope) return null;

  const stale = isHermesBridgeMirrorStale(envelope.mirroredAt);
  const status: MirrorStatus =
    stale || !envelope.heartbeat.db || !envelope.heartbeat.hermesCli || !envelope.heartbeat.nativeSnapshot
      ? "warning"
      : envelope.snapshot.source.status;

  return {
    ...envelope.snapshot,
    source: {
      ...envelope.snapshot.source,
      mode: "bridge-mirror",
      status,
      message: stale
        ? "Bridge mirror is stale; showing last known native snapshot"
        : "Native Hermes truth loaded from bridge mirror",
      warnings: [
        ...(stale ? ["bridge-mirror: heartbeat is stale"] : []),
        ...envelope.snapshot.source.warnings,
      ].slice(0, 20),
      errors: envelope.snapshot.source.errors.slice(0, 20),
      checkedAt: new Date().toISOString(),
      lastSeen: envelope.mirroredAt,
      stale,
    },
  };
}

export async function readDataStore<T = unknown>(key: string): Promise<T | null> {
  if (!/^[a-z0-9_.:-]{1,120}$/i.test(key)) return null;
  const row = await prisma.dataStore.findUnique({ where: { key } });
  return (row?.data as T | null | undefined) ?? null;
}

export async function readHermesBridgeHealth(): Promise<HermesBridgeHealth> {
  const row = await prisma.dataStore.findUnique({ where: { key: MIRROR_KEY } });
  const envelope = parseMirrorEnvelope(row?.data);
  if (!envelope) {
    return {
      online: false,
      gateway: "unknown",
      detail: "No bridge mirror heartbeat",
      lastSeen: null,
      stale: true,
      ageMs: null,
      source: "bridge-mirror",
      checks: { db: false, hermesCli: false, nativeSnapshot: false },
    };
  }

  const ageMs = Date.now() - Date.parse(envelope.mirroredAt);
  const stale = !Number.isFinite(ageMs) || ageMs > staleMs();
  const checks = {
    db: envelope.heartbeat.db === true,
    hermesCli: envelope.heartbeat.hermesCli === true,
    nativeSnapshot: envelope.heartbeat.nativeSnapshot === true && envelope.snapshot.source.status !== "error",
  };
  const online = !stale && checks.db && checks.hermesCli && checks.nativeSnapshot;

  return {
    online,
    gateway: online ? "bridge-mirror" : "not-ready",
    detail: envelope.heartbeat.detail ? safeText(envelope.heartbeat.detail, 500) : null,
    lastSeen: envelope.mirroredAt,
    stale,
    ageMs: Number.isFinite(ageMs) ? ageMs : null,
    source: "bridge-mirror",
    checks,
  };
}

function parseMirrorEnvelope(value: unknown): MirrorEnvelope | null {
  const record = asRecord(value);
  if (record.schemaVersion !== 1 || record.source !== "bridge-mirror") return null;
  const mirroredAt = safeIso(record.mirroredAt);
  const heartbeat = asRecord(record.heartbeat);
  const snapshot = asRecord(record.snapshot);
  if (!mirroredAt || !isSnapshotLike(snapshot)) return null;

  return {
    schemaVersion: 1,
    source: "bridge-mirror",
    mirroredAt,
    heartbeat: {
      db: heartbeat.db === true,
      hermesCli: heartbeat.hermesCli === true,
      nativeSnapshot: heartbeat.nativeSnapshot === true,
      detail: safeText(heartbeat.detail, 500),
    },
    snapshot: snapshot as unknown as HermesNativeSnapshot,
  };
}

function isSnapshotLike(value: Record<string, unknown>) {
  const source = asRecord(value.source);
  const policy = asRecord(value.policy);
  const operatorTasks = asRecord(value.operatorTasks);
  const goals = asRecord(value.goals);
  const archive = asRecord(value.archive);
  return Boolean(
    source.status &&
      source.message &&
      policy.runtimeNote &&
      Array.isArray(value.agents) &&
      operatorTasks.tasks &&
      goals.live &&
      archive.counts,
  );
}

export function isHermesBridgeMirrorStale(iso: string, nowMs = Date.now()) {
  const testedAge = nowMs - Date.parse(iso);
  return !Number.isFinite(testedAge) || testedAge > staleMs();
}

function staleMs() {
  const parsed = Number(process.env.HERMES_BRIDGE_STALE_MS ?? DEFAULT_STALE_MS);
  return Number.isFinite(parsed) && parsed >= 10_000 ? parsed : DEFAULT_STALE_MS;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function safeIso(value: unknown) {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function safeText(value: unknown, max: number) {
  return typeof value === "string" && value.trim()
    ? value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max)
    : null;
}
