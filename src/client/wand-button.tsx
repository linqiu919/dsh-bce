import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { Context } from '@deepseek-ai/cordis'
import React from 'react'
import { LOCALE_NAMESPACE, NAMESPACE } from './constants.ts'
import type { BceLocaleKey } from './locales.ts'
import { RPC_CHANNEL, RPC_ENDPOINT, type EnhanceOk, type RpcResult } from '../protocol.ts'
import { getRestore, setRestore, subscribeRestore } from './restore-store.ts'

type SessionListLike = {
  current?: string
  byId?: Record<string, { cwd?: string }>
}

type WorkspaceListLike = {
  items?: readonly {
    workspaceId?: string
    id?: string
    path?: string
    sessionIds?: readonly string[]
  }[]
  recentWorkspaceId?: string
}

type InputLike = {
  draft: string
  phase?: string
}

type WandProps = PropsLocale<typeof LOCALE_NAMESPACE> & {
  session?: unknown
  input?: InputLike
  inputActions?: { setDraft: (text: string) => void }
  useInput?: <T>(selector: (state: InputLike) => T) => T
}

type ListHolder = {
  list?: { getSnapshot?: () => unknown }
}

type WorkspaceRef = { path: string | undefined; sessionId: string | undefined }

type StatusLevel = 'idle' | 'busy' | 'ok' | 'error'

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function cwdOf(value: unknown): string | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const rec = value as Record<string, unknown>
  return nonEmpty(rec.cwd) ?? cwdOf(rec.header)
}

function snapshotOf(holder: ListHolder | undefined): unknown {
  try {
    return holder?.list?.getSnapshot?.()
  } catch {
    return undefined
  }
}

function hookValue(props: object, name: string): unknown {
  const hook = (props as Record<string, unknown>)[name]
  if (typeof hook !== 'function') return undefined
  try {
    return (hook as (select: (state: unknown) => unknown) => unknown)((state) => state)
  } catch {
    return undefined
  }
}

function resolveWorkspace(
  props: WandProps,
  extras: { sessions: ListHolder | undefined; workspaces: ListHolder | undefined },
): WorkspaceRef {
  const session = hookValue(props, 'useSession') ?? props.session
  const sessions = (hookValue(props, 'useSessions') ?? snapshotOf(extras.sessions)) as SessionListLike | undefined
  const workspaces = (hookValue(props, 'useWorkspaces') ?? snapshotOf(extras.workspaces)) as WorkspaceListLike | undefined
  const sessionId = nonEmpty((props as Record<string, unknown>).sessionId) ?? nonEmpty(sessions?.current)

  const fromSession = cwdOf(session)
  if (fromSession !== undefined) return { path: fromSession, sessionId }

  if (sessionId !== undefined) {
    const rowCwd = cwdOf(sessions?.byId?.[sessionId])
    if (rowCwd !== undefined) return { path: rowCwd, sessionId }
  }

  const items = workspaces?.items ?? []
  if (sessionId !== undefined) {
    const owned = items.find((item) => item.sessionIds?.includes(sessionId))
    const ownedPath = nonEmpty(owned?.path)
    if (ownedPath !== undefined) return { path: ownedPath, sessionId }
  }

  const recentId = nonEmpty(workspaces?.recentWorkspaceId)
  if (recentId !== undefined) {
    const recent = items.find((item) => item.workspaceId === recentId || item.id === recentId)
    const recentPath = nonEmpty(recent?.path)
    if (recentPath !== undefined) return { path: recentPath, sessionId }
  }

  return { path: undefined, sessionId }
}

function messageFor(code: string, t: (key: BceLocaleKey) => string): string {
  switch (code) {
    case 'mcp_missing': return t('wand.mcpMissing')
    case 'no_workspace': return t('wand.noWorkspace')
    case 'empty_prompt': return t('wand.empty')
    case 'not_git': return t('wand.notGit')
    case 'too_large': return t('wand.tooLarge')
    case 'timeout': return t('wand.timeout')
    case 'index_failed': return t('wand.indexFailed')
    case 'no_rpc': return t('wand.noRpc')
    default: return t('wand.upstream')
  }
}

function readRpc(ctx: Context): ClientConnectionRpc | undefined {
  const connection = ctx.get('connection') as { rpc?: ClientConnectionRpc } | undefined
  return connection?.rpc
}

function parseEnhanceResult(value: unknown): RpcResult<EnhanceOk> | undefined {
  let current: unknown = value
  if (typeof current === 'object' && current !== null && 'result' in current) {
    current = (current as { result: unknown }).result
  }
  if (typeof current !== 'object' || current === null) return undefined
  const rec = current as Record<string, unknown>
  if (rec.ok === true) {
    const payload = rec.value
    if (typeof payload === 'object' && payload !== null && typeof (payload as { text?: unknown }).text === 'string') {
      return { ok: true, value: payload as EnhanceOk }
    }
  }
  if (rec.ok === false && typeof rec.error === 'object' && rec.error !== null) {
    const error = rec.error as { code?: unknown; message?: unknown; details?: { code?: unknown } }
    const nested = error.details?.code
    const code = typeof error.code === 'string' && error.code !== 'internal'
      ? error.code
      : (typeof nested === 'string' ? nested : 'upstream')
    return {
      ok: false,
      error: {
        code,
        message: typeof error.message === 'string' ? error.message : code,
        details: {},
      },
    }
  }
  return undefined
}

