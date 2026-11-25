import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

/** Index plus rewrite share this budget, as in the DSH and EnsoCode versions. */
export const ENHANCE_TIMEOUT_MS = 90_000;
/** Starting bce-tool (npx may resolve the package first) has its own budget. */
export const START_TIMEOUT_MS = 60_000;
/** A finished status stays next to the enhance icon this long; busy never auto-clears. */
export const STATUS_CLEAR_MS = { ok: 3_500, error: 5_000 } as const;
/** Composer agents considered when matching the draft to its agent. */
export const MAX_AGENT_CANDIDATES = 16;
/** Typing pause before the composer asks the daemon to start bce-tool ahead of the click. */
export const WARM_DELAY_MS = 800;
/** Pre-start requests from the composers are sent at most this often. */
export const WARM_THROTTLE_MS = 60_000;

export const ERROR_CODES = [
  "empty_prompt",
  "no_workspace",
  "ambiguous_agent",
  "mcp_missing",
  "launch_failed",
  "not_git",
  "too_large",
  "index_failed",
  "index_timeout",
  "timeout",
  "upstream",
] as const;

export type EnhanceErrorCode = (typeof ERROR_CODES)[number];

const failure = z.object({
  ok: z.literal(false),
  code: z.enum(ERROR_CODES),
  message: z.string(),
});

/** Rewrite one draft. The server resolves the project root from the agents whose draft matched. */
export const enhanceRpc = defineRpc({
  name: "bce.enhance",
  input: z.object({
    prompt: z.string(),
    agentIds: z.array(z.string()).max(MAX_AGENT_CANDIDATES),
  }),
  output: z.discriminatedUnion("ok", [
    z.object({
      ok: z.literal(true),
      text: z.string(),
      warning: z.literal("no_index").optional(),
    }),
    failure,
  ]),
});

/**
 * Start bce-tool before the first click, so the click does not pay for npx and the
 * handshake. Best effort: never indexes, never replaces a running or starting bce-tool.
 */
export const warmRpc = defineRpc({
  name: "bce.warm",
  input: z.object({
    agentIds: z.array(z.string()).max(MAX_AGENT_CANDIDATES),
  }),
  output: z.object({ ready: z.boolean() }),
});

/** Which bce-tool command the plugin would start. Secrets in the command are masked. */
export const detectRpc = defineRpc({
  name: "bce.detect",
  input: z.object({}),
  output: z.discriminatedUnion("ok", [
    z.object({
      ok: z.literal(true),
      source: z.enum(["settings", "claude", "codex"]),
      server: z.string(),
      command: z.string(),
    }),
    failure,
  ]),
});

export const bceSettings = defineSettings({
  id: "bce",
  scope: "host",
  version: 1,
  schema: z.object({
    /** Preferred MCP server name in Claude Code / Codex config. Empty: a name containing "bce". */
    server: z.string().default(""),
    /** Full bce-tool command line. Empty: reuse the Claude Code / Codex MCP entry. */
    command: z.string().default(""),
  }),
});
