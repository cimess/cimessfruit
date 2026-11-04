import { mkdir, open, readdir, stat, unlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
const directory = process.env.BACKUP_DIR || "/var/backups/cimessfruit";
const url = new URL(process.env.DATABASE_URL);
if (!["postgres:", "postgresql:"].includes(url.protocol)) throw Error("PostgreSQL URL required");
await mkdir(directory, { recursive: true, mode: 0o700 });
const name = `cimessfruit-${new Date().toISOString().replace(/[:.]/g, "-")}.dump`;
const path = join(directory, name);
const file = await open(path, "wx", 0o600);
try {
  const env = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432", PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password) };
  if (url.searchParams.has("sslmode")) env.PGSSLMODE = url.searchParams.get("sslmode");
  await new Promise((resolve, reject) => {
    const child = spawn("pg_dump", ["--format=custom", "--no-owner", "--no-acl"], { env, stdio: ["ignore", file.fd, "inherit"] });
    child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(Error(`pg_dump failed (${code})`)));
  });
  console.log(`Backup completed: ${name}`);
} catch (error) { await unlink(path).catch(() => {}); throw error; }
finally { await file.close(); }
// Only prune this script's backup files, after a successful dump.
for (const entry of await readdir(directory)) {
  if (!/^cimessfruit-\d{4}-.*\.dump$/.test(entry)) continue;
  const candidate = join(directory, entry);
  if ((await stat(candidate)).mtimeMs < Date.now() - 14 * 86400000) await unlink(candidate);
}
