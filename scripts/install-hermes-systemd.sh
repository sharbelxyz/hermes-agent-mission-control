#!/usr/bin/env bash
set -euo pipefail

REPO="/home/phillip_downs/Documents/GitHub/hermes-agent-mission-control"
SYSTEMD_DIR="${REPO}/systemd"
ENV_DIR="/etc/hermy-hq"
NEXT_ENV="${ENV_DIR}/next.env"
BRIDGE_ENV="${ENV_DIR}/hermes-bridge.env"
SERVICE_USER="phillip_downs"
SERVICE_GROUP="phillip_downs"
SERVICE_HOME="/home/phillip_downs"
SERVICE_PATH="${SERVICE_HOME}/.local/bin:/usr/local/bin:/usr/bin:/bin"
DATA_DIR="${REPO}/data"

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

env_value() {
  local file="$1"
  local key="$2"
  local line value
  line="$(grep -E "^[[:space:]]*${key}=" "${file}" | tail -n 1 || true)"
  [[ -n "${line}" ]] || return 1
  value="${line#*=}"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s' "${value}"
}

validate_secret_value() {
  local name="$1"
  local value="$2"
  [[ -n "${value}" ]] || die "set ${name}"
  [[ "${#value}" -ge 16 && "${#value}" -le 512 ]] || die "${name} length is invalid"
  [[ ! "${value}" =~ [[:cntrl:]] ]] || die "${name} contains invalid characters"
}

[[ "$(id -u)" -eq 0 ]] || die "run as root so unit files can be installed"
id -u "${SERVICE_USER}" >/dev/null || die "missing service user ${SERVICE_USER}"
getent group "${SERVICE_GROUP}" >/dev/null || die "missing service group ${SERVICE_GROUP}"
[[ -d "${REPO}/.next" ]] || die "built Next app not found at ${REPO}/.next"
[[ -f "${SYSTEMD_DIR}/hermy-hq-next.service" ]] || die "missing Next service template"
[[ -f "${SYSTEMD_DIR}/hermes-native-bridge.service" ]] || die "missing bridge service template"
NODE_BIN="$(runuser -u "${SERVICE_USER}" -- env "HOME=${SERVICE_HOME}" "PATH=${SERVICE_PATH}" bash -lc 'command -v node')" || die "node is not on service PATH"
NPM_BIN="$(runuser -u "${SERVICE_USER}" -- env "HOME=${SERVICE_HOME}" "PATH=${SERVICE_PATH}" bash -lc 'command -v npm')" || die "npm is not on service PATH"
HERMES_BIN="$(runuser -u "${SERVICE_USER}" -- env "HOME=${SERVICE_HOME}" "PATH=${SERVICE_PATH}" bash -lc 'command -v hermes')" || die "hermes CLI is not on service PATH"
[[ "${NODE_BIN}" == "${SERVICE_HOME}/.local/bin/node" ]] || die "unit expects node at ${SERVICE_HOME}/.local/bin/node; resolved ${NODE_BIN}"
[[ "${NPM_BIN}" == "${SERVICE_HOME}/.local/bin/npm" ]] || die "unit expects npm at ${SERVICE_HOME}/.local/bin/npm; resolved ${NPM_BIN}"
[[ -x "${HERMES_BIN}" ]] || die "resolved hermes CLI is not executable: ${HERMES_BIN}"

install -d -m 0750 -o root -g "${SERVICE_GROUP}" "${ENV_DIR}"
install -d -m 0750 -o "${SERVICE_USER}" -g "${SERVICE_GROUP}" /var/cache/hermy-hq /var/log/hermy-hq /run/hermy-hq
install -d -m 0750 -o "${SERVICE_USER}" -g "${SERVICE_GROUP}" "${SERVICE_HOME}/.hermes"
install -d -m 0750 -o "${SERVICE_USER}" -g "${SERVICE_GROUP}" "${DATA_DIR}"

if [[ ! -f "${NEXT_ENV}" ]]; then
  cat >"${NEXT_ENV}" <<'EOF'
# Required by the built Next app.
# DATABASE_URL=postgres://...
# INTERNAL_API_SECRET=generate-the-shared-native-bridge-secret
EOF
fi
chown root:"${SERVICE_GROUP}" "${NEXT_ENV}"
chmod 0640 "${NEXT_ENV}"

if [[ ! -f "${BRIDGE_ENV}" ]]; then
  cat >"${BRIDGE_ENV}" <<'EOF'
# Required: direct production Postgres URL, not an Accelerate URL.
# DATABASE_URL=postgres://...
# Required: must exactly match INTERNAL_API_SECRET in /etc/hermy-hq/next.env.
# HERMES_NATIVE_INTERNAL_SECRET=generate-the-shared-native-bridge-secret
# Optional:
# BRIDGE_POLL_MS=5000
# BRIDGE_MIRROR_MS=30000
EOF
fi
chown root:"${SERVICE_GROUP}" "${BRIDGE_ENV}"
chmod 0640 "${BRIDGE_ENV}"

if grep -q '^HERMES_BIN=' "${BRIDGE_ENV}"; then
  sed -i "s|^HERMES_BIN=.*|HERMES_BIN=${HERMES_BIN}|" "${BRIDGE_ENV}"
else
  printf '\nHERMES_BIN=%s\n' "${HERMES_BIN}" >>"${BRIDGE_ENV}"
fi

grep -Eq '^DATABASE_URL=postgres(ql)?://' "${NEXT_ENV}" || die "set DATABASE_URL in ${NEXT_ENV}"
grep -Eq '^DATABASE_URL=postgres(ql)?://' "${BRIDGE_ENV}" || die "set direct production DATABASE_URL in ${BRIDGE_ENV}"
! grep -Eq '^DATABASE_URL=prisma(\+|://)' "${BRIDGE_ENV}" || die "bridge DATABASE_URL must be direct Postgres"

NEXT_INTERNAL_SECRET="$(env_value "${NEXT_ENV}" "INTERNAL_API_SECRET" || true)"
BRIDGE_INTERNAL_SECRET="$(env_value "${BRIDGE_ENV}" "HERMES_NATIVE_INTERNAL_SECRET" || true)"
validate_secret_value "INTERNAL_API_SECRET in ${NEXT_ENV}" "${NEXT_INTERNAL_SECRET}"
validate_secret_value "HERMES_NATIVE_INTERNAL_SECRET in ${BRIDGE_ENV}" "${BRIDGE_INTERNAL_SECRET}"
[[ "${NEXT_INTERNAL_SECRET}" == "${BRIDGE_INTERNAL_SECRET}" ]] || die "bridge native secret does not match Next internal secret"
unset NEXT_INTERNAL_SECRET BRIDGE_INTERNAL_SECRET

install -m 0644 "${SYSTEMD_DIR}/hermy-hq-next.service" /etc/systemd/system/hermy-hq-next.service
install -m 0644 "${SYSTEMD_DIR}/hermes-native-bridge.service" /etc/systemd/system/hermes-native-bridge.service
systemctl daemon-reload
systemctl enable hermy-hq-next.service hermes-native-bridge.service

printf 'Installed and enabled units. Services were not started.\n'
printf 'Start manually after final review: systemctl start hermy-hq-next hermes-native-bridge\n'
