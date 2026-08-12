import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const repo = path.resolve(import.meta.dirname, "..");
const briefingFlagPattern = new RegExp(["HERMES", "ENABLE", "DAILY", "BRIEFING"].join("_"));
const wikiFlagPattern = new RegExp(["HERMES", "ENABLE", "WIKI", "MIRROR"].join("_"));

async function read(relativePath) {
  return fs.readFile(path.join(repo, relativePath), "utf8");
}

test("unsupported briefing POST returns gone without queueing or env opt-in", async () => {
  const route = await read("src/app/api/hermes/briefing/route.ts");

  assert.match(route, /export async function POST\([^)]*\)/);
  assert.match(route, /status:\s*410/);
  assert.match(route, /Daily briefing generation is not supported in this Mission Control release\./);
  assert.doesNotMatch(route, /agentRequest\.create/);
  assert.doesNotMatch(route, briefingFlagPattern);
  assert.doesNotMatch(route, /kind:\s*"briefing\.generate"/);
});

test("unsupported memory POST returns gone without queueing or env opt-in", async () => {
  const route = await read("src/app/api/hermes/memory/route.ts");

  assert.match(route, /export async function POST\([^)]*\)/);
  assert.match(route, /status:\s*410/);
  assert.match(route, /Wiki memory writes are not supported in this Mission Control release\./);
  assert.doesNotMatch(route, /agentRequest\.create/);
  assert.doesNotMatch(route, wikiFlagPattern);
  assert.doesNotMatch(route, /kind:\s*"memory\.write"/);
});
