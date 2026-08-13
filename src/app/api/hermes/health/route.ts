import { NextResponse } from "next/server";
import { readHermesBridgeHealth } from "@/lib/hermes-native-mirror";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const health = await readHermesBridgeHealth();
  return NextResponse.json(health, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
