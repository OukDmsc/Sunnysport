import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const prismaCli = require.resolve("prisma/build/index.js");
const nextCli = require.resolve("next/dist/bin/next");
const postgresCheck = fileURLToPath(new URL("./check-postgres.mjs", import.meta.url));

function redactOutput(output) {
  let safeOutput = output;

  for (const variableName of ["DATABASE_URL", "DIRECT_URL"]) {
    const value = process.env[variableName];
    if (value) safeOutput = safeOutput.replaceAll(value, "[REDACTED]");
  }

  return safeOutput.replace(/\bpostgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[REDACTED DATABASE URL]");
}

function runStep(label, script, args) {
  console.log(`Running ${label}...`);
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
  });

  if (result.stdout) process.stdout.write(redactOutput(result.stdout));
  if (result.stderr) process.stderr.write(redactOutput(result.stderr));

  if (result.error) {
    console.error(`${label} could not start: ${redactOutput(result.error.message)}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`${label} failed with exit code ${result.status ?? "unknown"}.`);
    process.exit(result.status ?? 1);
  }
}

runStep("PostgreSQL Prisma Client generation", prismaCli, [
  "generate",
  "--schema=prisma/postgresql/schema.prisma",
]);

if (process.env.VERCEL_ENV === "production") {
  runStep("Read-only PostgreSQL connection preflight", postgresCheck, []);
  runStep("PostgreSQL migrations", prismaCli, [
    "migrate",
    "deploy",
    "--schema=prisma/postgresql/schema.prisma",
  ]);
}

runStep("Next.js production build", nextCli, ["build"]);
