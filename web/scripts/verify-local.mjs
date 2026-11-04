// Disposable PostgreSQL verification. Never reads a configured application DB URL.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const binary = process.env.LOCAL_POSTGRES_BIN || "/usr/lib/postgresql/16/bin";
for (const command of ["initdb", "pg_ctl", "psql"])
  if (!existsSync(join(binary, command)))
    throw Error(
      `Install local PostgreSQL or set LOCAL_POSTGRES_BIN; missing ${command}`,
    );
const directory = mkdtempSync(join(tmpdir(), "cimessfruit-verify-"));
let started = false,
  redisPort;
const report = {
  generatedAt: new Date().toISOString(),
  scope:
    "Disposable local PostgreSQL only; no application DB/provider connection",
  steps: [],
};
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 180000,
    maxBuffer: 16 * 1024 * 1024,
  });
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  if (result.error || result.status !== 0)
    throw Error(
      `${command.split("/").at(-1)} failed (${result.status ?? result.error?.code})`,
    );
  return result.stdout;
}
try {
  // Ask the OS for a free loopback port. Startup must succeed before any SQL runs.
  const port = await new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
  run(join(binary, "initdb"), [
    "-D",
    join(directory, "data"),
    "-A",
    "trust",
    "-U",
    "verification",
    "--no-locale",
    "--encoding=UTF8",
  ]);
  run(join(binary, "pg_ctl"), [
    "-D",
    join(directory, "data"),
    "-l",
    join(directory, "postgres.log"),
    "-o",
    `-h 127.0.0.1 -p ${port} -k ${directory} -c max_connections=30`,
    "-w",
    "start",
  ]);
  started = true;
  run(join(binary, "psql"), [
    "-h",
    "127.0.0.1",
    "-p",
    String(port),
    "-U",
    "verification",
    "-d",
    "postgres",
    "-c",
    "CREATE DATABASE verification",
  ]);
  const url = `postgresql://verification@127.0.0.1:${port}/verification`;
  if (existsSync("/usr/bin/redis-server")) {
    redisPort = await new Promise((resolve, reject) => {
      const server = createServer();
      server.on("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const port = server.address().port;
        server.close((error) => (error ? reject(error) : resolve(port)));
      });
    });
    run("/usr/bin/redis-server", [
      "--port",
      String(redisPort),
      "--bind",
      "127.0.0.1",
      "--save",
      "",
      "--appendonly",
      "no",
      "--daemonize",
      "yes",
      "--pidfile",
      join(directory, "redis.pid"),
      "--logfile",
      join(directory, "redis.log"),
    ]);
  }
  const env = {
    ...process.env,
    DATABASE_URL: url,
    DATABASE_URL_UNPOOLED: url,
    TEST_DATABASE_URL: url,
    SSE_ENABLED: "false",
    TEST_REDIS_URL: redisPort ? `redis://127.0.0.1:${redisPort}` : "",
    LOCAL_POOL_TESTS: "1",
    LOCAL_VERIFICATION_DATABASE: "1",
    NOTIFICATIONS_ENABLED: "false",
    REDIS_URL: "",
  };
  run(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    env,
  );
  report.steps.push({
    name: "migration chain on empty disposable database",
    passed: true,
  });
  const tests = run("npm", ["test"], env);
  report.steps.push({
    name: "full suite including PostgreSQL and bounded-pool checks",
    passed: true,
    totals: tests
      .split("\n")
      .filter((line) =>
        /(?:tests |pass |fail |skipped |duration_ms )/.test(line),
      )
      .slice(-5),
  });
  if (process.argv.includes("--bench")) {
    run(
      process.execPath,
      ["--import", "tsx", "scripts/representative-local.ts"],
      env,
    );
    const benchmarks = {};
    for (const name of [
      "products",
      "orders",
      "inbox",
      "email",
      "delivery",
      "maintenance",
    ]) {
      const output = run(
        process.execPath,
        ["--import", "tsx", `scripts/benchmark-${name}.ts`],
        env,
      );
      benchmarks[name] = JSON.parse(output);
    }
    writeFileSync(
      resolve(
        root,
        "../architecture/review-next/REPRESENTATIVE_LOCAL_BENCHMARK.json",
      ),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          syntheticOnly: true,
          providerPerformance: false,
          results: benchmarks,
        },
        null,
        2,
      ) + "\n",
    );
    report.steps.push({
      name: "representative synthetic local benchmarks",
      passed: true,
    });
  }
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.error = error.message;
  process.exitCode = 1;
} finally {
  if (redisPort)
    spawnSync("/usr/bin/redis-cli", [
      "-h",
      "127.0.0.1",
      "-p",
      String(redisPort),
      "shutdown",
      "nosave",
    ]);
  if (started) {
    const stop = spawnSync(
      join(binary, "pg_ctl"),
      ["-D", join(directory, "data"), "-m", "immediate", "-w", "stop"],
      { encoding: "utf8" },
    );
    if (stop.status !== 0) {
      report.cleanup = "PostgreSQL stop failed; temporary directory retained";
      process.exitCode = 1;
    } else {
      rmSync(directory, { recursive: true, force: true });
      report.cleanup = "Temporary cluster stopped and removed";
    }
  } else {
    rmSync(directory, { recursive: true, force: true });
    report.cleanup = "Temporary files removed";
  }
  writeFileSync(
    resolve(
      root,
      "../architecture/review-next/LOCAL_DATABASE_VERIFICATION.json",
    ),
    JSON.stringify(report, null, 2) + "\n",
  );
}
