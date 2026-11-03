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

export function getRuntimeDatasourceUrl(
  nodeEnvironment: string | undefined,
  databaseUrl: string | undefined,
) {
  if (nodeEnvironment === "development") return "file:./dev.db";
  if (nodeEnvironment === "production" && databaseUrl) {
    return withPgBouncerForTransactionPooler(databaseUrl);
  }
  return undefined;
}
