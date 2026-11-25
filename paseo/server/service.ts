// Enhance flow, shared by every window and agent on this daemon: one bce-tool
// child, started on first use and stopped after IDLE_MS without requests.
// Index (search_context) and rewrite (enhance_prompt) share ENHANCE_TIMEOUT_MS,
// matching the DSH and EnsoCode versions.

import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import type { PluginHandlerContext, PluginSettings } from "@getpaseo/plugin/server";
import {
  ENHANCE_TIMEOUT_MS,
  START_TIMEOUT_MS,
  type EnhanceErrorCode,
  type bceSettings,
  type detectRpc,
  type enhanceRpc,
} from "../shared/enhance";
import { childEnv, describeLaunch, redact, resolveLaunch, secretsOf, type LaunchSpec } from "./launch";
import { McpExitError, McpStdioClient, McpTimeoutError } from "./mcp-client";

type EnhanceInput = RpcInput<typeof enhanceRpc>;
type EnhanceOutput = RpcOutput<typeof enhanceRpc>;
type DetectOutput = RpcOutput<typeof detectRpc>;
type Paseo = PluginHandlerContext["paseo"];
type Failure = { ok: false; code: EnhanceErrorCode; message: string };

const IDLE_MS = 10 * 60_000;
const CLIENT_VERSION = "0.1.0";

const INDEX_TIMEOUT_MESSAGE = "Indexing used up the 90s limit shared with enhancement.";
const ENHANCE_TIMEOUT_MESSAGE = `Enhancement timed out (${ENHANCE_TIMEOUT_MS / 1000}s). Indexing and rewriting share this limit.`;

