import { NextResponse } from "next/server";
import { readDataStore } from "@/lib/hermes-native-mirror";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type OversightPayload = {
  generatedAt?: string;
  empty?: boolean;
};

function emptyPayload(): OversightPayload {
  return { generatedAt: new Date().toISOString(), empty: true };
}

export async function GET() {
  const payload = await readDataStore<OversightPayload>("hermes-oversight").catch(() => null);
  return NextResponse.json(payload && typeof payload === "object" ? payload : emptyPayload(), {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
