import { spawn } from "node:child_process";
import type { Participant, ParticipantContext } from "./contracts.js";

export interface HttpParticipantOptions {
  id: string;
  kind?: string;
  url: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export class HttpParticipant<Observation, Action> implements Participant<Observation, Action> {
  readonly id: string;
  readonly kind: string;
  #url: string;
  #headers: Record<string, string>;
  #timeoutMs: number;

  constructor(options: HttpParticipantOptions) {
    this.id = options.id;
    this.kind = options.kind ?? "http-participant";
    this.#url = options.url;
    this.#headers = { ...(options.headers ?? {}) };
    this.#timeoutMs = options.timeoutMs ?? 30_000;
  }

  async act(observation: Observation, context: ParticipantContext): Promise<Action> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      const response = await fetch(this.#url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...this.#headers },
        body: JSON.stringify({ observation, context }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`participant HTTP ${response.status}`);
      return await response.json() as Action;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export interface CommandParticipantOptions {
  id: string;
  kind?: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export class CommandParticipant<Observation, Action> implements Participant<Observation, Action> {
  readonly id: string;
  readonly kind: string;
  #options: CommandParticipantOptions;

  constructor(options: CommandParticipantOptions) {
    this.id = options.id;
    this.kind = options.kind ?? "command-participant";
    this.#options = { ...options, args: [...(options.args ?? [])], env: { ...(options.env ?? {}) } };
  }

  act(observation: Observation, context: ParticipantContext): Promise<Action> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.#options.command, this.#options.args ?? [], {
        cwd: this.#options.cwd,
        env: { ...process.env, ...(this.#options.env ?? {}) },
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
      });
      const timeoutMs = this.#options.timeoutMs ?? 30_000;
      const maxOutputBytes = this.#options.maxOutputBytes ?? 1_000_000;
      let stdout = Buffer.alloc(0);
      let stderr = Buffer.alloc(0);
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`participant command timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.stdout.on("data", (chunk: Buffer) => {
        stdout = Buffer.concat([stdout, chunk]);
        if (stdout.length > maxOutputBytes) child.kill("SIGKILL");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr = Buffer.concat([stderr, chunk]);
        if (stderr.length > maxOutputBytes) child.kill("SIGKILL");
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) return reject(new Error(`participant command failed (${code}): ${stderr.toString("utf8").slice(0, 4000)}`));
        if (stdout.length > maxOutputBytes) return reject(new Error("participant command output exceeded limit"));
        try {
          resolve(JSON.parse(stdout.toString("utf8")) as Action);
        } catch (error) {
          reject(new Error(`participant command returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`));
        }
      });

      child.stdin.end(JSON.stringify({ observation, context }));
    });
  }
}
