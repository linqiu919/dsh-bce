// Decide which bce-tool command to start. Paseo plugins cannot call the MCP
// servers that Claude Code or Codex own, so the plugin starts its own copy of
// the user's existing bce entry. The token stays in that config file and is
// only passed to the child process; it is never stored or logged here.

import { execCommand } from "@getpaseo/plugin/server";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

export type LaunchSource = "settings" | "claude" | "codex";

export interface LaunchSpec {
  source: LaunchSource;
  server: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  /** Changes when the command, arguments or environment change. */
  key: string;
}

interface Candidate {
  source: Exclude<LaunchSource, "settings">;
  server: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

const NO_BROWSER_FLAG = "--no-webbrowser-enhance-prompt";
const SECRET_NAME = /token|secret|password|passwd|api[-_]?key|auth/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringRecord(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isRecord(value)) return out;
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") out[key] = item;
  }
  return out;
}

function fromEntry(
  source: Candidate["source"],
  server: string,
  entry: unknown,
): Candidate | null {
  if (!isRecord(entry)) return null;
  const type = typeof entry.type === "string" ? entry.type : "stdio";
  if (type !== "stdio") return null;
  if (typeof entry.command !== "string" || entry.command.trim().length === 0) return null;
  if (entry.enabled === false || entry.disabled === true) return null;
  return {
    source,
    server,
    command: entry.command,
    args: stringArray(entry.args),
    env: stringRecord(entry.env),
  };
}

// ---------------------------------------------------------------------------
// Claude Code: ~/.claude.json (user scope plus the project's own entries)

async function claudeCandidates(projectRoot: string | undefined): Promise<Candidate[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(join(homedir(), ".claude.json"), "utf8"));
  } catch {
    return [];
  }
  if (!isRecord(parsed)) return [];
  const out: Candidate[] = [];
  const collect = (servers: unknown) => {
    if (!isRecord(servers)) return;
    for (const [name, entry] of Object.entries(servers)) {
      const candidate = fromEntry("claude", name, entry);
      if (candidate) out.push(candidate);
    }
  };
  if (projectRoot && isRecord(parsed.projects)) {
    const project = parsed.projects[projectRoot];
    if (isRecord(project)) collect(project.mcpServers);
  }
  collect(parsed.mcpServers);
  return out;
}

// ---------------------------------------------------------------------------
// Codex: ~/.codex/config.toml. Only the subset MCP entries use: tables,
// strings, string arrays (possibly multi-line) and inline tables.

type TomlValue = string | number | boolean | TomlValue[] | { [key: string]: TomlValue };

class TomlReader {
  private pos = 0;
  constructor(private readonly src: string) {}

