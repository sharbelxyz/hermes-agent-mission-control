import { NextResponse } from "next/server";
import { readDataStore } from "@/lib/hermes-native-mirror";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RecoveryPayload = {
  events?: unknown[];
  summary?: unknown[];
  syncedAt?: string;
};

export async function GET() {
  const payload = await readDataStore<RecoveryPayload>("hermes-recovery").catch(() => null);
  return NextResponse.json(
    {
      events: Array.isArray(payload?.events) ? payload.events : [],
      summary: Array.isArray(payload?.summary) ? payload.summary : [],
      syncedAt: payload?.syncedAt ?? null,
    },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
  );
}
