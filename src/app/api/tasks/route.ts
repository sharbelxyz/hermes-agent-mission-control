import { NextResponse } from "next/server";
import { readHermesNativeSnapshotForServer } from "@/lib/hermes-native-mirror";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const snapshot = await readHermesNativeSnapshotForServer();

  return NextResponse.json({
    source: "native-hermes",
    operatorTasks: snapshot.operatorTasks,
    goals: snapshot.goals,
    archive: snapshot.archive,
    sourceHealth: snapshot.source,
  }, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
