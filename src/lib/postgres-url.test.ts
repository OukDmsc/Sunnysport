import { describe, expect, it } from "vitest";
import { getRuntimeDatasourceUrl, withPgBouncerForTransactionPooler } from "./postgres-url";

describe("Supabase transaction pooler URL compatibility", () => {
  it("adds the Prisma pgbouncer flag to transaction-pooler URLs", () => {
    const result = new URL(withPgBouncerForTransactionPooler(
      "postgresql://user:password@pooler.example.test:6543/database?schema=public",
    ));

    expect(result.port).toBe("6543");
    expect(result.searchParams.get("pgbouncer")).toBe("true");
    expect(result.searchParams.get("schema")).toBe("public");
  });

  it("preserves direct PostgreSQL connection URLs", () => {
    const directUrl = "postgresql://user:password@db.example.test:5432/database?schema=public";
    expect(withPgBouncerForTransactionPooler(directUrl)).toBe(directUrl);
  });

  it("does not rewrite local SQLite URLs", () => {
    expect(withPgBouncerForTransactionPooler("file:./dev.db")).toBe("file:./dev.db");
  });

  it("uses the local SQLite database in development regardless of a conflicting environment URL", () => {
    expect(getRuntimeDatasourceUrl("development", "postgresql://not-used.example:6543/database"))
      .toBe("file:./dev.db");
  });

  it("uses only the production DATABASE_URL and applies pooler compatibility", () => {
    const result = getRuntimeDatasourceUrl(
      "production",
      "postgresql://pooler.example.test:6543/database?schema=public",
    );
    expect(result && new URL(result).searchParams.get("pgbouncer")).toBe("true");
  });

  it("does not configure a datasource override outside local development and production", () => {
    expect(getRuntimeDatasourceUrl("test", "file:./test.db")).toBeUndefined();
  });
});
