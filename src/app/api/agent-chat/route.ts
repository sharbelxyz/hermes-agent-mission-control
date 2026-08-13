import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "Direct persona chat is disabled. Use the default cloud orchestrator and on-demand Hermes specialists through the native runtime.",
    },
    { status: 410 },
  );
}
