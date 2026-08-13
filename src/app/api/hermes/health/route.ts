import { NextResponse } from "next/server";
import { readHermesBridgeHealth } from "@/lib/hermes-native-mirror";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS_HEADERS });
}

export async function GET() {
  try {
    const health = await readHermesBridgeHealth();
    return NextResponse.json(health, { headers: CORS_HEADERS });
  } catch (error) {
    console.error("[health] Error reading health:", error);
    return NextResponse.json(
      {
        status: "error",
        online: false,
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
