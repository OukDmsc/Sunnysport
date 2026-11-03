export function safeErrorDetails(error: unknown) {
  const name = error instanceof Error && /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(error.name)
    ? error.name
    : "UnknownError";
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
  const knownCodes = new Set([
    "EAUTH",
    "ETIMEDOUT",
    "ESOCKET",
    "ECONNECTION",
    "ECONNREFUSED",
    "EHOSTUNREACH",
    "ENOTFOUND",
  ]);

  return {
    name,
    ...(code && (/^P\d{4}$/.test(code) || knownCodes.has(code)) ? { code } : {}),
  };
}
