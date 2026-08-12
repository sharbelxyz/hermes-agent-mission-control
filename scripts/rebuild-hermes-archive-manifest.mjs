#!/usr/bin/env node
import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

export const FIXED_MISSION_ROOT = "/home/phillip_downs/.hermes/mission-control";
export const FIXED_ARCHIVE_ROOT = path.join(FIXED_MISSION_ROOT, "archive/goals");
export const STATUSES = ["done", "failed"];
export const LIMITS = {
  maxFileBytes: 2 * 1024 * 1024,
  maxTotalBytes: 100 * 1024 * 1024,
  maxRows: 10000,
};

async function main() {
  if (process.argv.length > 2) {
    throw new Error("archive root CLI arguments are not accepted; use the fixed Mission Control archive root");
  }

  const archiveRoot = await resolveArchiveRoot();
  const manifestPath = path.join(archiveRoot, "import-manifest.json");
  const files = [];
  const artifacts = [];
  const budget = { rows: 0, bytes: 0 };

  for (const status of STATUSES) {
    const statusRoot = path.join(archiveRoot, status);
    const rows = await collectFiles(archiveRoot, statusRoot, status, budget);
    for (const row of rows) {
      const parts = row.path.split("/");
      if (parts.length === 2 && row.name.endsWith(".md")) {
        files.push({ kind: "goal", ...row });
      } else {
        artifacts.push({ kind: "artifact", ...row, goal: parts[1] ?? null });
      }
    }
  }

  files.sort(byPath);
  artifacts.sort(byPath);

  const counts = countByStatus(files);
  const artifact_counts = countByStatus(artifacts);
  const manifest = {
    imported_at: new Date().toISOString(),
    source: "filesystem:fixed-mission-control-archive",
    schema_version: 2,
    limits: LIMITS,
    counts,
    artifact_counts,
    files,
    artifacts,
  };

  await writeJsonAtomically(manifestPath, manifest);
  console.log(JSON.stringify({
    manifest: manifestPath,
    counts,
    artifact_counts,
    files: files.length,
    artifacts: artifacts.length,
    total_bytes: budget.bytes,
  }, null, 2));
}

export async function resolveArchiveRoot(env = process.env) {
  const requested = env.HERMES_ARCHIVE_ROOT ? path.resolve(env.HERMES_ARCHIVE_ROOT) : FIXED_ARCHIVE_ROOT;
  const fixedReal = await realDirectory(FIXED_ARCHIVE_ROOT, "fixed archive root");
  const requestedReal = await realDirectory(requested, "archive root");
  if (requestedReal !== fixedReal && !requestedReal.startsWith(`${fixedReal}${path.sep}`)) {
    throw new Error("archive root must be the fixed Mission Control archive root or a contained child");
  }
  return requestedReal;
}

export async function collectFiles(archiveRoot, dir, status, budget = { rows: 0, bytes: 0 }) {
  const entries = [];

  async function walk(current) {
    const currentReal = await assertContainedDirectory(archiveRoot, current);
    let children;
    try {
      children = await fs.readdir(currentReal, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }

    for (const child of children) {
      const fullPath = path.join(currentReal, child.name);
      const childStat = await fs.lstat(fullPath);
      if (childStat.isSymbolicLink()) throw new Error(`symlink rejected: ${path.relative(archiveRoot, fullPath)}`);
      if (childStat.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!childStat.isFile()) continue;
      if (childStat.size > LIMITS.maxFileBytes) throw new Error(`file exceeds per-file byte cap: ${path.relative(archiveRoot, fullPath)}`);
      if (budget.rows + 1 > LIMITS.maxRows) throw new Error("archive manifest row cap exceeded");
      if (budget.bytes + childStat.size > LIMITS.maxTotalBytes) throw new Error("archive manifest total byte cap exceeded");

      const realPath = await fs.realpath(fullPath);
      assertContainedPath(archiveRoot, realPath);
      const rel = path.relative(archiveRoot, realPath).split(path.sep).join("/");
      if (!safeArchivePath(rel)) throw new Error(`unsafe archive path rejected: ${rel}`);

      budget.rows += 1;
      budget.bytes += childStat.size;
      entries.push({
        status,
        name: child.name,
        path: rel,
        bytes: childStat.size,
        sha256: await sha256File(realPath, LIMITS.maxFileBytes),
      });
    }
  }

  await walk(dir);
  return entries;
}

async function realDirectory(dir, label) {
  const stat = await fs.lstat(dir);
  if (stat.isSymbolicLink()) throw new Error(`${label} symlink rejected`);
  if (!stat.isDirectory()) throw new Error(`${label} is not a directory`);
  return fs.realpath(dir);
}

async function assertContainedDirectory(root, dir) {
  const stat = await fs.lstat(dir);
  if (stat.isSymbolicLink()) throw new Error(`symlink rejected: ${path.relative(root, dir)}`);
  if (!stat.isDirectory()) throw new Error(`not a directory: ${path.relative(root, dir)}`);
  const real = await fs.realpath(dir);
  assertContainedPath(root, real);
  return real;
}

function assertContainedPath(root, target) {
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error("archive path containment rejected");
  }
}

async function sha256File(file, maxBytes) {
  const hash = crypto.createHash("sha256");
  let bytes = 0;
  await new Promise((resolve, reject) => {
    const stream = createReadStream(file, { highWaterMark: 64 * 1024 });
    stream.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        stream.destroy(new Error("file exceeds per-file byte cap while streaming"));
        return;
      }
      hash.update(chunk);
    });
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

function countByStatus(rows) {
  const done = rows.filter((row) => row.status === "done").length;
  const failed = rows.filter((row) => row.status === "failed").length;
  return { done, failed, total: done + failed };
}

function byPath(a, b) {
  return a.path.localeCompare(b.path);
}

function safeArchivePath(value) {
  if (!value || value.includes("\\") || value.includes("\0") || value.startsWith("/") || value.includes("../")) return false;
  const parts = value.split("/");
  return parts.length >= 2 && parts.every((part) => /^[A-Za-z0-9._ -]{1,180}$/.test(part) && part !== "." && part !== "..");
}

async function writeJsonAtomically(file, value) {
  const dir = path.dirname(file);
  const tmp = path.join(dir, `.import-manifest.${process.pid}.${Date.now()}.tmp`);
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  const handle = await fs.open(tmp, "wx", 0o600);
  try {
    await handle.writeFile(payload, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(tmp, file);
  const dirHandle = await fs.open(dir, "r");
  try {
    await dirHandle.sync();
  } finally {
    await dirHandle.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
