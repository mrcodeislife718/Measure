import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { spawn } from "node:child_process";
import type { RepositoryManifest, TraceIngestion, TraceEvent } from "./source-ingestion.js";

const LANGUAGE_BY_EXT: Record<string, string> = {
  ".ts": "TypeScript", ".tsx": "TypeScript", ".js": "JavaScript", ".jsx": "JavaScript", ".py": "Python", ".go": "Go", ".rs": "Rust", ".java": "Java", ".cpp": "C++", ".cc": "C++", ".c": "C", ".sql": "SQL",
};

export async function fetchOpenApiDocument(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`OpenAPI fetch failed: ${response.status}`);
  const text = await response.text();
  try { return JSON.parse(text); } catch { throw new Error("OpenAPI connector currently requires JSON input"); }
}

export async function inspectRepository(root: string, options: { maxFiles?: number; maxBytes?: number; id?: string } = {}): Promise<RepositoryManifest> {
  const maxFiles = options.maxFiles ?? 10_000;
  const maxBytes = options.maxBytes ?? 5_000_000;
  const files: Array<{ path: string; language?: string; size?: number }> = [];
  let bytes = 0;
  const ignored = new Set([".git", "node_modules", "dist", "build", ".next", ".vercel", "coverage"]);

  async function walk(dir: string) {
    if (files.length >= maxFiles || bytes >= maxBytes) return;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) {
        const info = await stat(absolute);
        bytes += info.size;
        files.push({ path: relative(root, absolute), language: LANGUAGE_BY_EXT[extname(entry.name).toLowerCase()], size: info.size });
        if (files.length >= maxFiles || bytes >= maxBytes) return;
      }
    }
  }
  await walk(root);

  let scripts: Record<string, string> | undefined;
  try {
    const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    scripts = pkg.scripts;
  } catch {}

  const tests = files.filter((file) => /(^|\/)(test|tests|__tests__)(\/|\.)|\.test\.|\.spec\./i.test(file.path)).slice(0, 500).map((file, index) => ({ id: `test:${index}`, target: file.path }));
  return { id: options.id ?? root.split(/[\\/]/).filter(Boolean).at(-1) ?? "repository", files, scripts, tests };
}

function runProcess(command: string, args: string[], options: { input?: string; timeoutMs?: number } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], shell: false });
    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`${command} timed out`)); }, options.timeoutMs ?? 30_000);
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`${command} failed (${code}): ${Buffer.concat(errors).toString("utf8").slice(0, 4000)}`));
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    child.stdin.end(options.input ?? "");
  });
}

export async function introspectPostgres(connectionString: string): Promise<{ sql: string; tables: number }> {
  const query = `select table_schema, table_name, column_name, data_type, is_nullable from information_schema.columns where table_schema not in ('pg_catalog','information_schema') order by table_schema, table_name, ordinal_position;`;
  const output = await runProcess("psql", [connectionString, "-At", "-F", "\t", "-c", query]);
  const grouped = new Map<string, Array<{ name: string; type: string; nullable: boolean }>>();
  for (const line of output.split(/\r?\n/).filter(Boolean)) {
    const [schema, table, column, type, nullable] = line.split("\t");
    const key = `${schema}.${table}`;
    const columns = grouped.get(key) ?? [];
    columns.push({ name: column, type, nullable: nullable === "YES" });
    grouped.set(key, columns);
  }
  const sql = [...grouped.entries()].map(([name, columns]) => `create table ${name} (\n${columns.map((column) => `  ${column.name} ${column.type}${column.nullable ? "" : " not null"}`).join(",\n")}\n);`).join("\n\n");
  return { sql, tables: grouped.size };
}

export async function readTraceFile(path: string, id = "local-trace"): Promise<TraceIngestion> {
  const parsed = JSON.parse(await readFile(path, "utf8"));
  const source = Array.isArray(parsed) ? parsed : parsed.events;
  if (!Array.isArray(source)) throw new Error("trace file must be a JSON array or object with events[]");
  const events: TraceEvent[] = source.map((event: Record<string, unknown>, index: number) => ({
    id: String(event.id ?? `event:${index}`),
    timestamp: String(event.timestamp ?? new Date(index).toISOString()),
    actor: event.actor === undefined ? undefined : String(event.actor),
    action: String(event.action ?? "unknown"),
    target: event.target === undefined ? undefined : String(event.target),
    success: Boolean(event.success),
    latencyMs: event.latencyMs === undefined ? undefined : Number(event.latencyMs),
    cost: event.cost === undefined ? undefined : Number(event.cost),
    errorCode: event.errorCode === undefined ? undefined : String(event.errorCode),
    stateBefore: typeof event.stateBefore === "object" && event.stateBefore ? event.stateBefore as Record<string, unknown> : undefined,
    stateAfter: typeof event.stateAfter === "object" && event.stateAfter ? event.stateAfter as Record<string, unknown> : undefined,
  }));
  return { id, events };
}
