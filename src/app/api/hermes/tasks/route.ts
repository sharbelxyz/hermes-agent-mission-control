import { NextResponse } from "next/server";
import { readHermesNativeSnapshotForServer } from "@/lib/hermes-native-mirror";

export async function GET() {
  const snapshot = await readHermesNativeSnapshotForServer();
  return NextResponse.json({
    tasks: snapshot.operatorTasks.tasks,
    counts: snapshot.operatorTasks.counts,
    total: snapshot.operatorTasks.tasks.length,
    lastSync: snapshot.source.lastSeen ?? snapshot.source.checkedAt,
    source: snapshot.source.mode,
    stale: snapshot.source.stale,
  });
}
