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

test("systemd units run services as phillip_downs with explicit home and constrained path", async () => {
  const bridge = await read("systemd/hermes-native-bridge.service");
  const next = await read("systemd/hermy-hq-next.service");

  for (const unit of [bridge, next]) {
    assert.match(unit, /^User=phillip_downs$/m);
    assert.match(unit, /^Group=phillip_downs$/m);
    assert.match(unit, /^Environment=HOME=\/home\/phillip_downs$/m);
    assert.doesNotMatch(unit, /^DynamicUser=/m);
  }

  assert.match(bridge, /^Environment=PATH=\/home\/phillip_downs\/\.local\/bin:\/usr\/local\/bin:\/usr\/bin:\/bin$/m);
  assert.match(next, /^Environment=PATH=\/home\/phillip_downs\/\.local\/bin:\/usr\/local\/bin:\/usr\/bin:\/bin$/m);
});

test("systemd sandbox keeps only required writable service and Hermes state paths", async () => {
  const bridge = await read("systemd/hermes-native-bridge.service");
  const next = await read("systemd/hermy-hq-next.service");

  assert.match(bridge, /^ProtectSystem=strict$/m);
  assert.match(next, /^ProtectSystem=strict$/m);
  assert.match(bridge, /^ReadWritePaths=\/home\/phillip_downs\/\.hermes \/var\/cache\/hermy-hq \/var\/log\/hermy-hq \/run\/hermy-hq$/m);
  assert.match(next, /^ReadOnlyPaths=\/home\/phillip_downs\/Documents\/GitHub\/hermes-agent-mission-control$/m);
  assert.match(next, /^ReadWritePaths=\/home\/phillip_downs\/Documents\/GitHub\/hermes-agent-mission-control\/data \/var\/cache\/hermy-hq \/var\/log\/hermy-hq \/run\/hermy-hq$/m);
  assert.doesNotMatch(next, /^ReadWritePaths=.*\/home\/phillip_downs\/Documents\/GitHub\/hermes-agent-mission-control(?:\s|$)/m);
  assert.doesNotMatch(next, /^ReadWritePaths=.*\/home\/phillip_downs\/Documents\/GitHub\/hermes-agent-mission-control\/src(?:\s|$)/m);
});

test("installer enforces service-owned runtime paths and group-readable root-owned env files", async () => {
  const script = await read("scripts/install-hermes-systemd.sh");

  assert.match(script, /SERVICE_USER="phillip_downs"/);
  assert.match(script, /SERVICE_GROUP="phillip_downs"/);
  assert.match(script, /DATA_DIR="\$\{REPO\}\/data"/);
  assert.match(script, /install -d -m 0750 -o "\$\{SERVICE_USER\}" -g "\$\{SERVICE_GROUP\}" \/var\/cache\/hermy-hq \/var\/log\/hermy-hq \/run\/hermy-hq/);
  assert.match(script, /install -d -m 0750 -o "\$\{SERVICE_USER\}" -g "\$\{SERVICE_GROUP\}" "\$\{DATA_DIR\}"/);
  assert.match(script, /chown root:"\$\{SERVICE_GROUP\}" "\$\{NEXT_ENV\}"/);
  assert.match(script, /chown root:"\$\{SERVICE_GROUP\}" "\$\{BRIDGE_ENV\}"/);
  assert.match(script, /chmod 0640 "\$\{NEXT_ENV\}"/);
  assert.match(script, /chmod 0640 "\$\{BRIDGE_ENV\}"/);
  assert.doesNotMatch(script, /chmod 0644 "\$\{NEXT_ENV\}"/);
  assert.doesNotMatch(script, /chmod 0644 "\$\{BRIDGE_ENV\}"/);
  assert.doesNotMatch(script, briefingFlagPattern);
  assert.doesNotMatch(script, wikiFlagPattern);
});

test("installer validates matching bounded bridge and Next internal secrets without printing values", async () => {
  const script = await read("scripts/install-hermes-systemd.sh");
  const readme = await read("hermes-bridge/README.md");

  assert.match(script, /env_value\(\) \{/);
  assert.match(script, /validate_secret_value\(\) \{/);
  assert.match(script, /INTERNAL_API_SECRET/);
  assert.match(script, /HERMES_NATIVE_INTERNAL_SECRET/);
  assert.match(script, /\[\[ "\$\{#value\}" -ge 16 && "\$\{#value\}" -le 512 \]\]/);
  assert.match(script, /\[\[ "\$\{NEXT_INTERNAL_SECRET\}" == "\$\{BRIDGE_INTERNAL_SECRET\}" \]\] \|\| die "bridge native secret does not match Next internal secret"/);
  assert.match(script, /unset NEXT_INTERNAL_SECRET BRIDGE_INTERNAL_SECRET/);
  assert.doesNotMatch(script, /printf .*NEXT_INTERNAL_SECRET/);
  assert.doesNotMatch(script, /printf .*BRIDGE_INTERNAL_SECRET/);

  assert.match(readme, /HERMES_NATIVE_INTERNAL_SECRET/);
  assert.match(readme, /must exactly match.*INTERNAL_API_SECRET/);
  assert.match(readme, /without printing either secret/);
});
