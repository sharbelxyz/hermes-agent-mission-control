import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client, Pool } from "pg";
import {
  createPrismaPgPoolConfig,
  getPrismaClient,
  normalizePrismaDatabaseUrl,
  PRISMA_PG_CONNECTION_TIMEOUT_MILLIS,
  PRISMA_PG_IDLE_TIMEOUT_MILLIS,
  PRISMA_PG_POOL_MAX,
  resolvePrismaSchema,
  usesSupabaseSharedPoolerTlsCompatibility,
} from "../src/lib/prisma.ts";

const secretUsername = "pool_user";
const secretPassword = "super-secret-password";
const originalDatabaseUrl = process.env.DATABASE_URL;

type PgClientWithConnectionParameters = Client & {
  connectionParameters: {
    host: string;
    ssl: unknown;
  };
};

const prismaGlobals = globalThis as typeof globalThis & {
  prisma?: { $disconnect: () => Promise<void> };
  prismaPgPool?: {
    end: () => Promise<void>;
    emit: (event: "error", error: Error) => boolean;
    listenerCount: (event: "error") => number;
    options?: {
      allowExitOnIdle?: boolean;
      connectionString?: string;
      connectionTimeoutMillis?: number;
      idleTimeoutMillis?: number | null;
      max?: number;
      ssl?: unknown;
    };
  };
};

async function resetPrismaGlobals() {
  await prismaGlobals.prisma?.$disconnect().catch(() => undefined);
  await prismaGlobals.prismaPgPool?.end().catch(() => undefined);
  delete prismaGlobals.prisma;
  delete prismaGlobals.prismaPgPool;
}

test.after(async () => {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }

  await resetPrismaGlobals();
});

test("returns undefined when DATABASE_URL is absent", () => {
  assert.equal(normalizePrismaDatabaseUrl(undefined), undefined);
});

test("adds connection_limit=1 while preserving credentials and existing query params", () => {
  const original = new URL(
    `postgresql://${secretUsername}:${secretPassword}@db.example.com:5432/app?sslmode=require&schema=public`,
  );

  const normalized = normalizePrismaDatabaseUrl(original.toString());

  assert.ok(normalized);
  const parsed = new URL(normalized);
  assert.equal(parsed.protocol, original.protocol);
  assert.equal(parsed.host, original.host);
  assert.equal(parsed.pathname, original.pathname);
  assert.equal(parsed.username, original.username);
  assert.equal(parsed.password, original.password);
  assert.equal(parsed.searchParams.get("sslmode"), "require");
  assert.equal(parsed.searchParams.get("schema"), "public");
  assert.equal(parsed.searchParams.get("connection_limit"), "1");
});

test("preserves an explicit operator connection_limit", () => {
  const original = new URL(
    `postgres://${secretUsername}:${secretPassword}@db.example.com/app?connection_limit=7&sslmode=require`,
  );

  const normalized = normalizePrismaDatabaseUrl(original.toString());

  assert.ok(normalized);
  const parsed = new URL(normalized);
  assert.equal(parsed.searchParams.get("connection_limit"), "7");
  assert.equal(parsed.searchParams.get("sslmode"), "require");
  assert.equal(parsed.searchParams.getAll("connection_limit").length, 1);
});

test("leaves unparsable URLs on Prisma's standard error path", () => {
  const invalidUrl = "not a database url";

  assert.equal(normalizePrismaDatabaseUrl(invalidUrl), invalidUrl);
});

test("does not print or log database credentials while normalizing", () => {
  const original = new URL(`postgresql://${secretUsername}:${secretPassword}@db.example.com/app`);
  const messages: string[] = [];
  const originalConsole = {
    error: console.error,
    info: console.info,
    log: console.log,
    warn: console.warn,
  };

  console.error = (...args: unknown[]) => messages.push(args.map(String).join(" "));
  console.info = (...args: unknown[]) => messages.push(args.map(String).join(" "));
  console.log = (...args: unknown[]) => messages.push(args.map(String).join(" "));
  console.warn = (...args: unknown[]) => messages.push(args.map(String).join(" "));

  try {
    normalizePrismaDatabaseUrl(original.toString());
  } finally {
    console.error = originalConsole.error;
    console.info = originalConsole.info;
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
  }

  const output = messages.join("\n");
  assert.equal(output.includes(secretUsername), false);
  assert.equal(output.includes(secretPassword), false);
});

