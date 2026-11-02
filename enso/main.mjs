// BCE credentials stay in the user's Enso MCP entry. This plugin only sees tool text.
//
// Abort limitation (Enso 0.2.13): `enso.mcp.call(server, tool, args)` takes no
// AbortSignal. An in-flight call is cancelled only when the host aborts the
// invocation — the renderer method timing out, an explicit cancel, or Enso's
// own 120s MCP timer (`plugin-mcp-cancel`). The manifest caps this method at
// 90s, and index plus rewrite share that budget. The plugin stops waiting
// HOST_LEAD_MS early and returns `index_timeout` or `timeout`, so the UI can
// show that message before Enso cancels the call and surfaces a generic
// TIMEOUT. Returning does not itself abort the MCP call. Throwing would,
// because a failed UI call runs `invocations.cancel`, but that failure also
// counts toward the 5-strike / 30s UI circuit breaker.

export const ENHANCE_TIMEOUT_MS = 90_000
/** Settle before the host's matching 90s cancel so the friendly code wins. */
export const HOST_LEAD_MS = 1_500

const INDEX_TIMEOUT_MESSAGE = 'Indexing used up the 90s limit shared with enhancement.'
const ENHANCE_TIMEOUT_MESSAGE = `Enhancement timed out (${ENHANCE_TIMEOUT_MS / 1000}s). Indexing and rewriting share this limit. Add --no-webbrowser-enhance-prompt to the bce-tool MCP args if the review page is blocking.`

/** Milliseconds left in the shared 90s budget, excluding the host lead. */
export function waitBudget(elapsedMs) {
  return Math.max(0, ENHANCE_TIMEOUT_MS - HOST_LEAD_MS - elapsedMs)
}

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

export async function copyText(enso, args) {
  const text = typeof args?.text === 'string' ? args.text : ''
  if (text.trim().length === 0) return fail('empty_prompt', 'nothing to copy')
  try {
    await enso.ui.clipboard.writeText(text)
  } catch (error) {
    const code = typeof error === 'object' && error !== null && typeof error.code === 'string'
      ? error.code
      : 'upstream'
    const message = error instanceof Error ? error.message : String(error)
    return fail(code, message)
  }
  return { ok: true }
}

export async function enhance(enso, args, ctx) {
  const started = Date.now()
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
    const indexBudget = waitBudget(Date.now() - started)
    if (indexBudget <= 0) return fail('index_timeout', INDEX_TIMEOUT_MESSAGE)
    let searched
    try {
      searched = await raceTimeout(
        enso.mcp.call(picked.server, 'search_context', {
          project_root_path: ctx.projectRoot,
          query: prompt,
        }),
        indexBudget,
        ctx.signal,
      )
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

  const enhanceBudget = waitBudget(Date.now() - started)
  if (enhanceBudget <= 0) return fail('timeout', ENHANCE_TIMEOUT_MESSAGE)
  let enhanced
  try {
    enhanced = await raceTimeout(
      enso.mcp.call(picked.server, 'enhance_prompt', {
        project_root_path: ctx.projectRoot,
        prompt,
        conversation_history: '',
      }),
      enhanceBudget,
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
  enso.renderer.handle('copy', (args) => copyText(enso, args))
}
