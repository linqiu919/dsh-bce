import type { Context } from '@deepseek-ai/cordis'
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import {
  ENHANCE_TIMEOUT_MS,
  type EnhanceErrorCode,
  type EnhanceOk,
  type EnhanceRequest,
  type RpcResult,
} from './protocol.ts'

const ENHANCE_SUFFIX = '__enhance_prompt'
const SEARCH_SUFFIX = '__search_context'
const MCP_PREFIX = 'mcp__'

interface DiscoveredTools {
  enhance: string
  search?: string
}

function fail(code: EnhanceErrorCode, message: string): RpcResult<EnhanceOk> {
  return { ok: false, error: { code, message, details: {} } }
}

function ok(value: EnhanceOk): RpcResult<EnhanceOk> {
  return { ok: true, value }
}

function toolNames(ctx: Context): string[] {
  const names = new Set<string>()
  const runtime = ctx.tools as {
    schemas?: () => readonly { name?: string }[]
    definitions?: (scope?: unknown, toolSet?: unknown) => readonly { name?: string }[]
  }
  try {
    for (const schema of runtime.schemas?.() ?? []) {
      if (typeof schema?.name === 'string' && schema.name.length > 0) names.add(schema.name)
    }
  } catch { /* older runtimes */ }
  try {
    for (const definition of runtime.definitions?.() ?? []) {
      if (typeof definition?.name === 'string' && definition.name.length > 0) names.add(definition.name)
    }
  } catch { /* 0.1.1 has no definitions() */ }
  return [...names]
}

function serverOf(name: string, suffix: string): string | undefined {
  const index = name.indexOf(suffix)
  if (index <= 0) return undefined
  if (name.startsWith(MCP_PREFIX)) {
    return name.slice(MCP_PREFIX.length, index)
  }
  return name.slice(0, index).replace(/_+$/g, '') || undefined
}

function preferBce(servers: string[]): string | undefined {
  if (servers.length === 0) return undefined
  const ranked = servers.filter((server) => server.toLowerCase().includes('bce'))
  return ranked[0] ?? servers[0]
}

export function discoverBceTools(ctx: Context): DiscoveredTools | undefined {
  const names = toolNames(ctx)
  const enhanceByServer = new Map<string, string>()
  const searchByServer = new Map<string, string>()

  for (const name of names) {
    const enhanceServer = serverOf(name, ENHANCE_SUFFIX)
    if (enhanceServer !== undefined) enhanceByServer.set(enhanceServer, name)
    const searchServer = serverOf(name, SEARCH_SUFFIX)
    if (searchServer !== undefined) searchByServer.set(searchServer, name)
  }

  const server = preferBce([...enhanceByServer.keys()])
  if (server === undefined) return undefined
  const enhance = enhanceByServer.get(server)
  if (enhance === undefined) return undefined
  const search = searchByServer.get(server)
  return {
    enhance,
    ...(search === undefined ? {} : { search }),
  }
}

function contentText(result: ToolExecutionResult): string {
  return result.content
    .map((block) => {
      if (block && typeof block === 'object' && 'type' in block && block.type === 'text' && 'text' in block) {
        return typeof block.text === 'string' ? block.text : ''
      }
      return ''
    })
    .filter((part) => part.length > 0)
    .join('\n')
    .trim()
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value !== null && typeof value === 'object') return value as Record<string, unknown>
  return undefined
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function workspacePathFromRegistry(ctx: Context, sessionId: string): string | undefined {
  const registry = ctx.get('workspaceRegistry') as { list?: () => unknown } | undefined
  const listed = typeof registry?.list === 'function' ? registry.list() : undefined
  const rows = Array.isArray(listed) ? listed : []
  for (const row of rows) {
    const rec = asRecord(row)
    if (rec === undefined) continue
    const ids = rec.sessionIds
    if (!Array.isArray(ids) || !ids.includes(sessionId)) continue
    const path = nonEmpty(rec.path)
    if (path !== undefined) return path
  }
  return undefined
}

function resolveWorkspacePath(ctx: Context, record: EnhanceRequest): string | undefined {
  const direct = nonEmpty(record.workspacePath)
  if (direct !== undefined) return direct
  const sessionId = nonEmpty(record.sessionId)
  if (sessionId === undefined) return undefined
  return workspacePathFromRegistry(ctx, sessionId)
}

