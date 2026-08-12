import "server-only";

import { NextResponse } from "next/server";

const INTERNAL_SECRET_HEADER = "x-internal-secret";

export function requireInternalApiSecret(req: Request) {
  const expected = process.env.INTERNAL_API_SECRET;
  const actual = req.headers.get(INTERNAL_SECRET_HEADER);

  if (!expected || actual !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
