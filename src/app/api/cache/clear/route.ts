import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;
const CACHE_KEYS = ['notion_clients_monthly', 'mcf_monthly', 'ltv_monthly'];

export async function POST(req: Request) {
  const secret = req.headers.get('x-internal-secret');
  if (secret !== INTERNAL_SECRET) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const results = await Promise.all(
    CACHE_KEYS.map(key => prisma.dataStore.delete({ where: { key } }).then(() => ({ key, cleared: true })).catch(() => ({ key, cleared: false })))
  );
  return NextResponse.json({ results });
}

// Also allow GET with secret query param for convenience
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret') || req.headers.get('x-internal-secret');
  if (secret !== INTERNAL_SECRET) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const results = await Promise.all(
    CACHE_KEYS.map(key => prisma.dataStore.delete({ where: { key } }).then(() => ({ key, cleared: true })).catch(() => ({ key, cleared: false })))
  );
  return NextResponse.json({ results });
}
