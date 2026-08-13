import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool, type PoolConfig } from "pg";

export const PRISMA_PG_POOL_MAX = 1;
export const PRISMA_PG_IDLE_TIMEOUT_MILLIS = 3_000;
export const PRISMA_PG_CONNECTION_TIMEOUT_MILLIS = 2_000;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaPgPool: Pool | undefined;
};

const SAFE_ERROR_CLASS = /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/;
const SAFE_ERROR_CODE = /^(?:[A-Z0-9]{5}|E[A-Z0-9_]{1,31})$/;
const SUPABASE_SHARED_POOLER_HOST_SUFFIX = ".pooler.supabase.com";
const PG_SSL_QUERY_PARAMS = new Set(["ssl", "sslmode", "uselibpqcompat"]);
const PG_OPERATOR_TLS_MATERIAL_PARAMS = new Set(["sslcert", "sslkey", "sslrootcert"]);
const PG_OPERATOR_VERIFY_SSLMODES = new Set(["verify-ca", "verify-full"]);
const PG_COMPATIBLE_SSLMODES = new Set(["require", "prefer", "no-verify"]);

export function normalizePrismaDatabaseUrl(databaseUrl: string | undefined): string | undefined {
  if (!databaseUrl) return undefined;

  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return databaseUrl;
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    return databaseUrl;
  }

  if (!url.searchParams.has("connection_limit")) {
    url.searchParams.append("connection_limit", "1");
  }

  return url.toString();
}

// Prisma's `?schema=` URL param configures the ORM's table qualification, but
// the @prisma/adapter-pg raw Pool ignores it. Extract it so we can pass it to
// PrismaPg via `{ schema }`, which makes Prisma qualify ORM-generated SQL as
// "<schema>"."Table" (e.g. "hermy_hq"."DataStore") instead of defaulting to
// "public". NOTE: this sets ORM table qualification only — it does NOT emit
// `SET search_path`, so any unqualified `$queryRaw`/`$executeRaw` would still
// resolve against the connection's default search_path. The app is pure ORM
// today; if raw SQL is added later, qualify it or set search_path at the driver.
// Falls back to "public" when unset or invalid.
export function resolvePrismaSchema(databaseUrl: string | undefined): string {
  if (!databaseUrl) return "public";
  try {
    const url = new URL(databaseUrl);
    const schema = url.searchParams.get("schema");
    if (schema && /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/.test(schema)) {
      return schema;
    }
  } catch {
    // fall through
  }
  return "public";
}

export function usesSupabaseSharedPoolerTlsCompatibility(databaseUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return false;
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    return false;
  }

  if (!url.hostname.endsWith(SUPABASE_SHARED_POOLER_HOST_SUFFIX)) {
    return false;
  }

  if (url.hostname.slice(0, -SUPABASE_SHARED_POOLER_HOST_SUFFIX.length).length === 0) {
    return false;
  }

  // Supabase pooler runs in two modes:
  //   - transaction mode on :6543 (used with pgbouncer=true)
  //   - session mode on :5432 (used with sslmode=require)
  // Both present the same shared-pooler cert chain that `pg` rejects under
  // default verify-full. Only these two authority ports are in scope.
  if (url.port !== "6543" && url.port !== "5432") {
    return false;
  }

  let hasPgbouncer = false;
  let hasCompatibleSslmode = false;
  for (const [key, value] of url.searchParams) {
    const normalizedKey = key.toLowerCase();
    const normalizedValue = value.toLowerCase();

    if (normalizedKey === "host") {
      return false;
    }

    // pg-connection-string lets a `port` query param override the authority
    // port AFTER this scope check, which could move the connection off the
    // shared pooler while still disabling cert verification. Reject it.
    if (normalizedKey === "port") {
      return false;
    }

    if (PG_OPERATOR_TLS_MATERIAL_PARAMS.has(normalizedKey)) {
      return false;
    }

    if (normalizedKey === "sslmode") {
      if (
        PG_OPERATOR_VERIFY_SSLMODES.has(normalizedValue) ||
        !PG_COMPATIBLE_SSLMODES.has(normalizedValue)
      ) {
        return false;
      }
      hasCompatibleSslmode = true;
    }

    if (normalizedKey === "pgbouncer" && normalizedValue === "true") {
      hasPgbouncer = true;
    }
  }

  // Require a positive shared-pooler signal so a bare pooler URL with no
  // compatibility hint is not silently downgraded:
  //   - transaction mode: pgbouncer=true (typically on :6543)
  //   - session mode: an explicit compatible sslmode=require (typically :5432)
  return hasPgbouncer || hasCompatibleSslmode;
}

