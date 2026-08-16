import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { compileOpenApi, compileSqlSchema, compileWorkflow, type DomainSpecification } from "./environment-compiler.js";
import { compileRepositoryManifest, compileTrace, type RepositoryManifest, type TraceIngestion } from "./source-ingestion.js";
import { synthesizeScenarioFamily } from "./scenario-synthesis.js";
import { CommandParticipant, HttpParticipant } from "./participant-adapters.js";
import { runCompiledScenarioFamily } from "./compiled-evaluation.js";

export interface PrivateRunnerJob {
  jobId: string;
  source: { kind: "openapi" | "sql" | "workflow" | "repository" | "trace"; value: unknown; id?: string };
  participant:
    | { type: "http"; id: string; kind?: string; url: string; headers?: Record<string, string>; timeoutMs?: number }
    | { type: "command"; id: string; kind?: string; command: string; args?: string[]; cwd?: string; env?: Record<string, string>; timeoutMs?: number };
  initialEntities?: Record<string, Array<Record<string, unknown>>>;
  maxScenarios?: number;
  maxFaultCombinationSize?: number;
  hiddenFraction?: number;
}

export interface PrivateRunnerPackage {
  version: "measure.private-runner.v1";
  jobId: string;
  createdAt: string;
  runtime: { platform: string; arch: string; node: string };
  domain: { id: string; sourceKind: string; sourceDigest: string };
  scenarioCount: number;
  report: Awaited<ReturnType<typeof runCompiledScenarioFamily>>;
  digest: string;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function compileSource(job: PrivateRunnerJob): DomainSpecification {
  if (job.source.kind === "openapi") return compileOpenApi(job.source.value as Parameters<typeof compileOpenApi>[0]);
  if (job.source.kind === "sql") return compileSqlSchema(String(job.source.value ?? ""), job.source.id ?? `sql:${job.jobId}`);
  if (job.source.kind === "workflow") return compileWorkflow(job.source.value as Parameters<typeof compileWorkflow>[0]);
  if (job.source.kind === "repository") return compileRepositoryManifest(job.source.value as RepositoryManifest);
  return compileTrace(job.source.value as TraceIngestion);
}

export async function runPrivateJob(job: PrivateRunnerJob): Promise<PrivateRunnerPackage> {
  const domain = compileSource(job);
  const scenarios = synthesizeScenarioFamily(domain, {
    maxFaultCombinationSize: job.maxFaultCombinationSize ?? 2,
    includeAuthorityRevocation: true,
    hiddenFraction: job.hiddenFraction ?? 0.2,
    limit: job.maxScenarios ?? 100,
  });
  if (!scenarios.length) throw new Error("compiled domain produced no scenarios");

  const participant = job.participant.type === "http"
    ? new HttpParticipant(job.participant)
    : new CommandParticipant(job.participant);

  const report = await runCompiledScenarioFamily({
    domain,
    scenarios,
    participant,
    initialEntities: job.initialEntities,
    maxScenarios: job.maxScenarios ?? 100,
  });

  const core = {
    version: "measure.private-runner.v1" as const,
    jobId: job.jobId,
    createdAt: new Date().toISOString(),
    runtime: { platform: process.platform, arch: process.arch, node: process.version },
    domain: { id: domain.id, sourceKind: domain.sourceKind, sourceDigest: domain.sourceDigest },
    scenarioCount: report.scenariosRun,
    report,
  };
  return { ...core, digest: digest(core) };
}

export function verifyPrivateRunnerPackage(value: PrivateRunnerPackage): boolean {
  const { digest: supplied, ...core } = value;
  return supplied === digest(core);
}

async function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  if (!inputPath) {
    console.error("Usage: node dist/src/private-runner.js <job.json> [result.json]");
    process.exitCode = 2;
    return;
  }
  const job = JSON.parse(await readFile(inputPath, "utf8")) as PrivateRunnerJob;
  const result = await runPrivateJob(job);
  const rendered = `${JSON.stringify(result, null, 2)}\n`;
  if (outputPath) await writeFile(outputPath, rendered, "utf8");
  else process.stdout.write(rendered);
}

if (process.argv[1]?.endsWith("private-runner.js")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
