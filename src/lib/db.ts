import { PrismaClient } from "@prisma/client";
import { getRuntimeDatasourceUrl } from "./postgres-url";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const datasourceUrl = getRuntimeDatasourceUrl(process.env.NODE_ENV, process.env.DATABASE_URL);
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
