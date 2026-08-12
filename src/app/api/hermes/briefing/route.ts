import { NextResponse } from "next/server";
import { requireInternalApiSecret } from "@/lib/internal-api-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const row = await prisma.dataStore.findUnique({ where: { key: "hermes-briefing" } });
  return NextResponse.json(row?.data ?? { generatedAt: null, summary: null, sections: [] });
}

export async function POST(req: Request) {
  const unauthorized = requireInternalApiSecret(req);
  if (unauthorized) return unauthorized;

  return NextResponse.json(
    { error: "Daily briefing generation is not supported in this Mission Control release." },
    { status: 410 },
  );
}
