import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    summary: null,
    byModel: [],
    totalCost: null,
    totalTokens: null,
    syncedAt: null,
    source: "langfuse-canonical",
    disabled: true,
  });
}