function classifyToolText(text: string, isError: boolean): EnhanceErrorCode | undefined {
  const lower = text.toLowerCase()
  if (lower.includes('not managed by git') || lower.includes('not a git repository')) return 'not_git'
  if (lower.includes('too large to index') || (lower.includes('exceeds the') && lower.includes('mb'))) return 'too_large'
  if (text.startsWith('Error:') || isError) return 'index_failed'
  if (lower.includes('tool unavailable')) return 'upstream'
  return undefined
}

function isAbortError(error: unknown): boolean {
  if (error instanceof Error && error.name === 'AbortError') return true
  if (typeof error === 'object' && error !== null && 'name' in error && (error as { name: unknown }).name === 'AbortError') {
    return true
  }
  const message = error instanceof Error ? error.message : String(error)
  return /abort|timeout/i.test(message)
}

async function callTool(
  ctx: Context,
  name: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
): Promise<ToolExecutionResult> {
  return ctx.tools.execute({
    callId: `dsh-bce-${Date.now()}-${Math.random().toString(16).slice(2)}` as never,
    name,
    arguments: args,
    signal,
  })
}

export async function enhancePrompt(
  ctx: Context,
  payload: unknown,
  signal: AbortSignal,
): Promise<RpcResult<EnhanceOk>> {
  if (typeof payload !== 'object' || payload === null) {
    return fail('empty_prompt', 'payload must be an object')
  }
  const record = payload as EnhanceRequest
  const prompt = typeof record.prompt === 'string' ? record.prompt.trim() : ''
  if (prompt.length === 0) return fail('empty_prompt', 'prompt is empty')

  const workspacePath = resolveWorkspacePath(ctx, record) ?? ''
  if (workspacePath.length === 0) return fail('no_workspace', 'workspace path is missing')

  const tools = discoverBceTools(ctx)
  if (tools === undefined) {
    return fail(
      'mcp_missing',
      'BCE MCP enhance_prompt was not found. Configure bce-tool in this profile with --no-webbrowser-enhance-prompt.',
    )
  }

  let warning: EnhanceOk['warning']
  if (tools.search !== undefined) {
    let searchResult: ToolExecutionResult
    try {
      searchResult = await callTool(ctx, tools.search, {
        project_root_path: workspacePath,
        query: prompt,
      }, signal)
    } catch (error) {
      if (isAbortError(error)) {
        return fail('timeout', 'Indexing timed out. Raise toolCallTimeoutMs on the bce-tool MCP entry.')
      }
      const message = error instanceof Error ? error.message : String(error)
      return fail('index_failed', message)
    }
    const searchText = contentText(searchResult)
    const searchCode = classifyToolText(searchText, searchResult.isError)
    if (searchCode === 'not_git' || searchCode === 'too_large') {
      return fail(searchCode, searchText || searchCode)
    }
    if (searchCode !== undefined) {
      return fail('index_failed', searchText || 'search_context failed')
    }
  } else {
    warning = 'no_index'
  }

  const enhanceAbort = new AbortController()
  const onParentAbort = () => enhanceAbort.abort()
  if (signal.aborted) enhanceAbort.abort()
  else signal.addEventListener('abort', onParentAbort, { once: true })
  const timer = setTimeout(() => enhanceAbort.abort(), ENHANCE_TIMEOUT_MS)

  let enhanceResult: ToolExecutionResult
  try {
    enhanceResult = await callTool(ctx, tools.enhance, {
      project_root_path: workspacePath,
      prompt,
      conversation_history: '',
    }, enhanceAbort.signal)
  } catch (error) {
    if (isAbortError(error) || enhanceAbort.signal.aborted) {
      return fail(
        'timeout',
        `Enhancement timed out (${ENHANCE_TIMEOUT_MS / 1000}s). Add --no-webbrowser-enhance-prompt to the bce-tool MCP args if the review page is blocking.`,
      )
    }
    const message = error instanceof Error ? error.message : String(error)
    return fail('upstream', message)
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', onParentAbort)
  }

  const text = contentText(enhanceResult)
  const enhanceCode = classifyToolText(text, enhanceResult.isError)
  if (enhanceCode === 'not_git' || enhanceCode === 'too_large' || enhanceCode === 'timeout') {
    return fail(enhanceCode, text || enhanceCode)
  }
  if (enhanceCode !== undefined) {
    return fail('upstream', text || 'enhance_prompt failed')
  }
  if (text.length === 0) return fail('upstream', 'enhance_prompt returned empty text')

  return ok(warning === undefined ? { text } : { text, warning })
}