  value(): TomlValue | undefined {
    this.skipSpace(true);
    const ch = this.src[this.pos];
    if (ch === '"') return this.src.startsWith('"""', this.pos) ? this.multiline('"""') : this.basic();
    if (ch === "'") return this.src.startsWith("'''", this.pos) ? this.multiline("'''") : this.literal();
    if (ch === "[") return this.array();
    if (ch === "{") return this.inlineTable();
    const match = /^[^\s,\]}#]+/.exec(this.src.slice(this.pos));
    if (!match) return undefined;
    this.pos += match[0].length;
    if (match[0] === "true") return true;
    if (match[0] === "false") return false;
    const num = Number(match[0].replace(/_/g, ""));
    return Number.isNaN(num) ? match[0] : num;
  }

  key(): string | undefined {
    this.skipSpace(false);
    const ch = this.src[this.pos];
    if (ch === '"') return this.basic();
    if (ch === "'") return this.literal();
    const match = /^[A-Za-z0-9_-]+/.exec(this.src.slice(this.pos));
    if (!match) return undefined;
    this.pos += match[0].length;
    return match[0];
  }

  /** Dotted key such as `a."b".c`. */
  dottedKey(): string[] {
    const parts: string[] = [];
    for (;;) {
      const part = this.key();
      if (part === undefined) break;
      parts.push(part);
      this.skipSpace(false);
      if (this.src[this.pos] !== ".") break;
      this.pos += 1;
    }
    return parts;
  }

  expect(ch: string): boolean {
    this.skipSpace(false);
    if (this.src[this.pos] !== ch) return false;
    this.pos += 1;
    return true;
  }

  get offset(): number {
    return this.pos;
  }

  private skipSpace(newlines: boolean) {
    for (;;) {
      const ch = this.src[this.pos];
      if (ch === " " || ch === "\t" || (newlines && (ch === "\n" || ch === "\r"))) {
        this.pos += 1;
      } else if (newlines && ch === "#") {
        while (this.pos < this.src.length && this.src[this.pos] !== "\n") this.pos += 1;
      } else {
        return;
      }
    }
  }

  private basic(): string {
    this.pos += 1;
    let out = "";
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos];
      if (ch === '"') {
        this.pos += 1;
        return out;
      }
      if (ch === "\\") {
        out += this.escape();
        continue;
      }
      out += ch;
      this.pos += 1;
    }
    return out;
  }

  private escape(): string {
    const next = this.src[this.pos + 1];
    this.pos += 2;
    switch (next) {
      case "n": return "\n";
      case "t": return "\t";
      case "r": return "\r";
      case "b": return "\b";
      case "f": return "\f";
      case '"': return '"';
      case "\\": return "\\";
      case "u":
      case "U": {
        const len = next === "u" ? 4 : 8;
        const hex = this.src.slice(this.pos, this.pos + len);
        this.pos += len;
        const code = Number.parseInt(hex, 16);
        return Number.isNaN(code) ? "" : String.fromCodePoint(code);
      }
      default: return next ?? "";
    }
  }

  private literal(): string {
    this.pos += 1;
    const end = this.src.indexOf("'", this.pos);
    const stop = end === -1 ? this.src.length : end;
    const out = this.src.slice(this.pos, stop);
    this.pos = stop + 1;
    return out;
  }

  private multiline(fence: string): string {
    this.pos += 3;
    if (this.src[this.pos] === "\n") this.pos += 1;
    const end = this.src.indexOf(fence, this.pos);
    const stop = end === -1 ? this.src.length : end;
    const out = this.src.slice(this.pos, stop);
    this.pos = stop + 3;
    return out;
  }

  private array(): TomlValue[] {
    this.pos += 1;
    const out: TomlValue[] = [];
    for (;;) {
      this.skipSpace(true);
      if (this.src[this.pos] === "]") {
        this.pos += 1;
        return out;
      }
      if (this.pos >= this.src.length) return out;
      const item = this.value();
      if (item === undefined) {
        this.pos += 1;
        continue;
      }
      out.push(item);
      this.skipSpace(true);
      if (this.src[this.pos] === ",") this.pos += 1;
    }
  }

  private inlineTable(): { [key: string]: TomlValue } {
    this.pos += 1;
    const out: { [key: string]: TomlValue } = {};
    for (;;) {
      this.skipSpace(true);
      if (this.src[this.pos] === "}") {
        this.pos += 1;
        return out;
      }
      if (this.pos >= this.src.length) return out;
      const path = this.dottedKey();
      if (path.length === 0 || !this.expect("=")) {
        this.pos += 1;
        continue;
      }
      const item = this.value();
      if (item !== undefined) assign(out, path, item);
      this.skipSpace(true);
      if (this.src[this.pos] === ",") this.pos += 1;
    }
  }
}

function assign(root: { [key: string]: TomlValue }, path: string[], value: TomlValue) {
  let node = root;
  for (const part of path.slice(0, -1)) {
    const next = node[part];
    if (next === undefined || typeof next !== "object" || Array.isArray(next)) {
      const created: { [key: string]: TomlValue } = {};
      node[part] = created;
      node = created;
    } else {
      node = next as { [key: string]: TomlValue };
    }
  }
  node[path[path.length - 1]] = value;
}

