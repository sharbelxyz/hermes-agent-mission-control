import { NextResponse } from "next/server";
import { readDataStore } from "@/lib/hermes-native-mirror";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RunsPayload = {
  index?: unknown[];
};

export async function GET() {
  const payload = await readDataStore<RunsPayload>("hermes-runs").catch(() => null);
  return NextResponse.json(Array.isArray(payload?.index) ? payload.index : [], {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