test("detects only Supabase shared-pooler URLs that need TLS compatibility mode", () => {
  const allowedHost =
    `postgresql://${secretUsername}:${secretPassword}@aws-0-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true`;
  const nestedAllowedHost =
    `postgresql://${secretUsername}:${secretPassword}@db.aws-0-us-west-1.pooler.supabase.com:6543/postgres?PgBouncer=TRUE`;

  assert.equal(
    usesSupabaseSharedPoolerTlsCompatibility(normalizePrismaDatabaseUrl(allowedHost) ?? ""),
    true,
  );
  assert.equal(
    usesSupabaseSharedPoolerTlsCompatibility(normalizePrismaDatabaseUrl(nestedAllowedHost) ?? ""),
    true,
  );
  assert.equal(
    usesSupabaseSharedPoolerTlsCompatibility(
      `postgresql://${secretUsername}:${secretPassword}@pooler.supabase.com:6543/postgres?pgbouncer=true`,
    ),
    false,
  );
  assert.equal(
    usesSupabaseSharedPoolerTlsCompatibility(
      `postgresql://${secretUsername}:${secretPassword}@aws-0-us-west-1.pooler.supabase.com.evil.test:6543/postgres?pgbouncer=true`,
    ),
    false,
  );
  assert.equal(
    usesSupabaseSharedPoolerTlsCompatibility(
      `postgresql://${secretUsername}:${secretPassword}@aws-0-us-west-1-pooler.supabase.com:6543/postgres?pgbouncer=true`,
    ),
    false,
  );
  assert.equal(
    usesSupabaseSharedPoolerTlsCompatibility(
      `postgresql://${secretUsername}:${secretPassword}@aws-0-us-west-1.pooler.supabase.com:5432/postgres?pgbouncer=true`,
    ),
    true,
  );
  assert.equal(
    usesSupabaseSharedPoolerTlsCompatibility(
      `postgresql://${secretUsername}:${secretPassword}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`,
    ),
    false,
  );
  assert.equal(
    usesSupabaseSharedPoolerTlsCompatibility(
      `postgresql://${secretUsername}:${secretPassword}@aws-0-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=false`,
    ),
    false,
  );
  assert.equal(
    usesSupabaseSharedPoolerTlsCompatibility(
      `postgresql://${secretUsername}:${secretPassword}@db.example.com:6543/postgres?pgbouncer=true`,
    ),
    false,
  );
  assert.equal(
    usesSupabaseSharedPoolerTlsCompatibility(
      `postgresql://${secretUsername}:${secretPassword}@aws-0-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true&host=db.example.com`,
    ),
    false,
  );
  assert.equal(
    usesSupabaseSharedPoolerTlsCompatibility(
      `postgresql://${secretUsername}:${secretPassword}@aws-0-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=verify-full`,
    ),
    false,
  );
  assert.equal(
    usesSupabaseSharedPoolerTlsCompatibility(
      `postgresql://${secretUsername}:***@aws-0-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslrootcert=/tmp/operator-ca.pem`,
    ),
    false,
  );
  // Regression: a `port` query param can override the authority :6543 port
  // after the scope check in pg-connection-string. Must NOT be treated as the
  // shared pooler (would disable cert verification on an off-pooler endpoint).
  assert.equal(
    usesSupabaseSharedPoolerTlsCompatibility(
      `postgresql://${secretUsername}:***@aws-0-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true&port=5432`,
    ),
    false,
  );
  assert.equal(
    createPrismaPgPoolConfig(
      `postgresql://${secretUsername}:***@aws-0-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true&port=5432`,
    ).ssl,
    undefined,
  );
  // Session-mode pooler (:5432 + sslmode=require, no pgbouncer flag) — the
  // real production shape. Must be treated as shared-pooler compat.
  assert.equal(
    usesSupabaseSharedPoolerTlsCompatibility(
      `postgresql://${secretUsername}:${secretPassword}@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres?schema=hermy_hq&sslmode=require`,
    ),
    true,
  );
  assert.deepEqual(
    createPrismaPgPoolConfig(
      `postgresql://${secretUsername}:${secretPassword}@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres?schema=hermy_hq&sslmode=require`,
    ).ssl,
    { rejectUnauthorized: false },
  );
  // A bare pooler URL with no compatibility signal must NOT be downgraded.
  assert.equal(
    usesSupabaseSharedPoolerTlsCompatibility(
      `postgresql://${secretUsername}:${secretPassword}@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`,
    ),
    false,
  );
  // Session-mode host with operator verify-full still disables compat.
  assert.equal(
    usesSupabaseSharedPoolerTlsCompatibility(
      `postgresql://${secretUsername}:${secretPassword}@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=verify-full`,
    ),
    false,
  );
});

