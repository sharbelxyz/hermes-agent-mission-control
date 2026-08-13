import { NextResponse } from "next/server";
import { readDataStore } from "@/lib/hermes-native-mirror";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RunActivity = {
  node: string;
  kind: "model" | "tool" | "idle";
  tool: string | null;
  file: string | null;
  at: string | null;
};

type RunTimelineEntry = {
  seq: number;
  node: string;
  kind: "node_start" | "node_end" | "model" | "tool";
  tool: string | null;
  file: string | null;
  at: string | null;
};

type RunGraphPayload = {
  currentAgent?: string | null;
  currentActivity?: RunActivity | null;
  timeline?: RunTimelineEntry[];
  [key: string]: unknown;
};

type RunsPayload = {
  graphs?: Record<string, RunGraphPayload>;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ goal: string }> },
) {
  const { goal } = await context.params;
  let decoded: string;
  try {
    decoded = decodeURIComponent(goal);
  } catch (error) {
    if (error instanceof URIError) {
      return NextResponse.json(
        { error: "invalid goal" },
        { status: 400, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
      );
    }
    throw error;
  }
  if (!/^[A-Za-z0-9_.-]{1,180}$/.test(decoded)) {
    return NextResponse.json(
      { error: "invalid goal" },
      { status: 400, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
  }

  const payload = await readDataStore<RunsPayload>("hermes-runs").catch(() => null);
  const graphs = payload?.graphs ?? {};
  const graph = Object.hasOwn(graphs, decoded) ? graphs[decoded] : null;
  if (!graph) {
    return NextResponse.json(
      { error: "run graph not found" },
      { status: 404, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
  }

  return NextResponse.json(graph, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
