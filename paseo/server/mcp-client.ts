// Minimal MCP client over stdio: newline-delimited JSON-RPC 2.0. It covers
// what the plugin needs (initialize, tools/list, tools/call, cancellation) so
// the package ships without runtime dependencies.

import { spawnProcess, terminateProcess } from "@getpaseo/plugin/server";
import type { ChildProcessWithoutNullStreams } from "node:child_process";

const PROTOCOL_VERSION = "2025-06-18";
const STDERR_TAIL_BYTES = 4_096;

export class McpTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpTimeoutError";
  }
}

export class McpExitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpExitError";
  }
}

export interface ToolResult {
  text: string;
  isError: boolean;
}

interface Pending {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

export interface McpLaunch {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

export class McpStdioClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  private buffer = "";
  private stderrTail = "";
  private exited = false;
  private toolNames = new Set<string>();

  constructor(
    private readonly launch: McpLaunch,
    private readonly clientVersion: string,
    private readonly onExit: () => void,
  ) {}

  get alive(): boolean {
    return this.child !== null && !this.exited;
  }

  get tools(): ReadonlySet<string> {
    return this.toolNames;
  }

  /** Last bytes bce-tool wrote to stderr, for error messages. */
  get stderr(): string {
    return this.stderrTail.trim();
  }

  async start(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    const child = spawnProcess(this.launch.command, this.launch.args, {
      stdio: "pipe",
      env: this.launch.env,
      windowsHide: true,
    });
    this.child = child;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.onStdout(chunk));
    child.stderr.on("data", (chunk: string) => {
      this.stderrTail = (this.stderrTail + chunk).slice(-STDERR_TAIL_BYTES);
    });
    child.stdin.on("error", () => {
      // EPIPE after the child exits; the exit handler reports it.
    });

    const spawnFailure = new Promise<never>((_, reject) => {
      child.once("error", (error) => {
        this.handleExit(`bce-tool could not start: ${error.message}`);
        reject(new McpExitError(`could not start "${this.launch.command}": ${error.message}`));
      });
      child.once("exit", (code, signal) => {
        this.handleExit(`bce-tool exited (${signal ?? code ?? "unknown"})`);
        reject(new McpExitError(`bce-tool exited (${signal ?? code ?? "unknown"})`));
      });
    });
    spawnFailure.catch(() => undefined);

    const handshake = (async () => {
      await this.request(
        "initialize",
        {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: "dsh-bce-paseo", version: this.clientVersion },
        },
        Math.max(1, deadline - Date.now()),
      );
      this.notify("notifications/initialized", {});
      const listed = await this.request("tools/list", {}, Math.max(1, deadline - Date.now()));
      const tools = isRecord(listed) && Array.isArray(listed.tools) ? listed.tools : [];
      this.toolNames = new Set(
        tools
          .map((tool) => (isRecord(tool) && typeof tool.name === "string" ? tool.name : ""))
          .filter((name) => name.length > 0),
      );
    })();

    await Promise.race([handshake, spawnFailure]);
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<ToolResult> {
    const result = await this.request("tools/call", { name, arguments: args }, timeoutMs);
    if (!isRecord(result)) return { text: "", isError: true };
    const content = Array.isArray(result.content) ? result.content : [];
    const text = content
      .map((item) => (isRecord(item) && item.type === "text" && typeof item.text === "string" ? item.text : ""))
      .filter((part) => part.length > 0)
      .join("\n")
      .trim();
    return { text, isError: result.isError === true };
  }

  async close(): Promise<void> {
    const child = this.child;
    if (!child || this.exited) return;
    this.handleExit("bce-tool was stopped");
    child.stdin.end();
    await terminateProcess(child).catch(() => undefined);
  }

  private request(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    if (!this.child || this.exited) {
      return Promise.reject(new McpExitError("bce-tool is not running"));
    }
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.notify("notifications/cancelled", { requestId: id, reason: "timeout" });
        reject(new McpTimeoutError(`${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.write({ jsonrpc: "2.0", id, method, params });
    });
  }

  private notify(method: string, params: unknown) {
    this.write({ jsonrpc: "2.0", method, params });
  }

  private write(message: unknown) {
    if (!this.child || this.exited) return;
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private onStdout(chunk: string) {
    this.buffer += chunk;
    let newline = this.buffer.indexOf("\n");
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line.length > 0) this.onLine(line);
      newline = this.buffer.indexOf("\n");
    }
  }

  private onLine(line: string) {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      return; // Non-protocol output on stdout.
    }
    if (!isRecord(message)) return;
    const id = message.id;
    if (typeof message.method === "string") {
      if (id !== undefined && id !== null) this.answerServerRequest(id, message.method);
      return;
    }
    if (typeof id !== "number") return;
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    clearTimeout(pending.timer);
    if (isRecord(message.error)) {
      const text = typeof message.error.message === "string" ? message.error.message : "MCP error";
      pending.reject(new Error(text));
    } else {
      pending.resolve(message.result);
    }
  }

  /** The client declares no capabilities; answer the few requests servers may still send. */
  private answerServerRequest(id: unknown, method: string) {
    if (method === "ping") {
      this.write({ jsonrpc: "2.0", id, result: {} });
    } else if (method === "roots/list") {
      this.write({ jsonrpc: "2.0", id, result: { roots: [] } });
    } else {
      this.write({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
    }
  }

  private handleExit(reason: string) {
    if (this.exited) return;
    this.exited = true;
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new McpExitError(reason));
      this.pending.delete(id);
    }
    this.onExit();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
