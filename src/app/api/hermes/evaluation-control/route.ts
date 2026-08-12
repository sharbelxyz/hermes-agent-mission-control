import { NextResponse } from "next/server";
import {
  collectLangfuseEvaluationControl,
  parseEvaluationWindow,
  type LangfuseEvaluationControl,
} from "@/lib/langfuse-evaluation-control";
import type { ObservabilityWindow } from "@/lib/langfuse-observability";

const CACHE_MS = 7000;

const cache = new Map<
  ObservabilityWindow,
  {
    expiresAt: number;
    payload: LangfuseEvaluationControl;
  }
>();

export async function GET(req: Request) {
  const url = new URL(req.url);
  const window = parseEvaluationWindow(url.searchParams.get("window") ?? "24h");

  if (!window) {
    return NextResponse.json(
      { error: "Invalid window. Use 24h or 7d." },
      { status: 400 },
    );
  }

  const now = Date.now();
  const cached = cache.get(window);
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached.payload);
  }

  const payload = await collectLangfuseEvaluationControl(window);
  cache.set(window, {
    expiresAt: now + CACHE_MS,
    payload,
  });

  return NextResponse.json(payload);
}
