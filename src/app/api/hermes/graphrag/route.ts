import { NextResponse } from "next/server";
import { collectGraphRagObservability } from "@/lib/graph-rag-observability";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const payload = await collectGraphRagObservability();
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
