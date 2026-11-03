export function withPgBouncerForTransactionPooler(connectionString: string) {
  try {
    const url = new URL(connectionString);
    if (url.port !== "6543") return connectionString;
    url.searchParams.set("pgbouncer", "true");
    return url.toString();
  } catch {
    return connectionString;
  }
}
