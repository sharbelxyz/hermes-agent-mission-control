import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { collectFiles, LIMITS } from "../scripts/rebuild-hermes-archive-manifest.mjs";

test("archive manifest collection hashes files with bounded rows and bytes", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-archive-"));
  try {
    const archive = path.join(root, "archive/goals");
    await fs.mkdir(path.join(archive, "done/alpha"), { recursive: true });
    await fs.writeFile(path.join(archive, "done/alpha.md"), "# alpha\n");
    await fs.writeFile(path.join(archive, "done/alpha/evidence.md"), "evidence\n");

    const rows = await collectFiles(archive, path.join(archive, "done"), "done");
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((row) => row.path).sort(), ["done/alpha.md", "done/alpha/evidence.md"]);
    assert.match(rows[0].sha256, /^[a-f0-9]{64}$/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("archive manifest collection rejects symlinks", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-archive-"));
  try {
    const archive = path.join(root, "archive/goals");
    await fs.mkdir(path.join(archive, "done"), { recursive: true });
    await fs.writeFile(path.join(root, "outside.md"), "# outside\n");
    await fs.symlink(path.join(root, "outside.md"), path.join(archive, "done/link.md"));

    await assert.rejects(
      () => collectFiles(archive, path.join(archive, "done"), "done"),
      /symlink rejected/,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("archive manifest collection enforces byte caps before hashing", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-archive-"));
  try {
    const archive = path.join(root, "archive/goals");
    await fs.mkdir(path.join(archive, "failed"), { recursive: true });
    await fs.writeFile(path.join(archive, "failed/huge.md"), "x".repeat(LIMITS.maxFileBytes + 1));

    await assert.rejects(
      () => collectFiles(archive, path.join(archive, "failed"), "failed"),
      /per-file byte cap/,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
