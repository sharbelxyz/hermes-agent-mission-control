# Hermy HQ — Agent Onboarding Prompt

> **How to use this:** copy everything in the block below and paste it to your
> Hermes agent, in the directory where you cloned this repo. Hermes will walk you
> through the whole install, pausing to ask you for each real secret. It will not
> invent credentials, and it will keep side-effecting actions approval-gated.

---

You are helping your operator install **Hermy HQ**, a self-hostable mission-control
dashboard (Next.js 16, React 19, Tailwind v4, Prisma + Postgres) that pairs
with you, their local Hermes agent, over a shared Postgres database
used as a message bus. A small **bridge** on the operator's machine polls Postgres
for tasks, runs them via your `hermes` CLI, and mirrors your state (kanban, cron,
health, memory) back to the website.

Guide the operator through the numbered steps below, one at a time. Follow these
rules throughout:

- **Never fabricate or guess secrets.** Whenever a step needs a real value (a
  database URL, an OAuth secret, an API key), STOP and ask the operator to paste it.
  Wait for their answer before continuing. If they do not have one yet, tell them
  exactly where to get it and pause.
- **Confirm before acting.** Show the command you are about to run and wait for a go
  signal before running anything that changes their system or their accounts.
- **Keep side-effecting actions approval-gated.** Do not disable, bypass, or work
  around the approval flow. Anything that writes to external services stays gated.
- **Explain results.** After each step, briefly confirm what happened and what comes
  next. If something errors, help debug before moving on.
- **Redact secrets** in anything you echo back. Never print full keys or tokens.

Work through the steps in order:

### Step 1 — Confirm prerequisites
Verify the operator has each of these; ask them to confirm or help them install:
- **Node.js 20+** (`node -v`) and **git** (`git --version`)
- A **PostgreSQL database URL** they control (Neon, Prisma Postgres, Supabase, or
  Vercel Postgres). Ask them to have the connection string ready — do not ask them
  to paste it yet.
- A **Vercel account** (for deploying the website)
- **You**, Hermes, are installed and reachable — confirm the `hermes` CLI resolves
  on this machine (`which hermes`).

### Step 2 — Clone and install dependencies
If the repo is not already present, clone it, then install:
```sh
git clone <repo-url> hermy-hq && cd hermy-hq
npm install
```
Confirm `npm install` finished without errors.

### Step 3 — Create the `.env` file
Copy the template and fill it in together:
```sh
cp .env.example .env
```
Open `.env` and go through the **Required · Core** group with the operator. For each
of these, ask them to paste the real value, then write it into `.env` for them —
never invent one:
- `DATABASE_URL` and `POSTGRES_URL` (usually the same Postgres URL)
- `NEXT_PUBLIC_OWNER_NAME` and `NEXT_PUBLIC_BASE_URL`

Then set the **Hermes / bridge** group: `HERMES_BOARD`, `HERMES_BIN`, `HERMES_WIKI`,
`BRIEF_HOUR`, and generate `INTERNAL_API_SECRET` and `CRON_SECRET`
(`openssl rand -hex 32` each). Leave the **Optional** groups blank unless the
operator wants those features now.

### Step 4 — Create the database tables
Push the Prisma schema to their Postgres:
```sh
npx prisma db push
```
Confirm it reports the schema is in sync. If it fails, the `DATABASE_URL` is almost
always the cause — recheck it with the operator.

### Step 5 — Run locally to verify
```sh
npm run dev
```
Ask the operator to open http://localhost:3000. Confirm they see the dashboard.
Stop the dev server when they confirm.

### Step 6 — Deploy to Vercel
Guide them through:
```sh
npm i -g vercel   # if needed
vercel            # link the project + preview deploy
vercel --prod     # production
```
Then have the operator:
1. Add **every** variable from `.env` in Vercel → Project → Settings → Environment
   Variables. Ask them to paste values into Vercel themselves (or read them back so
   you can guide) — do not fabricate any.
2. Update `NEXT_PUBLIC_BASE_URL` to the production URL, both locally and in Vercel.
Confirm Mission Control opens directly on the production URL.

### Step 7 — Set up the bridge (connect the bus)
On this machine (where you, Hermes, live), set up the bridge so the website and you
share the Postgres bus:
```sh
cd hermes-bridge
npm install
```
Do a one-off test run using the **same** `DATABASE_URL` as the website (ask the
operator to confirm it matches):
```sh
DATABASE_URL='postgres://…same as website…' HERMES_BOARD=default node bridge.mjs
```
You should see `hermes-bridge up …` in the logs. Then make it permanent:
- **macOS:** edit the placeholders in `hermes-bridge/ai.hermyhq.bridge.plist` (path,
  `DATABASE_URL`, `PATH`), copy it to `~/Library/LaunchAgents/`, and
  `launchctl load` it.
- **Linux:** create an equivalent systemd service that runs
  `node /path/to/hermes-bridge/bridge.mjs` with `DATABASE_URL` set, and enable it.
See `hermes-bridge/README.md` for the exact commands.

### Step 8 — Verify the bridge connected
Ask the operator to open the website's `/hermes` activity feed and confirm a
**"Bridge connected"** event appears. Once it does, the loop is closed: the website
can dispatch requests, and you will pick up `queued`/`approved` ones and mirror your
kanban, cron, health, and memory back.

Finally, remind the operator: side-effecting requests land in the **Approval Inbox**
and will not run until they approve them — this is intentional, keep it that way.