/** Parse the TOML subset Codex MCP entries use. Unsupported lines are skipped. */
export function parseTomlSubset(src: string): { [key: string]: TomlValue } {
  const root: { [key: string]: TomlValue } = {};
  let table: string[] = [];
  let i = 0;
  while (i < src.length) {
    const lineEnd = src.indexOf("\n", i);
    const line = src.slice(i, lineEnd === -1 ? src.length : lineEnd).trim();
    if (line.length === 0 || line.startsWith("#")) {
      i = lineEnd === -1 ? src.length : lineEnd + 1;
      continue;
    }
    if (line.startsWith("[[")) {
      // Arrays of tables are not used by MCP entries.
      table = ["\u0000skip"];
      i = lineEnd === -1 ? src.length : lineEnd + 1;
      continue;
    }
    if (line.startsWith("[")) {
      const reader = new TomlReader(line.slice(1));
      table = reader.dottedKey();
      i = lineEnd === -1 ? src.length : lineEnd + 1;
      continue;
    }
    const reader = new TomlReader(src.slice(i));
    const path = reader.dottedKey();
    if (path.length > 0 && reader.expect("=")) {
      const item = reader.value();
      if (item !== undefined && table[0] !== "\u0000skip") assign(root, [...table, ...path], item);
      const consumed = i + reader.offset;
      const next = src.indexOf("\n", consumed);
      i = next === -1 ? src.length : next + 1;
    } else {
      i = lineEnd === -1 ? src.length : lineEnd + 1;
    }
  }
  return root;
}

async function codexCandidates(): Promise<Candidate[]> {
  const home = process.env.CODEX_HOME && process.env.CODEX_HOME.length > 0
    ? process.env.CODEX_HOME
    : join(homedir(), ".codex");
  let src: string;
  try {
    src = await readFile(join(home, "config.toml"), "utf8");
  } catch {
    return [];
  }
  const parsed = parseTomlSubset(src);
  const servers = parsed.mcp_servers;
  if (!isRecord(servers)) return [];
  const out: Candidate[] = [];
  for (const [name, entry] of Object.entries(servers)) {
    const candidate = fromEntry("codex", name, entry);
    if (candidate) out.push(candidate);
  }
  return out;
}

// ---------------------------------------------------------------------------

function mentionsBceTool(candidate: { command: string; args: string[] }): boolean {
  return [candidate.command, ...candidate.args].some((part) => /bce-tool/i.test(part));
}

function pickCandidate(candidates: Candidate[], preferred: string): Candidate | null {
  const wanted = preferred.trim();
  if (wanted.length > 0) return candidates.find((item) => item.server === wanted) ?? null;
  return candidates.find((item) => item.server.toLowerCase().includes("bce"))
    ?? candidates.find(mentionsBceTool)
    ?? null;
}

/** Split a command line on whitespace, honoring single quotes, double quotes and backslashes. */
export function splitCommandLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let started = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
      else current += ch;
      continue;
    }
    // Windows paths keep their backslashes; only \" is an escape there.
    if (ch === "\\" && i + 1 < line.length && (process.platform !== "win32" || line[i + 1] === '"')) {
      current += line[i + 1];
      i += 1;
      started = true;
      continue;
    }
    if (quote === '"') {
      if (ch === '"') quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (started) out.push(current);
      current = "";
      started = false;
      continue;
    }
    current += ch;
    started = true;
  }
  if (started) out.push(current);
  return out;
}

function withNoBrowser(command: string, args: string[]): string[] {
  if (!mentionsBceTool({ command, args })) return args;
  return args.includes(NO_BROWSER_FLAG) ? args : [...args, NO_BROWSER_FLAG];
}

function specKey(command: string, args: string[], env: Record<string, string>): string {
  const sortedEnv = Object.keys(env).sort().map((key) => [key, env[key]]);
  return JSON.stringify([command, args, sortedEnv]);
}

