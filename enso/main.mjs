// BCE credentials stay in the user's Enso MCP entry. This plugin only sees tool text.
//
// Abort limitation (Enso 0.2.13): `enso.mcp.call(server, tool, args)` takes no
// AbortSignal. An in-flight call is cancelled only when the host aborts the
// invocation signal — the renderer method timing out (max 120s), an explicit
// cancel, or Enso's own 120s MCP timer (`plugin-mcp-cancel`). Returning a
// timeout result does not abort the call. Throwing would, because a failed UI
// call runs `invocations.cancel`, but that failure also counts toward the
// 5-strike / 30s UI circuit breaker. The 90s enhance budget therefore stops
// waiting and reports `timeout`; `enhance_prompt` itself keeps running until
// it finishes or Enso's 120s MCP cap cancels it. Indexing has no plugin-side
// timer: it uses that same MCP cap. Index and enhance share one 120s method
// budget, which is Enso's maximum for a renderer method.

export const ENHANCE_TIMEOUT_MS = 90_000

const INDEX_TIMEOUT_MESSAGE = 'Indexing timed out. Raise toolCallTimeoutMs on the bce-tool MCP entry.'
const ENHANCE_TIMEOUT_MESSAGE = `Enhancement timed out (${ENHANCE_TIMEOUT_MS / 1000}s). Add --no-webbrowser-enhance-prompt to the bce-tool MCP args if the review page is blocking.`

/**
 * Servers that expose `enhance_prompt`: configured name, else a name containing
 * "bce", else the first. `search_context` counts only on the chosen server.
 */
export function pickServer(tools, preferred) {
  const enhanceServers = []
  const searchServers = new Set()
  for (const tool of Array.isArray(tools) ? tools : []) {
    if (tool === null || typeof tool !== 'object') continue
    const server = tool.server
    const name = tool.name
    if (typeof server !== 'string' || server.length === 0 || typeof name !== 'string') continue
    if (name === 'enhance_prompt' && !enhanceServers.includes(server)) enhanceServers.push(server)
    if (name === 'search_context') searchServers.add(server)
  }
  if (enhanceServers.length === 0) return null
  const wanted = typeof preferred === 'string' ? preferred.trim() : ''
  const server = (wanted && enhanceServers.find((item) => item === wanted))
    || enhanceServers.find((item) => item.toLowerCase().includes('bce'))
    || enhanceServers[0]
  return {
    server,
    hasSearch: searchServers.has(server),
  }
}

/** Only meaningful for failed results: successful text may quote these phrases. */
export function classifyFailure(text) {
  const lower = String(text).toLowerCase()
  if (lower.includes('not managed by git') || lower.includes('not a git repository')) return 'not_git'
  if (lower.includes('too large to index') || (lower.includes('exceeds the') && lower.includes('mb'))) return 'too_large'
  if (lower.includes('timed out') || lower.includes('timeout') || lower.includes('tool call aborted')) return 'timeout'
  return undefined
}

function fail(code, message) {
  return { ok: false, code, message }
}

function contentOf(result) {
  return result !== null && typeof result === 'object' && typeof result.content === 'string'
    ? result.content.trim()
    : ''
}

/** `mcp.call` reports tool failures as results. Some hosts also prefix text with `Error:`. */
function isFailure(result, text) {
  return Boolean(result?.isError) || text.startsWith('Error:')
}

export function isTimeoutError(error) {
  if (typeof error === 'object' && error !== null) {
    if (error.name === 'AbortError') return true
    if (error.code === 'TIMEOUT' || error.code === 'ABORTED' || error.code === 'timeout') return true
  }
  const message = error instanceof Error ? error.message : String(error)
  return /abort|timeout/i.test(message)
}

function watchAbort(signal) {
  if (signal === undefined || signal === null) return { promise: new Promise(() => {}), cancel() {} }
  let onAbort = () => {}
  const promise = new Promise((_, reject) => {
    onAbort = () => {
      reject(Object.assign(new Error('aborted'), { code: 'ABORTED', name: 'AbortError' }))
    }
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
  })
  return {
    promise,
    cancel() {
      signal.removeEventListener('abort', onAbort)
    },
  }
}