function WandIcon(): React.ReactElement {
  return (
    <svg
      className="dshbce-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72" />
      <path d="m14 7 3 3" />
      <path d="M5 6v4" />
      <path d="M19 14v4" />
      <path d="M10 2v2" />
      <path d="M7 8H3" />
      <path d="M21 16h-4" />
      <path d="M11 3H9" />
    </svg>
  )
}

function WandButton(props: WandProps & {
  ctx: Context
  sessionsStore?: ListHolder | undefined
  workspacesStore?: ListHolder | undefined
}): React.ReactElement {
  const { t, ctx, inputActions, sessionsStore, workspacesStore } = props
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('')
  const [level, setLevel] = React.useState<StatusLevel>('idle')
  const lock = React.useRef(false)

  const draftFromHook = props.useInput?.((state) => state.draft)
  const draft = typeof draftFromHook === 'string' ? draftFromHook : (props.input?.draft ?? '')
  const extras = { sessions: sessionsStore, workspaces: workspacesStore }
  const sessionId = nonEmpty((props as Record<string, unknown>).sessionId)

  const empty = draft.trim().length === 0
  const disabled = busy || empty
  const title = empty ? t('wand.empty') : (status.length > 0 ? status : t('wand.label'))

  const announce = (nextLevel: StatusLevel, text: string) => {
    setStatus(text)
    setLevel(nextLevel)
  }

  React.useEffect(() => {
    if (level !== 'ok') return
    const timer = window.setTimeout(() => {
      setStatus('')
      setLevel('idle')
    }, 3500)
    return () => { window.clearTimeout(timer) }
  }, [level])

  const onClick = async () => {
    if (lock.current || empty) return
    lock.current = true
    setBusy(true)
    announce('busy', t('wand.enhancing'))
    const prompt = draft.trim()
    const workspace = resolveWorkspace(props, extras)
    try {
      if (workspace.path === undefined && workspace.sessionId === undefined) {
        announce('error', t('wand.noWorkspace'))
        return
      }
      const rpc = readRpc(ctx)
      if (rpc === undefined) {
        announce('error', t('wand.noRpc'))
        return
      }
      const result = await rpc.call(RPC_CHANNEL, RPC_ENDPOINT, {
        prompt,
        workspacePath: workspace.path,
        sessionId: workspace.sessionId ?? sessionId,
      })
      const parsed = parseEnhanceResult(result)
      if (parsed?.ok === true) {
        inputActions?.setDraft(parsed.value.text)
        const previous = getRestore()
        const sameSession = previous === undefined
          || previous.sessionId === undefined
          || previous.sessionId === sessionId
        const original = sameSession && previous !== undefined && prompt === previous.enhanced
          ? previous.original
          : prompt
        setRestore({ sessionId, original, enhanced: parsed.value.text })
        announce('ok', parsed.value.warning === 'no_index' ? t('wand.noIndex') : t('wand.done'))
        return
      }
      announce('error', messageFor(parsed?.error.code ?? 'upstream', t))
    } catch {
      announce('error', t('wand.upstream'))
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  const restore = React.useSyncExternalStore(subscribeRestore, getRestore, getRestore)
  const canRestore = restore !== undefined
    && (restore.sessionId === undefined || restore.sessionId === sessionId)
    && draft !== restore.original

  const onRestore = () => {
    if (restore === undefined || busy) return
    inputActions?.setDraft(restore.original)
    setRestore(undefined)
    announce('idle', '')
  }

  return (
    <span
      className="dshbce-wrap"
      data-empty={empty ? 'true' : 'false'}
      data-busy={busy ? 'true' : 'false'}
      title={title}
    >
      <span className="dshbce-control">
        <span className="dshbce-ring" aria-hidden="true" />
        <button
          type="button"
          className="dshbce-btn"
          data-busy={busy ? 'true' : 'false'}
          disabled={disabled}
          title={title}
          aria-label={title}
          aria-busy={busy}
          onMouseDown={(event) => { event.preventDefault() }}
          onClick={() => { void onClick() }}
        >
          <WandIcon />
        </button>
      </span>
      {status.length > 0 ? (
        <span className="dshbce-status" data-level={level}>{status}</span>
      ) : null}
      {canRestore && !busy ? (
        <button
          type="button"
          className="dshbce-restore"
          title={t('wand.restore')}
          onMouseDown={(event) => { event.preventDefault() }}
          onClick={onRestore}
        >
          {t('wand.restore')}
        </button>
      ) : null}
      <span className="dshbce-live" aria-live="polite">{status}</span>
    </span>
  )
}

export function registerWandButton(ctx: Context): void {
  const sessionsStore = ctx.get('sessions') as ListHolder | undefined
  const workspacesStore = ctx.get('workspaces') as ListHolder | undefined
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register(
    { name: 'conversation.input.left', id: NAMESPACE, order: -40, locale: LOCALE_NAMESPACE },
    (props: WandProps) => <WandButton {...props} ctx={ctx} sessionsStore={sessionsStore} workspacesStore={workspacesStore} />,
  ))
}
