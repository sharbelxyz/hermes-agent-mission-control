# Hermes Native Bridge

Outbound-only bridge between the local Hermes runtime and production Mission Control. It uses shared Postgres as the message bus and does not expose local files or ports to the internet.

```
local native API -> bridge -> DataStore.hermes-native -> website
website AgentRequest -> bridge -> hermes CLI
```

## Behavior
- Mirrors the bounded local `/api/hermes/native` snapshot into `DataStore` key `hermes-native`.
- The mirrored heartbeat proves database write access, Hermes CLI availability, and native snapshot freshness.
- Runs only native `oneshot`, `chat`, and mechanical `cron.*` requests.
- Sends chat prompts to `hermes --profile default chat --query-file - --source mission-control-bridge` over stdin.
- Daily briefing generation and wiki memory writes are unsupported in this release; existing briefing and memory data can still be read by the website.

## Environment
| var | default | meaning |
|---|---|---|
| `DATABASE_URL` | required | direct production Postgres URL |
| `HERMES_NATIVE_INTERNAL_SECRET` | required | must exactly match the Next app `INTERNAL_API_SECRET`; sent only as `x-internal-secret` to the localhost native snapshot URL |
| `HERMES_BIN` | `hermes` | Hermes CLI path |
| `HERMES_NATIVE_SNAPSHOT_URL` | `http://127.0.0.1:3020/api/hermes/native` | local safe snapshot URL |
| `BRIDGE_POLL_MS` | `5000` | request poll interval |
| `BRIDGE_MIRROR_MS` | `30000` | mirror interval |
| `BRIDGE_RUN_TIMEOUT_MS` | `240000` | single request timeout |

Use the checked-in systemd templates in `../systemd` and EnvironmentFiles under `/etc/hermy-hq`. Put `INTERNAL_API_SECRET` in `/etc/hermy-hq/next.env` and the same value as `HERMES_NATIVE_INTERNAL_SECRET` in `/etc/hermy-hq/hermes-bridge.env`. The install script validates prerequisites, secret length, and secret equality without printing either secret, then enables units without starting them.
