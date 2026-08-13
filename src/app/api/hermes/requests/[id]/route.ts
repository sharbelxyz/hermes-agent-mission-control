import { NextResponse } from "next/server";
import { requireInternalApiSecret } from "@/lib/internal-api-auth";
import { prisma } from "@/lib/prisma";

const MAX_TITLE_CHARS = 200;
const MAX_PROMPT_CHARS = 12_000;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireInternalApiSecret(req);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const action = (b.action || "").toString(); // approve | reject | edit
  const existing = await prisma.agentRequest.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!["awaiting_approval", "queued"].includes(existing.status))
    return NextResponse.json({ error: `cannot decide a ${existing.status} request` }, { status: 409 });

  const data: Record<string, unknown> = { decidedAt: new Date() };
  if (action === "approve") data.status = "approved";
  else if (action === "reject") data.status = "rejected";
  else if (action === "edit") {
    const prompt = b.prompt == null ? null : b.prompt.toString();
    const title = b.title == null ? null : b.title.toString();
    if (prompt && prompt.length > MAX_PROMPT_CHARS) return NextResponse.json({ error: "prompt too large" }, { status: 413 });
    if (title && title.length > MAX_TITLE_CHARS) return NextResponse.json({ error: "title too large" }, { status: 413 });
    data.status = "approved";
    if (prompt) data.prompt = prompt;
    if (title) data.title = title;
  }
  else return NextResponse.json({ error: "action must be approve|reject|edit" }, { status: 400 });

  const row = await prisma.agentRequest.update({ where: { id }, data });
  return NextResponse.json({ request: row });
}
