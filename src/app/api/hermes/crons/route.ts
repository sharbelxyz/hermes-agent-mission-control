import { NextResponse } from "next/server";
import { requireInternalApiSecret } from "@/lib/internal-api-auth";
import { prisma } from "@/lib/prisma";

export type CronJob = {
  id: string;
  status: string;           // "active" | "paused"
  name: string;
  schedule: string;
  nextRun: string | null;
  lastRun: string | null;
  lastResult: string | null;
  deliver: string | null;
  skills: string | null;
  script: string | null;
  mode: string | null;
};

// Parse the raw `hermes cron list --all` terminal output into clean objects.
// Format per job: two-space-indented "<id> [status]" then four-space "Key: value" lines.
function parseCrons(raw: string): CronJob[] {
  const jobs: CronJob[] = [];
  let cur: CronJob | null = null;
  const push = () => { if (cur) jobs.push(cur); };
  for (const line of raw.split("\n")) {
    const head = line.match(/^\s{2}([0-9a-f]{6,})\s+\[(\w+)\]/);
    if (head) {
      push();
      cur = { id: head[1], status: head[2], name: "", schedule: "", nextRun: null, lastRun: null, lastResult: null, deliver: null, skills: null, script: null, mode: null };
      continue;
    }
    const kv = line.match(/^\s{4}([A-Za-z][A-Za-z ]*?):\s+(.*)$/);
    if (kv && cur) {
      const key = kv[1].trim().toLowerCase();
      const val = kv[2].trim();
      if (key === "name") cur.name = val;
      else if (key === "schedule") cur.schedule = val;
      else if (key === "next run") cur.nextRun = val;
      else if (key === "deliver") cur.deliver = val;
      else if (key === "skills") cur.skills = val;
      else if (key === "script") cur.script = val;
      else if (key === "mode") cur.mode = val;
      else if (key === "last run") {
        const m = val.match(/^(\S+)\s+(.*)$/);
        cur.lastRun = m ? m[1] : val;
        cur.lastResult = m ? m[2] : null;
      }
    }
  }
  push();
  return jobs;
}

export async function GET() {
  const row = await prisma.dataStore.findUnique({ where: { key: "hermes-crons" } });
  const data = (row?.data as { raw?: string; jobs?: string[] | CronJob[]; syncedAt?: string } | null) ?? {};
  const jobs = Array.isArray(data.jobs)
    ? data.jobs.flatMap((job) => typeof job === "string" ? parseCrons(job) : [job]).slice(0, 200)
    : data.raw ? parseCrons(data.raw) : [];
  return NextResponse.json({ jobs, syncedAt: data.syncedAt ?? null });
}

// POST { op: "create"|"pause"|"resume"|"run"|"remove"|"edit", ... } → queue a cron mutation for the bridge
export async function POST(req: Request) {
  const unauthorized = requireInternalApiSecret(req);
  if (unauthorized) return unauthorized;

  const b = await req.json().catch(() => ({}));
  const op = (b.op || "").toString();
  if (!["create", "pause", "resume", "run", "remove", "edit"].includes(op))
    return NextResponse.json({ error: "bad op" }, { status: 400 });
  const label = op === "create" ? `Schedule: ${b.schedule || "?"} — ${b.prompt || b.name || ""}` : `Cron ${op}: ${b.name || b.id || ""}`;
  const sideEffecting = op === "create" || op === "edit" || op === "remove";
  const row = await prisma.agentRequest.create({
    data: {
      origin: "web",
      kind: `cron.${op}`,
      title: label.slice(0, 200),
      prompt: JSON.stringify(b),
      sideEffecting,
      status: sideEffecting ? "awaiting_approval" : "queued",
    },
  });
  return NextResponse.json({ request: row });
}