/**
 * Stop waiting after `ms`. This does not abort `work`: Enso's mcp.call has no
 * cancel handle, and failing the renderer method on purpose would trip the UI
 * circuit breaker. See the file header.
 */
function raceTimeout(work, ms, signal) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(Object.assign(new Error('timed out'), { code: 'TIMEOUT' }))
    }, ms)
  })
  const aborted = watchAbort(signal)
  return Promise.race([work, timeout, aborted.promise]).finally(() => {
    clearTimeout(timer)
    aborted.cancel()
  })
}

async function preferredServer(enso) {
  const config = await enso.config.get()
  return config !== null && typeof config === 'object' && typeof config.server === 'string'
    ? config.server
    : ''
}

export async function enhance(enso, args, ctx) {
  const prompt = typeof args?.prompt === 'string' ? args.prompt.trim() : ''
  if (prompt.length === 0) return fail('empty_prompt', 'prompt is empty')
  if (typeof ctx?.projectRoot !== 'string' || ctx.projectRoot.length === 0) {
    return fail('no_workspace', 'workspace path is missing')
  }

  let preferred = ''
  try {
    preferred = await preferredServer(enso)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return fail('upstream', message)
  }

  let listed
  try {
    listed = await enso.mcp.tools()
  } catch (error) {
    if (isTimeoutError(error)) return fail('index_timeout', INDEX_TIMEOUT_MESSAGE)
    const message = error instanceof Error ? error.message : String(error)
    return fail('upstream', message)
  }

  const picked = pickServer(listed, preferred)
  if (picked === null) {
    return fail(
      'mcp_missing',
      'BCE MCP enhance_prompt was not found. Configure bce-tool in this profile with --no-webbrowser-enhance-prompt.',
    )
  }

  let warning
  if (picked.hasSearch) {
    let searched
    try {
      searched = await enso.mcp.call(picked.server, 'search_context', {
        project_root_path: ctx.projectRoot,
        query: prompt,
      })
    } catch (error) {
      if (isTimeoutError(error)) return fail('index_timeout', INDEX_TIMEOUT_MESSAGE)
      const message = error instanceof Error ? error.message : String(error)
      return fail('index_failed', message)
    }
    const searchText = contentOf(searched)
    if (isFailure(searched, searchText)) {
      const searchCode = classifyFailure(searchText)
      if (searchCode === 'timeout') return fail('index_timeout', INDEX_TIMEOUT_MESSAGE)
      if (searchCode !== undefined) return fail(searchCode, searchText)
      return fail('index_failed', searchText || 'search_context failed')
    }
  } else {
    warning = 'no_index'
  }

  let enhanced
  try {
    enhanced = await raceTimeout(
      enso.mcp.call(picked.server, 'enhance_prompt', {
        project_root_path: ctx.projectRoot,
        prompt,
        conversation_history: '',
      }),
      ENHANCE_TIMEOUT_MS,
      ctx.signal,
    )
  } catch (error) {
    if (isTimeoutError(error)) return fail('timeout', ENHANCE_TIMEOUT_MESSAGE)
    const message = error instanceof Error ? error.message : String(error)
    return fail('upstream', message)
  }

  const text = contentOf(enhanced)
  if (isFailure(enhanced, text)) {
    const enhanceCode = classifyFailure(text)
    if (enhanceCode === 'timeout') return fail('timeout', ENHANCE_TIMEOUT_MESSAGE)
    if (enhanceCode !== undefined) return fail(enhanceCode, text)
    return fail('upstream', text || 'enhance_prompt failed')
  }
  if (text.length === 0) return fail('upstream', 'enhance_prompt returned empty text')
  return warning === undefined ? { ok: true, text } : { ok: true, text, warning }
}

export function activate(enso) {
  enso.renderer.handle('enhance', (args, ctx) => enhance(enso, args, ctx))
}