function fail(code: EnhanceErrorCode, message: string): Failure {
  return { ok: false, code, message };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Only meaningful for failed results: successful text may quote these phrases. */
export function classifyFailure(text: string): EnhanceErrorCode | undefined {
  const lower = text.toLowerCase();
  if (lower.includes("not managed by git") || lower.includes("not a git repository")) return "not_git";
  if (lower.includes("too large to index") || (lower.includes("exceeds the") && lower.includes("mb"))) return "too_large";
  if (lower.includes("timed out") || lower.includes("timeout") || lower.includes("tool call aborted")) return "timeout";
  return undefined;
}

function isFailure(result: { text: string; isError: boolean }): boolean {
  return result.isError || result.text.startsWith("Error:");
}

export class BceService {
  private client: McpStdioClient | null = null;
  private clientKey = "";
  private starting: Promise<McpStdioClient> | null = null;
  private inflight = 0;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly queues = new Map<string, Promise<unknown>>();
  private disposed = false;

  constructor(private readonly settings: PluginSettings<typeof bceSettings.schema>) {}

  /** Settings changed: the next request starts bce-tool with the new command. */
  reset(): void {
    void this.stopClient();
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    clearTimeout(this.idleTimer);
    await this.stopClient();
  }

  async detect(): Promise<DetectOutput> {
    const spec = await this.launchSpec(undefined);
    if ("ok" in spec) return spec;
    return { ok: true, source: spec.source, server: spec.server, command: describeLaunch(spec) };
  }

  async enhance(input: EnhanceInput, paseo: Paseo): Promise<EnhanceOutput> {
    const prompt = input.prompt.trim();
    if (prompt.length === 0) return fail("empty_prompt", "prompt is empty");

    const root = await this.projectRoot(input.agentIds, paseo);
    if ("ok" in root) return root;

    // One request per project at a time, so two windows do not index twice in parallel.
    const previous = this.queues.get(root.path) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(() => this.enhanceIn(root.path, prompt));
    this.queues.set(root.path, run);
    try {
      return await run;
    } finally {
      if (this.queues.get(root.path) === run) this.queues.delete(root.path);
    }
  }

  private async enhanceIn(projectRoot: string, prompt: string): Promise<EnhanceOutput> {
    const spec = await this.launchSpec(projectRoot);
    if ("ok" in spec) return spec;
    const secrets = secretsOf(spec);

    this.inflight += 1;
    clearTimeout(this.idleTimer);
    try {
      let client: McpStdioClient;
      try {
        client = await this.ensureClient(spec);
      } catch (error) {
        const detail = redact(errorText(error), secrets);
        console.error(`[dsh-bce] bce-tool start failed: ${detail}`);
        return fail("launch_failed", detail);
      }
      if (!client.tools.has("enhance_prompt")) {
        return fail("mcp_missing", `MCP server "${spec.server}" does not expose enhance_prompt.`);
      }

      const started = Date.now();
      const budget = () => Math.max(0, ENHANCE_TIMEOUT_MS - (Date.now() - started));
      let warning: "no_index" | undefined;

      if (client.tools.has("search_context")) {
        const indexBudget = budget();
        if (indexBudget <= 0) return fail("index_timeout", INDEX_TIMEOUT_MESSAGE);
        try {
          const searched = await client.callTool(
            "search_context",
            { project_root_path: projectRoot, query: prompt },
            indexBudget,
          );
          if (isFailure(searched)) {
            const text = redact(searched.text, secrets);
            const code = classifyFailure(text);
            if (code === "timeout") return fail("index_timeout", INDEX_TIMEOUT_MESSAGE);
            if (code !== undefined) return fail(code, text);
            return fail("index_failed", text || "search_context failed");
          }
        } catch (error) {
          if (error instanceof McpTimeoutError) return fail("index_timeout", INDEX_TIMEOUT_MESSAGE);
          return fail("index_failed", redact(this.exitDetail(error, client), secrets));
        }
      } else {
        warning = "no_index";
      }

      const enhanceBudget = budget();
      if (enhanceBudget <= 0) return fail("timeout", ENHANCE_TIMEOUT_MESSAGE);
      let enhanced: { text: string; isError: boolean };
      try {
        enhanced = await client.callTool(
          "enhance_prompt",
          { project_root_path: projectRoot, prompt, conversation_history: "" },
          enhanceBudget,
        );
      } catch (error) {
        if (error instanceof McpTimeoutError) return fail("timeout", ENHANCE_TIMEOUT_MESSAGE);
        return fail("upstream", redact(this.exitDetail(error, client), secrets));
      }
      if (isFailure(enhanced)) {
        const text = redact(enhanced.text, secrets);
        const code = classifyFailure(text);
        if (code === "timeout") return fail("timeout", ENHANCE_TIMEOUT_MESSAGE);
        if (code !== undefined) return fail(code, text);
        return fail("upstream", text || "enhance_prompt failed");
      }
      if (enhanced.text.length === 0) return fail("upstream", "enhance_prompt returned empty text");
      return warning === undefined ? { ok: true, text: enhanced.text } : { ok: true, text: enhanced.text, warning };
    } finally {
      this.inflight -= 1;
      this.scheduleIdle();
    }
  }

  /** The agents whose draft matched must agree on one working directory. */
  private async projectRoot(
    agentIds: readonly string[],
    paseo: Paseo,
  ): Promise<{ path: string } | Failure> {
    const roots = new Set<string>();
    for (const agentId of new Set(agentIds)) {
      try {
        const handle = paseo.agents.ref(agentId);
        const refreshed = await handle.refresh();
        const cwd = refreshed?.agent.cwd ?? handle.cwd;
        if (typeof cwd === "string" && cwd.length > 0) roots.add(cwd);
      } catch (error) {
        console.error(`[dsh-bce] could not read agent ${agentId}: ${errorText(error)}`);
      }
    }
    if (roots.size === 0) return fail("no_workspace", "workspace path is missing");
    if (roots.size > 1) return fail("ambiguous_agent", "several agents in different folders have this draft");
    return { path: [...roots][0] };
  }

  private async launchSpec(projectRoot: string | undefined): Promise<LaunchSpec | Failure> {
    let values = { server: "", command: "" };
    try {
      const state = await this.settings.read();
      if (state.status === "ready") values = state.values;
    } catch (error) {
      console.error(`[dsh-bce] settings read failed: ${errorText(error)}`);
    }
    try {
      const spec = await resolveLaunch(values, projectRoot);
      if (spec) return spec;
    } catch (error) {
      return fail("launch_failed", errorText(error));
    }
    const named = values.server.trim();
    return fail(
      "mcp_missing",
      named.length > 0
        ? `No stdio MCP server named "${named}" in ~/.claude.json or ~/.codex/config.toml.`
        : "No bce MCP server in ~/.claude.json or ~/.codex/config.toml, and no command in settings.",
    );
  }

  private async ensureClient(spec: LaunchSpec): Promise<McpStdioClient> {
    if (this.disposed) throw new McpExitError("plugin is stopping");
    if (this.client?.alive && this.clientKey === spec.key) return this.client;
    if (this.starting && this.clientKey === spec.key) return this.starting;
    await this.stopClient();

    this.clientKey = spec.key;
    const env = await childEnv(spec);
    const client = new McpStdioClient(
      { command: spec.command, args: spec.args, env },
      CLIENT_VERSION,
      () => {
        if (this.client === client) this.client = null;
      },
    );
    const starting = client.start(START_TIMEOUT_MS).then(
      () => {
        if (this.starting === starting) this.starting = null;
        if (this.disposed || this.clientKey !== spec.key) {
          void client.close();
          throw new McpExitError("bce-tool was replaced while starting");
        }
        this.client = client;
        console.log(`[dsh-bce] bce-tool ready (${spec.source}: ${spec.server})`);
        return client;
      },
      async (error: unknown) => {
        if (this.starting === starting) this.starting = null;
        const stderr = client.stderr;
        await client.close();
        const reason = error instanceof McpTimeoutError ? `startup timed out (${START_TIMEOUT_MS / 1000}s)` : errorText(error);
        throw new McpExitError(stderr.length > 0 ? `${reason}\n${stderr}` : reason);
      },
    );
    this.starting = starting;
    return starting;
  }

  private exitDetail(error: unknown, client: McpStdioClient): string {
    const stderr = error instanceof McpExitError ? client.stderr : "";
    const reason = errorText(error);
    return stderr.length > 0 ? `${reason}\n${stderr}` : reason;
  }

  private scheduleIdle() {
    clearTimeout(this.idleTimer);
    if (this.inflight > 0 || this.disposed) return;
    this.idleTimer = setTimeout(() => {
      if (this.inflight === 0) void this.stopClient();
    }, IDLE_MS);
    this.idleTimer.unref?.();
  }

  private async stopClient(): Promise<void> {
    const client = this.client;
    this.client = null;
    this.starting = null;
    this.clientKey = "";
    if (client) await client.close();
  }
}
