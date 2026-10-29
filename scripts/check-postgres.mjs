import { PrismaClient } from "@prisma/client";

let failed = false;

function getErrorSummary(error) {
  if (!error || typeof error !== "object") return "Error";

  const name = "name" in error && typeof error.name === "string" ? error.name : "Error";
  const message = "message" in error && typeof error.message === "string"
    ? error.message
    : "";
  const code =
    "code" in error && typeof error.code === "string"
      ? error.code
      : "errorCode" in error && typeof error.errorCode === "string"
        ? error.errorCode
        : message.match(/\bP\d{4}\b/)?.[0] ?? "";

  if (code) return `${name} (${code})`;

  const normalizedMessage = message.toLowerCase();
  if (/environment variable not found/.test(normalizedMessage)) {
    return `${name} (missing database environment variable)`;
  }
  if (/authentication failed|password authentication failed/.test(normalizedMessage)) {
    return `${name} (database authentication rejected)`;
  }
  if (/timed out|timeout|can't reach|could not connect|connection refused/.test(normalizedMessage)) {
    return `${name} (database connection failed)`;
  }
  if (/ssl|tls|certificate/.test(normalizedMessage)) {
    return `${name} (database TLS negotiation failed)`;
  }
  if (/invalid.*(url|port)|connection string/.test(normalizedMessage)) {
    return `${name} (invalid database URL)`;
  }

  return name;
}

for (const variableName of ["DATABASE_URL", "DIRECT_URL"]) {
  const connectionString = process.env[variableName];
  if (!connectionString) {
    console.error(`PostgreSQL preflight failed: ${variableName} is missing.`);
    failed = true;
    continue;
  }

  let port = "unknown";
  try {
    port = new URL(connectionString).port || "default";
  } catch {
    console.error(`PostgreSQL preflight failed: ${variableName} is not a valid URL.`);
    failed = true;
    continue;
  }
  console.log(`${variableName} is configured; port=${port}.`);

  const prisma = new PrismaClient({
    datasources: { db: { url: connectionString } },
  });

  try {
    const rows = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS count
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name <> '_prisma_migrations'
    `;
    const tableCount = rows[0]?.count;

    if (typeof tableCount !== "number") {
      console.error(`${variableName} preflight returned an unexpected result.`);
      failed = true;
    } else if (tableCount === 0) {
      console.log(`${variableName} preflight passed; public schema has no application tables.`);
    } else {
      const migrationTable = await prisma.$queryRaw`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = '_prisma_migrations'
        ) AS exists
      `;
      const hasMigrationTable = migrationTable[0]?.exists;

      if (typeof hasMigrationTable !== "boolean") {
        console.error(`${variableName} preflight returned an unexpected migration state.`);
        failed = true;
      } else if (!hasMigrationTable) {
        console.error(
          `${variableName} migration stopped: public schema contains application tables without Prisma migration history.`,
        );
        failed = true;
      } else {
        const migrationState = await prisma.$queryRaw`
          SELECT
            COUNT(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::int AS applied_count,
            COUNT(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::int AS failed_count
          FROM public."_prisma_migrations"
        `;
        const appliedCount = migrationState[0]?.applied_count;
        const failedCount = migrationState[0]?.failed_count;

        if (typeof appliedCount !== "number" || typeof failedCount !== "number") {
          console.error(`${variableName} preflight returned an unexpected migration history.`);
          failed = true;
        } else if (failedCount !== 0) {
          console.error(`${variableName} migration stopped: Prisma migration history contains failed migrations.`);
          failed = true;
        } else if (appliedCount === 0) {
          console.error(
            `${variableName} migration stopped: public schema contains application tables without successful Prisma migration history.`,
          );
          failed = true;
        } else {
          console.log(`${variableName} preflight passed; public schema is tracked by Prisma migrations.`);
        }
      }
    }
  } catch (error) {
    console.error(`${variableName} preflight failed (${getErrorSummary(error)}).`);
    failed = true;
  }

  try {
    await prisma.$disconnect();
  } catch (error) {
    console.error(`${variableName} disconnect failed (${getErrorSummary(error)}).`);
    failed = true;
  }
}

if (failed) process.exit(1);
