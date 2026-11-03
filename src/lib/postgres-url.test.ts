import { describe, expect, it } from "vitest";
import { withPgBouncerForTransactionPooler } from "./postgres-url";

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
});
