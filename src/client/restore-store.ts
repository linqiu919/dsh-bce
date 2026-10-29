type RestoreSnap = {
  sessionId: string | undefined
  original: string
  enhanced: string
}

let snap: RestoreSnap | undefined
const listeners = new Set<() => void>()

export function getRestore(): RestoreSnap | undefined {
  return snap
}

export function subscribeRestore(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function setRestore(next: RestoreSnap | undefined): void {
  snap = next
  for (const listener of listeners) listener()
}
