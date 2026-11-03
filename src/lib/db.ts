import { PrismaClient } from "@prisma/client";
import { withPgBouncerForTransactionPooler } from "./postgres-url";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function productionDatasourceUrl() {
  const configuredUrl = process.env.DATABASE_URL;
  if (process.env.NODE_ENV !== "production" || !configuredUrl) return undefined;
  return withPgBouncerForTransactionPooler(configuredUrl);
}

const datasourceUrl = productionDatasourceUrl();
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
