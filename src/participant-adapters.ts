import { spawn } from "node:child_process";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { ParticipantAdapter, ParticipantContext } from "./contracts.js";

export interface HttpParticipantOptions {
  id: string;
  kind?: string;
  url: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  allowPrivateNetwork?: boolean;
}

function ipv4Private(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

function ipv6Private(address: string): boolean {
  const normalized = address.toLowerCase();
  return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || /^fe[89ab]/.test(normalized) || normalized.startsWith("::ffff:127.") || normalized.startsWith("::ffff:10.") || normalized.startsWith("::ffff:192.168.");
}

export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return ipv4Private(address);
  if (version === 6) return ipv6Private(address);
  return true;
}

export async function validateParticipantUrl(rawUrl: string, allowPrivateNetwork = false): Promise<URL> {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" && !(allowPrivateNetwork && url.protocol === "http:")) throw new Error("hosted participant URL must use HTTPS");
  if (url.username || url.password) throw new Error("participant URL must not contain credentials");
  const hostname = url.hostname.toLowerCase();
  if (["localhost", "localhost.localdomain"].includes(hostname) || hostname.endsWith(".localhost")) throw new Error("localhost participant URLs are blocked");
  if (!allowPrivateNetwork) {
    if (isIP(hostname) && isPrivateAddress(hostname)) throw new Error("private-network participant URLs require the local/private runner");
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address))) throw new Error("participant hostname resolves to a private or reserved address; use the local/private runner");
  }
  return url;
}

export class HttpParticipant<Observation, Action> implements ParticipantAdapter<Observation, Action> {
  readonly id: string;
  readonly kind: string;
  #url: string;
  #headers: Record<string, string>;
  #timeoutMs: number;
  #allowPrivateNetwork: boolean;
  #validated = false;

  constructor(options: HttpParticipantOptions) {
    this.id = options.id;
    this.kind = options.kind ?? "http-participant";
    this.#url = options.url;
    this.#headers = { ...(options.headers ?? {}) };
    this.#timeoutMs = options.timeoutMs ?? 30_000;
    this.#allowPrivateNetwork = options.allowPrivateNetwork ?? false;
  }

  async act(observation: Observation, context: ParticipantContext): Promise<Action> {
    if (!this.#validated) {
      await validateParticipantUrl(this.#url, this.#allowPrivateNetwork);
      this.#validated = true;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      const response = await fetch(this.#url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...this.#headers },
        body: JSON.stringify({ observation, context }),
        signal: controller.signal,
        redirect: "error",
      });
      if (!response.ok) throw new Error(`participant HTTP ${response.status}`);
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) throw new Error("participant HTTP response must be application/json");
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

export class CommandParticipant<Observation, Action> implements ParticipantAdapter<Observation, Action> {
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
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(() => reject(new Error(`participant command timed out after ${timeoutMs}ms`)));
      }, timeoutMs);

      child.stdout.on("data", (chunk: Buffer) => {
        stdout = Buffer.concat([stdout, chunk]);
        if (stdout.length > maxOutputBytes) child.kill("SIGKILL");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr = Buffer.concat([stderr, chunk]);
        if (stderr.length > maxOutputBytes) child.kill("SIGKILL");
      });
      child.on("error", (error) => finish(() => reject(error)));
      child.on("close", (code) => finish(() => {
        if (code !== 0) return reject(new Error(`participant command failed (${code}): ${stderr.toString("utf8").slice(0, 4000)}`));
        if (stdout.length > maxOutputBytes) return reject(new Error("participant command output exceeded limit"));
        try {
          resolve(JSON.parse(stdout.toString("utf8")) as Action);
        } catch (error) {
          reject(new Error(`participant command returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`));
        }
      }));

      child.stdin.end(JSON.stringify({ observation, context }));
    });
  }
}