test("Supabase pooler TLS compatibility detection does not log URL details", () => {
  const databaseUrl =
    `postgresql://${secretUsername}:${secretPassword}@aws-0-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true`;
  const messages: string[] = [];
  const originalConsole = {
    error: console.error,
    info: console.info,
    log: console.log,
    warn: console.warn,
  };

  console.error = (...args: unknown[]) => messages.push(args.map(String).join(" "));
  console.info = (...args: unknown[]) => messages.push(args.map(String).join(" "));
  console.log = (...args: unknown[]) => messages.push(args.map(String).join(" "));
  console.warn = (...args: unknown[]) => messages.push(args.map(String).join(" "));

  try {
    usesSupabaseSharedPoolerTlsCompatibility(databaseUrl);
    createPrismaPgPoolConfig(databaseUrl);
  } finally {
    console.error = originalConsole.error;
    console.info = originalConsole.info;
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
  }

  const output = messages.join("\n");
  assert.equal(output.includes(secretUsername), false);
  assert.equal(output.includes(secretPassword), false);
  assert.equal(output.includes("aws-0-us-west-1.pooler.supabase.com"), false);
  assert.equal(output.includes("postgresql://"), false);
});

test("pg pool config is bounded for serverless and does not depend on connection_limit", () => {
  const databaseUrl = `postgresql://${secretUsername}:${secretPassword}@db.example.com:6543/postgres?pgbouncer=true&connection_limit=7`;

  const config = createPrismaPgPoolConfig(databaseUrl);

  assert.equal(PRISMA_PG_POOL_MAX, 1);
  assert.equal(PRISMA_PG_IDLE_TIMEOUT_MILLIS, 3_000);
  assert.equal(PRISMA_PG_CONNECTION_TIMEOUT_MILLIS, 2_000);
  assert.equal(config.connectionString, databaseUrl);
  assert.equal(config.max, 1);
  assert.equal(config.idleTimeoutMillis, 3_000);
  assert.equal(config.connectionTimeoutMillis, 2_000);
  assert.equal(config.allowExitOnIdle, true);
  assert.equal("ssl" in config, false);
});

test("pg pool config sets TLS compatibility only for Supabase shared-pooler URLs", () => {
  const allowedUrl =
    `postgresql://${secretUsername}:${secretPassword}@aws-0-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1`;
  const rejectedUrls = [
    `postgresql://${secretUsername}:${secretPassword}@aws-0-us-west-1.pooler.supabase.com.evil.test:6543/postgres?pgbouncer=true`,
    `postgresql://${secretUsername}:${secretPassword}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`,
    `postgresql://${secretUsername}:${secretPassword}@aws-0-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=false`,
    `postgresql://${secretUsername}:${secretPassword}@db.example.com:6543/postgres?pgbouncer=true`,
  ];

  assert.deepEqual(createPrismaPgPoolConfig(allowedUrl).ssl, { rejectUnauthorized: false });

  for (const rejectedUrl of rejectedUrls) {
    assert.equal("ssl" in createPrismaPgPoolConfig(rejectedUrl), false);
  }
});

test("pg pool compatibility sanitizes URL SSL overrides before pg parses clients", async () => {
  const databaseUrl =
    `postgresql://${secretUsername}:${secretPassword}@aws-0-us-west-1.pooler.supabase.com:6543/postgres` +
    `?pgbouncer=true&connection_limit=1&schema=public&sslmode=require&uselibpqcompat=true&ssl=0`;

  const config = createPrismaPgPoolConfig(databaseUrl);
  const sanitized = new URL(config.connectionString ?? "");

  assert.deepEqual(config.ssl, { rejectUnauthorized: false });
  assert.equal(sanitized.searchParams.get("pgbouncer"), "true");
  assert.equal(sanitized.searchParams.get("connection_limit"), "1");
  assert.equal(sanitized.searchParams.get("schema"), "public");
  assert.equal(sanitized.searchParams.has("sslmode"), false);
  assert.equal(sanitized.searchParams.has("uselibpqcompat"), false);
  assert.equal(sanitized.searchParams.has("ssl"), false);

  const pool = new Pool(config);
  try {
    const client = new Client(pool.options) as PgClientWithConnectionParameters;

    assert.deepEqual(pool.options.ssl, { rejectUnauthorized: false });
    assert.equal(pool.options.connectionString, config.connectionString);
    assert.deepEqual(client.connectionParameters.ssl, { rejectUnauthorized: false });
    assert.equal(client.connectionParameters.host, "aws-0-us-west-1.pooler.supabase.com");
  } finally {
    await pool.end();
  }
});