/**
 * Settings command line wins. Otherwise reuse the user's Claude Code entry, then
 * Codex. `--no-webbrowser-enhance-prompt` is added so the review page cannot block.
 */
export async function resolveLaunch(
  settings: { server: string; command: string },
  projectRoot: string | undefined,
): Promise<LaunchSpec | null> {
  const custom = splitCommandLine(settings.command.trim());
  if (custom.length > 0) {
    const [command, ...rest] = custom;
    const args = withNoBrowser(command, rest);
    return { source: "settings", server: "settings", command, args, env: {}, key: specKey(command, args, {}) };
  }
  const candidates = [...(await claudeCandidates(projectRoot)), ...(await codexCandidates())];
  const picked = pickCandidate(candidates, settings.server);
  if (!picked) return null;
  const args = withNoBrowser(picked.command, picked.args);
  return {
    source: picked.source,
    server: picked.server,
    command: picked.command,
    args,
    env: picked.env,
    key: specKey(picked.command, args, picked.env),
  };
}

// ---------------------------------------------------------------------------
// PATH: the Desktop-managed daemon often starts with a short GUI PATH, so npx
// and node may be missing. Merge the login shell PATH and common install dirs.

let loginPath: Promise<string> | undefined;

async function readLoginShellPath(): Promise<string> {
  if (process.platform === "win32") return "";
  const shell = process.env.SHELL && process.env.SHELL.length > 0 ? process.env.SHELL : "/bin/zsh";
  try {
    const { stdout } = await execCommand(
      shell,
      ["-ilc", 'printf "__DSHBCE__%s__DSHBCE__" "$PATH"'],
      { timeout: 5_000 },
    );
    const match = /__DSHBCE__(.*?)__DSHBCE__/s.exec(stdout);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}

function commonDirs(): string[] {
  if (process.platform === "win32") return [];
  const home = homedir();
  return [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    join(home, ".local", "bin"),
    join(home, ".volta", "bin"),
    join(home, ".bun", "bin"),
    join(home, "Library", "pnpm"),
  ];
}

/** Child environment: daemon env, the entry's own env, and a widened PATH. */
export async function childEnv(spec: LaunchSpec): Promise<NodeJS.ProcessEnv> {
  loginPath ??= readLoginShellPath();
  const shellPath = await loginPath;
  const pathKey = Object.keys(process.env).find((key) => key.toUpperCase() === "PATH") ?? "PATH";
  const parts = [
    ...(spec.env[pathKey] ?? "").split(delimiter),
    ...(process.env[pathKey] ?? "").split(delimiter),
    ...shellPath.split(delimiter),
    ...commonDirs(),
  ].filter((part) => part.length > 0);
  const merged = [...new Set(parts)].join(delimiter);
  return { ...process.env, ...spec.env, [pathKey]: merged };
}

// ---------------------------------------------------------------------------

/** Values worth hiding from logs, errors and the settings screen. */
export function secretsOf(spec: LaunchSpec): string[] {
  const out: string[] = [];
  spec.args.forEach((arg, index) => {
    const eq = arg.indexOf("=");
    if (arg.startsWith("-") && eq > 0 && SECRET_NAME.test(arg.slice(0, eq))) {
      out.push(arg.slice(eq + 1));
    } else if (arg.startsWith("-") && SECRET_NAME.test(arg) && index + 1 < spec.args.length) {
      out.push(spec.args[index + 1]);
    }
  });
  for (const [key, value] of Object.entries(spec.env)) {
    if (SECRET_NAME.test(key)) out.push(value);
  }
  return out.filter((item) => item.length >= 4);
}

export function redact(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of secrets) out = out.split(secret).join("***");
  return out;
}

/** Display form of the command with secrets masked. */
export function describeLaunch(spec: LaunchSpec): string {
  const quote = (part: string) => (/[\s"']/.test(part) ? JSON.stringify(part) : part);
  return redact([spec.command, ...spec.args].map(quote).join(" "), secretsOf(spec));
}
