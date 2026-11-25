import type { PluginClientContext } from "@getpaseo/plugin/client";

// Components need `composers({ agentId })`, which only the client context has.
let current: PluginClientContext | null = null;

export function setClient(client: PluginClientContext | null): void {
  current = client;
}

export function getClient(): PluginClientContext | null {
  return current;
}