test("pg pool compatibility rejects query host spoofing and leaves pg host override visible", async () => {
  const databaseUrl =
    `postgresql://${secretUsername}:${secretPassword}@aws-0-us-west-1.pooler.supabase.com:6543/postgres` +
    `?pgbouncer=true&connection_limit=1&host=db.example.com&sslmode=verify-full`;
  const config = createPrismaPgPoolConfig(databaseUrl);

  assert.equal("ssl" in config, false);
  assert.equal(config.connectionString, databaseUrl);

  const pool = new Pool(config);
  try {
    const client = new Client(pool.options) as PgClientWithConnectionParameters;

    assert.equal(pool.options.ssl, undefined);
    assert.equal(client.connectionParameters.host, "db.example.com");
    assert.deepEqual(client.connectionParameters.ssl, {});
  } finally {
    await pool.end();
  }
});

test("pg pool config preserves explicit verify-full rootcert operator verification", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "prisma-pg-rootcert-"));
  const rootCertPath = path.join(tempDir, "root-ca.pem");
  await fs.writeFile(rootCertPath, "operator root certificate\n", "utf8");

  try {
    const url = new URL(
      `postgresql://${secretUsername}:${secretPassword}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`,
    );
    url.searchParams.set("pgbouncer", "true");
    url.searchParams.set("connection_limit", "1");
    url.searchParams.set("sslmode", "verify-full");
    url.searchParams.set("sslrootcert", rootCertPath);
    url.searchParams.set("uselibpqcompat", "true");

    const databaseUrl = url.toString();
    const config = createPrismaPgPoolConfig(databaseUrl);

    assert.equal("ssl" in config, false);
    assert.equal(config.connectionString, databaseUrl);

    const pool = new Pool(config);
    try {
      const client = new Client(pool.options) as PgClientWithConnectionParameters;
      const ssl = client.connectionParameters.ssl;

      assert.equal(pool.options.ssl, undefined);
      assert.equal(typeof ssl, "object");
      assert.ok(ssl);
      assert.equal((ssl as { ca?: string }).ca, "operator root certificate\n");
      assert.equal("rejectUnauthorized" in (ssl as Record<string, unknown>), false);
    } finally {
      await pool.end();
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("reuses one global pg Pool and one global PrismaClient when DATABASE_URL exists", async () => {
  await resetPrismaGlobals();
  process.env.DATABASE_URL =
    `postgresql://${secretUsername}:${secretPassword}@db.example.com:6543/postgres?pgbouncer=true&connection_limit=7`;

  const first = getPrismaClient();
  const second = getPrismaClient();

  assert.equal(first, second);
  assert.ok(prismaGlobals.prismaPgPool);
  assert.equal(prismaGlobals.prisma, first);
  assert.equal(prismaGlobals.prismaPgPool.options?.max, 1);
  assert.equal(prismaGlobals.prismaPgPool.options?.idleTimeoutMillis, 3_000);
  assert.equal(prismaGlobals.prismaPgPool.options?.connectionTimeoutMillis, 2_000);
  assert.equal(prismaGlobals.prismaPgPool.options?.allowExitOnIdle, true);
  assert.match(prismaGlobals.prismaPgPool.options?.connectionString ?? "", /connection_limit=7/);

  await resetPrismaGlobals();
});

test("requires DATABASE_URL before creating the client engine PrismaClient", async () => {
  await resetPrismaGlobals();
  delete process.env.DATABASE_URL;

  assert.throws(() => getPrismaClient(), /DATABASE_URL is required for Prisma client engine/);
  assert.equal(prismaGlobals.prisma, undefined);
  assert.equal(prismaGlobals.prismaPgPool, undefined);

  await resetPrismaGlobals();
});

test("does not print database credentials while building the adapter-backed client", async () => {
  await resetPrismaGlobals();
  process.env.DATABASE_URL = `postgresql://${secretUsername}:${secretPassword}@db.example.com/postgres`;

  const messages: string[] = [];
  const originalConsole = {
    error: console.error,
    info: console.info,
    log: console.log,
    warn: console.warn,
  };

  console.error = (...args: unknown[]) => messages.push(args.map(String).join(" "));
  console.info = (...args: unknown[]) => messages.push(args.map(String).join(" "));
  console.log = (...args: unknown[]) => messages.push(args.map(String).join(" "));
  console.warn = (...args: unknown[]) => messages.push(args.map(String).join(" "));

  try {
    getPrismaClient();
  } finally {
    console.error = originalConsole.error;
    console.info = originalConsole.info;
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
  }

  const output = messages.join("\n");
  assert.equal(output.includes(secretUsername), false);
  assert.equal(output.includes(secretPassword), false);

  await resetPrismaGlobals();
});

test("Prisma generator uses client engine mode without dropping binary targets", async () => {
  const schema = await fs.readFile(path.join(process.cwd(), "prisma/schema.prisma"), "utf8");

  assert.match(schema, /generator client\s*{[\s\S]*?provider\s*=\s*"prisma-client-js"/);
  assert.match(
    schema,
    /generator client\s*{[\s\S]*?binaryTargets\s*=\s*\["native", "linux-arm64-openssl-3\.0\.x"\]/,
  );
  assert.match(schema, /generator client\s*{[\s\S]*?engineType\s*=\s*"client"/);
});

test("global pg Pool has one safe error listener and does not leak credentials", async () => {
  await resetPrismaGlobals();
  process.env.DATABASE_URL =
    `postgresql://${secretUsername}:${secretPassword}@db.example.com:6543/postgres?pgbouncer=true`;

  getPrismaClient();
  getPrismaClient();

  const pool = prismaGlobals.prismaPgPool;
  assert.ok(pool);
  assert.equal(pool.listenerCount("error"), 1);

  const messages: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => messages.push(args);

  try {
    const error = new Error(
      `connection failed for postgresql://${secretUsername}:${secretPassword}@db.example.com:6543/postgres`,
    ) as Error & { code?: string };
    error.code = `bad-${secretPassword}`;

    assert.equal(pool.emit("error", error), true);
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(pool.listenerCount("error"), 1);
  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.[0], "Prisma pg pool error");
  assert.deepEqual(messages[0]?.[1], { class: "Error", code: undefined });

  const output = JSON.stringify(messages);
  assert.equal(output.includes(secretUsername), false);
  assert.equal(output.includes(secretPassword), false);
  assert.equal(output.includes("db.example.com"), false);
  assert.equal(output.includes("connection failed"), false);
  assert.equal(output.includes("postgresql://"), false);

  await resetPrismaGlobals();
});

test("Prisma source uses adapter-backed pg Pool and cache clear keeps the shared client", async () => {
  const sourcePath = path.join(process.cwd(), "src/lib/prisma.ts");
  const routePath = path.join(process.cwd(), "src/app/api/cache/clear/route.ts");
  const [source, route] = await Promise.all([
    fs.readFile(sourcePath, "utf8"),
    fs.readFile(routePath, "utf8"),
  ]);

  assert.match(source, /normalizePrismaDatabaseUrl\(process\.env\.DATABASE_URL\)/);
  assert.match(source, /if \(!databaseUrl\)\s*{\s*throw new Error\(["']DATABASE_URL is required for Prisma client engine["']\);\s*}/);
  assert.match(source, /new Pool\(createPrismaPgPoolConfig\(databaseUrl\)\)/);
  assert.match(source, /pool\.on\(["']error["'], logPrismaPgPoolError\)/);
  assert.match(source, /new PrismaPg\(getPrismaPgPool\(databaseUrl\), \{\s*schema: resolvePrismaSchema\(databaseUrl\),\s*\}\)/);
  assert.match(source, /new PrismaClient\(\{ adapter \}\)/);
  assert.match(source, /export const prisma = createLazyPrismaClient\(\);/);
  assert.match(source, /prismaPgPool: Pool \| undefined/);
  assert.doesNotMatch(source, /datasources:/);
  assert.doesNotMatch(source, /name:\s*["'`]/);
  assert.doesNotMatch(source, /NODE_ENV !== ["']production["']/);
  assert.doesNotMatch(route, /new PrismaClient\(/);
  assert.doesNotMatch(route, /from ["']@prisma\/client["']/);
  assert.match(route, /import { prisma } from ["']@\/lib\/prisma["']/);
});


test("resolvePrismaSchema extracts a valid schema from the URL, else public", () => {
  assert.equal(
    resolvePrismaSchema(
      `postgresql://${secretUsername}:${secretPassword}@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres?schema=hermy_hq&sslmode=require`,
    ),
    "hermy_hq",
  );
  assert.equal(resolvePrismaSchema(`postgresql://${secretUsername}:${secretPassword}@db.example.com:5432/app`), "public");
  assert.equal(resolvePrismaSchema(undefined), "public");
  // reject injection / invalid identifiers -> fall back to public
  assert.equal(
    resolvePrismaSchema(
      `postgresql://${secretUsername}:${secretPassword}@db.example.com:5432/app?schema=${encodeURIComponent("evil;DROP TABLE x")}`,
    ),
    "public",
  );
  // normalize must preserve the schema param
  assert.equal(
    normalizePrismaDatabaseUrl(
      `postgresql://${secretUsername}:${secretPassword}@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres?schema=hermy_hq&sslmode=require`,
    )?.includes("schema=hermy_hq"),
    true,
  );
});
