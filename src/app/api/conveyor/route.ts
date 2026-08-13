import { NextResponse } from "next/server";
import { readDataStore } from "@/lib/hermes-native-mirror";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const EMPTY = {
  conveyorOn: false,
  controllerPids: [] as number[],
  liveGoals: [] as string[],
  active: [] as unknown[],
  upNext: [] as unknown[],
  planRequired: [] as unknown[],
  blocked: [] as unknown[],
  counts: {} as Record<string, number>,
  focusPrefixes: [] as string[],
  message: "",
  boxes: [] as unknown[],
  statusAgeSec: null as number | null,
  statusMissing: true,
  syncedAt: null as string | null,
};

export async function GET() {
  const payload = await readDataStore<typeof EMPTY>("hermes-conveyor").catch(() => null);
  return NextResponse.json(payload ?? EMPTY, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