function removeSupabaseSharedPoolerTlsCompatibilityQueryParams(databaseUrl: string): string {
  const url = new URL(databaseUrl);

  for (const key of Array.from(url.searchParams.keys())) {
    if (PG_SSL_QUERY_PARAMS.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }

  return url.toString();
}

export function createPrismaPgPoolConfig(databaseUrl: string): PoolConfig {
  const usesTlsCompatibility = usesSupabaseSharedPoolerTlsCompatibility(databaseUrl);
  const config: PoolConfig = {
    connectionString: usesTlsCompatibility
      ? removeSupabaseSharedPoolerTlsCompatibilityQueryParams(databaseUrl)
      : databaseUrl,
    max: PRISMA_PG_POOL_MAX,
    // Release idle serverless sessions quickly while avoiding churn inside a short warm-runtime burst.
    idleTimeoutMillis: PRISMA_PG_IDLE_TIMEOUT_MILLIS,
    connectionTimeoutMillis: PRISMA_PG_CONNECTION_TIMEOUT_MILLIS,
    allowExitOnIdle: true,
  };

  if (usesTlsCompatibility) {
    // Supabase shared-pooler compatibility mode: encrypted TLS without certificate verification,
    // equivalent to libpq sslmode=require. Project-specific CA/verify-full is preferred follow-up.
    config.ssl = { rejectUnauthorized: false };
  }

  return config;
}

function safePrismaPgPoolErrorToken(value: unknown): string | undefined {
  if (typeof value !== "string" || !SAFE_ERROR_CLASS.test(value)) {
    return undefined;
  }

  return value;
}

function safePrismaPgPoolErrorCode(value: unknown): string | undefined {
  if (typeof value !== "string" || !SAFE_ERROR_CODE.test(value)) {
    return undefined;
  }

  return value;
}

function logPrismaPgPoolError(error: Error & { code?: unknown }) {
  const safeError = {
    class: safePrismaPgPoolErrorToken(error.constructor.name) ?? "Error",
    code: safePrismaPgPoolErrorCode(error.code),
  };

  console.warn("Prisma pg pool error", safeError);
}

function getPrismaPgPool(databaseUrl: string) {
  if (!globalForPrisma.prismaPgPool) {
    const pool = new Pool(createPrismaPgPoolConfig(databaseUrl));
    pool.on("error", logPrismaPgPoolError);
    globalForPrisma.prismaPgPool = pool;
  }

  return globalForPrisma.prismaPgPool;
}

export function createPrismaClient() {
  const databaseUrl = normalizePrismaDatabaseUrl(process.env.DATABASE_URL);

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for Prisma client engine");
  }

  const adapter = new PrismaPg(getPrismaPgPool(databaseUrl), {
    schema: resolvePrismaSchema(databaseUrl),
  });
  return new PrismaClient({ adapter });
}

export function getPrismaClient() {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }

  return globalForPrisma.prisma;
}

function createLazyPrismaClient() {
  return new Proxy({} as PrismaClient, {
    get(_target, property) {
      const client = getPrismaClient();
      const value = Reflect.get(client, property, client);

      return typeof value === "function" ? value.bind(client) : value;
    },
  });
}

export const prisma = createLazyPrismaClient();
