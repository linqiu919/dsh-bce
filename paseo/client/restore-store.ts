// Original drafts before enhancement, per agent, so "Restore original" works
// after the composer item remounts (the phone overflow sheet mounts it on demand).

export interface RestoreEntry {
  original: string;
  enhanced: string;
}

const entries = new Map<string, RestoreEntry>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version += 1;
  for (const listener of listeners) listener();
}

export function subscribeRestore(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function restoreVersion(): number {
  return version;
}

export function restoreEntries(): ReadonlyMap<string, RestoreEntry> {
  return entries;
}

/** Keep the first original across chained enhancements of the same agent. */
export function rememberEnhancement(agentId: string, prompt: string, enhanced: string): void {
  const previous = entries.get(agentId);
  const original = previous !== undefined && prompt === previous.enhanced.trim() ? previous.original : prompt;
  entries.set(agentId, { original, enhanced });
  emit();
}

/** Drop one agent's entry: after a restore, or once its draft is cleared. */
export function forgetRestore(agentId: string): void {
  if (!entries.delete(agentId)) return;
  emit();
}

export function clearRestore(): void {
  if (entries.size === 0) return;
  entries.clear();
  emit();
}
