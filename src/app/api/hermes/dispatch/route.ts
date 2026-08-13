import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readHermesBridgeHealth } from "@/lib/hermes-native-mirror";
import { requireInternalApiSecret } from "@/lib/internal-api-auth";

const MAX_TITLE_CHARS = 200;
const MAX_PROMPT_CHARS = 12_000;
const ALLOWED_KINDS = new Set(["oneshot", "chat"]);

export async function POST(req: Request) {
  const unauthorized = requireInternalApiSecret(req);
  if (unauthorized) return unauthorized;

  const health = await readHermesBridgeHealth();
  if (!health.online) {
    return NextResponse.json({
      error: "Hermes bridge heartbeat is not fresh; dispatch is disabled.",
      health,
    }, { status: 503 });
  }

  const b = await req.json().catch(() => ({}));
  const kind = typeof b.kind === "string" && ALLOWED_KINDS.has(b.kind) ? b.kind : "oneshot";
  const prompt = (b.prompt ?? b.title ?? "").toString().trim();
  const title = (b.title || prompt || "").toString().trim();
  if (!title) return NextResponse.json({ error: "title or prompt required" }, { status: 400 });
  if (title.length > MAX_TITLE_CHARS) return NextResponse.json({ error: "title too large" }, { status: 413 });
  if (prompt.length > MAX_PROMPT_CHARS) return NextResponse.json({ error: "prompt too large" }, { status: 413 });

  const sideEffecting = Boolean(b.sideEffecting);
  const row = await prisma.agentRequest.create({
    data: {
      origin: "web",
      kind,
      title,
      prompt: prompt || null,
      sideEffecting,
      status: sideEffecting ? "awaiting_approval" : "queued",
    },
  });
  return NextResponse.json({ request: row });
}
