// Renderer module. Enso loads this file from a blob URL, so it must not import
// anything. Locale: Enso 0.2.13 does not pass a locale into onLoad. If a host
// exposes enso.locale / enso.language (string, object, or function), that wins;
// otherwise document.documentElement.lang, then navigator.languages.

const en = {
  'wand.label': 'Enhance prompt with BCE',
  'wand.enhancing': 'Enhancing prompt…',
  'wand.empty': 'Enter a prompt first.',
  'wand.noWorkspace': 'Open a workspace first.',
  'wand.mcpMissing': 'BCE MCP was not found. Add bce-tool to this profile with --no-webbrowser-enhance-prompt.',
  'wand.notGit': 'This folder is not a Git repository. bce-tool only indexes Git projects.',
  'wand.tooLarge': 'This project is too large to index. Trim it with .gitignore or .bceignore.',
  'wand.timeout': 'Timed out (90s). Indexing and enhancement share this limit. Add --no-webbrowser-enhance-prompt if a review page is blocking, or switch to a faster enhancement model in BCE.',
  'wand.indexFailed': 'Indexing failed. Check the bce-tool MCP logs.',
  'wand.indexTimeout': 'Indexing used up the 90s limit shared with enhancement.',
  'wand.draftChanged': 'The draft changed while enhancing, so it was not replaced.',
  'wand.upstream': 'Enhancement failed. Check MCP tool permissions and bce-tool logs.',
  'wand.noIndex': 'Enhanced without a fresh index (search_context was not found).',
  'wand.done': 'Prompt enhanced.',
  'wand.noRpc': 'Enhancement is not available. Confirm dsh-bce is installed in this profile and restart.',
  'wand.restore': 'Restore original',
  'wand.hasReferences': 'This draft has file or session references. Enso cannot replace the text and keep those chips.',
  'wand.tooBig': 'The enhanced prompt is over Enso\'s 32KB draft limit, so it was not written back.',
  'wand.draftBusy': 'The composer is composing or locked. Try again in a moment.',
  'wand.noSession': 'Open a conversation first.',
  'wand.noComposer': 'The composer is not available in this window.',
  'wand.copy': 'Copy enhanced text',
  'wand.copied': 'Copied the enhanced prompt.',
  'wand.copyFailed': 'Could not copy to the clipboard.',
}

const zh = {
  'wand.label': '用 BCE 增强提示',
  'wand.enhancing': '提示增强中',
  'wand.empty': '请先输入提示。',
  'wand.noWorkspace': '请先打开一个工作区。',
  'wand.mcpMissing': '未检测到 BCE MCP。请在当前 profile 配置 bce-tool，并加上 --no-webbrowser-enhance-prompt。',
  'wand.notGit': '当前目录不是 Git 仓库。bce-tool 默认只索引 Git 项目。',
  'wand.tooLarge': '项目过大，无法索引。请用 .gitignore 或 .bceignore 排除大目录后再试。',
  'wand.timeout': '已超时（90 秒）。索引和增强共用这个时限。请确认已加 --no-webbrowser-enhance-prompt，或在 BCE 中换用更快的增强模型。',
  'wand.indexFailed': '索引失败。请查看 bce-tool MCP 日志。',
  'wand.indexTimeout': '索引用尽了与增强共用的 90 秒。',
  'wand.draftChanged': '增强期间草稿已修改，未覆盖。',
  'wand.upstream': '增强失败。请检查 MCP 工具权限和 bce-tool 日志。',
  'wand.noIndex': '已增强，但未做索引（未找到 search_context）。',
  'wand.done': '提示已增强。',
  'wand.noRpc': '增强服务未就绪。请确认当前 profile 已安装 dsh-bce 并重启。',
  'wand.restore': '还原',
  'wand.hasReferences': '草稿含有文件或会话引用。Enso 不能只替换正文并保留这些引用。',
  'wand.tooBig': '增强结果超过 Enso 的 32KB 草稿上限，没有写回。',
  'wand.draftBusy': '输入框正在组字或已锁定，请稍后再试。',
  'wand.noSession': '当前没有会话。',
  'wand.noComposer': '当前窗口没有可用的输入框。',
  'wand.copy': '复制增强结果',
  'wand.copied': '已复制增强后的提示。',
  'wand.copyFailed': '无法写入剪贴板。',
}

const tables = { en, zh }

function normalizeLocale(value) {
  return typeof value === 'string' && value.trim().toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

function localeString(value) {
  if (typeof value === 'string' && value.trim().length > 0) return value
  if (typeof value === 'function') {
    try {
      return localeString(value())
    } catch {
      return undefined
    }
  }
  if (value !== null && typeof value === 'object') {
    return localeString(value.locale ?? value.language ?? value.lang)
  }
  return undefined
}

/** Enso locale when the host exposes one, otherwise the page, then the browser. */
export function pickLocale(enso, env) {
  const host = localeString(enso?.locale)
    ?? localeString(enso?.language)
    ?? localeString(enso?.lang)
    ?? localeString(enso?.i18n)
  if (host !== undefined) return normalizeLocale(host)
  const page = env?.documentLang ?? (typeof document !== 'undefined' ? document.documentElement?.lang : '')
  if (typeof page === 'string' && page.trim().length > 0) return normalizeLocale(page)
  const languages = env?.languages
    ?? (typeof navigator !== 'undefined'
      ? [...(navigator.languages ?? []), navigator.language].filter((item) => typeof item === 'string' && item.length > 0)
      : [])
  for (const language of languages) {
    if (typeof language === 'string' && language.trim().length > 0) return normalizeLocale(language)
  }
  return 'en'
}

export function messageFor(code, lang) {
  const table = tables[lang === 'zh' ? 'zh' : 'en']
  switch (code) {
    case 'mcp_missing': return table['wand.mcpMissing']
    case 'no_workspace': return table['wand.noWorkspace']
    case 'empty_prompt': return table['wand.empty']
    case 'not_git': return table['wand.notGit']
    case 'too_large': return table['wand.tooLarge']
    case 'index_failed': return table['wand.indexFailed']
    case 'index_timeout': return table['wand.indexTimeout']
    case 'no_rpc':
    case 'PLUGIN_DISABLED':
    case 'NOT_FOUND': return table['wand.noRpc']
    case 'draft_changed':
    case 'DRAFT_CHANGED': return table['wand.draftChanged']
    case 'DRAFT_HAS_REFERENCES': return table['wand.hasReferences']
    case 'TOO_LARGE': return table['wand.tooBig']
    case 'DRAFT_BUSY': return table['wand.draftBusy']
    case 'NO_SESSION': return table['wand.noSession']
    case 'NO_COMPOSER': return table['wand.noComposer']
    case 'TIMEOUT':
    case 'ABORTED':
    case 'timeout': return table['wand.timeout']
    case 'GESTURE_REQUIRED':
    case 'copy_failed': return table['wand.copyFailed']
    default: return table['wand.upstream']
  }
}

function isOversize(error) {
  const code = codeOf(error)
  if (code === 'TOO_LARGE') return true
  const message = error !== null && typeof error === 'object' && typeof error.message === 'string'
    ? error.message
    : ''
  return code === 'INVALID_ARGS' && /32\s?KB|32KB|过大/.test(message)
}

function codeOf(error) {
  return error !== null && typeof error === 'object' && typeof error.code === 'string' ? error.code : ''
}

/**
 * Read the draft, ask the host to index and rewrite, then replace only if the
 * generation/rev still matches. A live-draft mismatch bails out before write.
 */
export async function enhanceDraft(enso, sessionId, liveDraft, lang) {
  const language = lang === 'zh' ? 'zh' : 'en'
  let snap
  try {
    snap = await enso.composer.readDraft()
  } catch (error) {
    const code = codeOf(error) || 'upstream'
    return { ok: false, code, message: messageFor(code, language) }
  }
  const prompt = typeof snap?.text === 'string' ? snap.text.trim() : ''
  if (prompt.length === 0) {
    return { ok: false, code: 'empty_prompt', message: messageFor('empty_prompt', language) }
  }
  let result
  try {
    result = await enso.dispatch('plugin.call', { method: 'enhance', args: { prompt } })
  } catch (error) {
    const code = codeOf(error) || 'upstream'
    return { ok: false, code, message: messageFor(code, language) }
  }
  if (result?.ok !== true || typeof result.text !== 'string') {
    const code = typeof result?.code === 'string' ? result.code : 'upstream'
    return { ok: false, code, message: messageFor(code, language) }
  }
  const live = typeof liveDraft === 'function' ? liveDraft() : liveDraft
  if (String(live ?? '').trim() !== prompt) {
    return { ok: false, code: 'draft_changed', message: messageFor('draft_changed', language) }
  }
  try {
    await enso.composer.replaceDraft({
      text: result.text,
      expect: { generation: snap.generation, rev: snap.rev },
    })
  } catch (error) {
    const code = isOversize(error) ? 'TOO_LARGE' : (codeOf(error) || 'upstream')
    if (code === 'DRAFT_HAS_REFERENCES' || code === 'TOO_LARGE') {
      return { ok: false, code, message: messageFor(code, language), copyText: result.text }
    }
    return { ok: false, code, message: messageFor(code, language) }
  }
  return {
    ok: true,
    sessionId: sessionId ?? undefined,
    original: prompt,
    enhanced: result.text,
    ...(result.warning === undefined ? {} : { warning: result.warning }),
  }
}

/** Keep the first original across chained enhancements of the same session. */
export function nextRestore(previous, sessionId, prompt, enhanced) {
  const sessionKey = sessionId ?? undefined
  const sameSession = previous === undefined
    || previous.sessionId === undefined
    || previous.sessionId === sessionKey
  const original = sameSession && previous !== undefined && prompt === previous.enhanced
    ? previous.original
    : prompt
  return { sessionId: sessionKey, original, enhanced }
}

export function canRestore(restore, sessionId, draft, running) {
  const sessionKey = sessionId ?? undefined
  return !running
    && restore !== undefined
    && restore !== null
    && (restore.sessionId === undefined || restore.sessionId === sessionKey)
    && draft !== restore.original
}

/** How long a finished status stays next to the wand; busy and idle never auto-clear. */
export const STATUS_CLEAR_MS = { ok: 3500, error: 5000 }

export const STYLE = `
.dshbce-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  max-width: 280px;
}
.dshbce-control {
  position: relative;
  width: 28px;
  height: 28px;
  flex: none;
}
.dshbce-btn {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: var(--radius-md, 6px);
  background: var(--secondary, var(--muted, rgba(15, 23, 42, 0.05)));
  color: var(--muted-foreground);
  cursor: pointer;
  transition: background-color 0.12s cubic-bezier(0.16, 1, 0.3, 1), color 0.12s cubic-bezier(0.16, 1, 0.3, 1);
}
.dshbce-btn:hover {
  background: var(--accent, rgba(15, 23, 42, 0.08));
  color: var(--foreground);
}
.dshbce-btn:hover:active {
  transform: scale(0.96);
}
.dshbce-btn:disabled:not([data-busy='true']) {
  opacity: 0.45;
  cursor: not-allowed;
  color: var(--muted-foreground);
}
.dshbce-btn:disabled:not([data-busy='true']):hover {
  background: var(--secondary, var(--muted, rgba(15, 23, 42, 0.05)));
}
.dshbce-icon {
  width: 14px;
  height: 14px;
  display: block;
}
.dshbce-ring {
  position: absolute;
  z-index: 2;
  inset: 0;
  box-sizing: border-box;
  padding: 1.5px;
  border-radius: var(--radius-md, 6px);
  pointer-events: none;
  opacity: 0;
}
.dshbce-wrap[data-busy='true'] .dshbce-control {
  pointer-events: none;
}
.dshbce-wrap[data-busy='true'] .dshbce-ring {
  opacity: 0.72;
  animation: dshbce-from 1.6s linear infinite;
  background: conic-gradient(
    from var(--dshbce-from, 0deg) at 50% 50%,
    transparent 0deg,
    rgba(56, 189, 248, 0) 210deg,
    rgba(56, 189, 248, 0.35) 255deg,
    rgba(99, 102, 241, 0.55) 300deg,
    rgba(168, 85, 247, 0.4) 335deg,
    transparent 360deg
  );
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask-composite: exclude;
}
.dshbce-btn[data-busy='true'] {
  opacity: 1;
  cursor: progress;
  pointer-events: none;
  color: #4f46e5;
  background: var(--secondary, var(--muted, rgba(15, 23, 42, 0.05)));
}
.dshbce-btn[data-busy='true']:hover {
  color: #4f46e5;
  background: var(--secondary, var(--muted, rgba(15, 23, 42, 0.05)));
}
@property --dshbce-from {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}
@keyframes dshbce-from {
  to { --dshbce-from: 360deg; }
}
.dshbce-status {
  min-width: 0;
  max-width: 148px;
  font-size: 11px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--muted-foreground, #8b8b8b);
  pointer-events: none;
}
.dshbce-status[data-level='busy'] {
  color: #6366f1;
}
.dshbce-status[data-level='error'] {
  color: var(--destructive, #e5484d);
}
.dshbce-status[data-level='ok'] {
  color: var(--success, #30a46c);
}
@media (prefers-reduced-motion: reduce) {
  .dshbce-wrap[data-busy='true'] .dshbce-ring {
    animation: none;
    opacity: 0.45;
  }
  .dshbce-btn,
  .dshbce-restore {
    transition: none;
    animation: none;
  }
}
.dshbce-restore {
  height: 28px;
  padding: 0 8px;
  border: none;
  border-radius: var(--radius-md, 6px);
  background: transparent;
  color: var(--muted-foreground);
  font-size: 11px;
  line-height: 28px;
  cursor: pointer;
}
.dshbce-restore:hover {
  background: var(--accent, rgba(15, 23, 42, 0.08));
  color: var(--foreground);
}
.dshbce-live {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
`

let restoreSnap
const restoreListeners = new Set()

function getRestore() {
  return restoreSnap
}

function subscribeRestore(listener) {
  restoreListeners.add(listener)
  return () => { restoreListeners.delete(listener) }
}

function setRestore(next) {
  restoreSnap = next
  for (const listener of restoreListeners) listener()
}

function wandIcon(h) {
  return h('svg', {
    className: 'dshbce-icon',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    focusable: 'false',
  },
    h('path', { d: 'm21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72' }),
    h('path', { d: 'm14 7 3 3' }),
    h('path', { d: 'M5 6v4' }),
    h('path', { d: 'M19 14v4' }),
    h('path', { d: 'M10 2v2' }),
    h('path', { d: 'M7 8H3' }),
    h('path', { d: 'M21 16h-4' }),
    h('path', { d: 'M11 3H9' }),
  )
}

export function onLoad(enso) {
  const { React } = enso
  const h = React.createElement.bind(React)
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh.bce'
  style.textContent = STYLE
  document.head.appendChild(style)

  function EnhanceButton({ sessionId, draft }) {
    const text = typeof draft === 'string' ? draft : ''
    const [busy, setBusy] = React.useState(false)
    const [status, setStatus] = React.useState('')
    const [level, setLevel] = React.useState('idle')
    const [localeTick, setLocaleTick] = React.useState(0)
    const [copyText, setCopyText] = React.useState('')
    const lock = React.useRef(false)
    const draftRef = React.useRef(text)
    draftRef.current = text
    const levelRef = React.useRef(level)
    levelRef.current = level
    const snap = React.useSyncExternalStore(subscribeRestore, getRestore, getRestore)
    const lang = pickLocale(enso)
    const table = tables[lang]
    void localeTick

    React.useEffect(() => {
      const delay = STATUS_CLEAR_MS[level]
      if (delay === undefined) return undefined
      const timer = window.setTimeout(() => {
        setStatus('')
        setLevel('idle')
      }, delay)
      return () => { window.clearTimeout(timer) }
    }, [level, status])

    React.useEffect(() => {
      if (levelRef.current !== 'error') return
      setStatus('')
      setLevel('idle')
    }, [text])

    React.useEffect(() => {
      const bump = () => { setLocaleTick((value) => value + 1) }
      window.addEventListener?.('languagechange', bump)
      return () => { window.removeEventListener?.('languagechange', bump) }
    }, [])

    const empty = text.trim().length === 0
    const disabled = busy || empty
    const title = empty ? table['wand.empty'] : (status.length > 0 ? status : table['wand.label'])

    const announce = (nextLevel, nextStatus) => {
      setStatus(nextStatus)
      setLevel(nextLevel)
    }

    const onClick = async () => {
      if (lock.current || draftRef.current.trim().length === 0) return
      lock.current = true
      setBusy(true)
      announce('busy', table['wand.enhancing'])
      setCopyText('')
      try {
        const result = await enhanceDraft(enso, sessionId, () => draftRef.current, lang)
        if (result.ok !== true) {
          setCopyText(typeof result.copyText === 'string' ? result.copyText : '')
          announce('error', result.message)
          return
        }
        const previous = getRestore()
        setRestore(nextRestore(previous, result.sessionId, result.original, result.enhanced))
        announce('ok', result.warning === 'no_index' ? table['wand.noIndex'] : table['wand.done'])
      } finally {
        lock.current = false
        setBusy(false)
      }
    }

    const onCopy = async () => {
      if (copyText.length === 0 || lock.current) return
      try {
        const copied = await enso.dispatch('plugin.call', { method: 'copy', args: { text: copyText } })
        if (copied?.ok === true) {
          setCopyText('')
          announce('ok', table['wand.copied'])
          return
        }
        announce('error', messageFor(typeof copied?.code === 'string' ? copied.code : 'copy_failed', lang))
      } catch (error) {
        announce('error', messageFor(codeOf(error) || 'copy_failed', lang))
      }
    }

    const onRestore = async () => {
      const current = getRestore()
      if (current === undefined || lock.current) return
      try {
        await enso.composer.replaceDraft({ text: current.original })
        setRestore(undefined)
        announce('idle', '')
      } catch (error) {
        announce('error', messageFor(codeOf(error) || 'upstream', lang))
      }
    }

    const showRestore = canRestore(snap, sessionId, text, busy)

    return h('span', {
      className: 'dshbce-wrap',
      'data-empty': empty ? 'true' : 'false',
      'data-busy': busy ? 'true' : 'false',
      title,
    },
      h('span', { className: 'dshbce-control' },
        h('span', { className: 'dshbce-ring', 'aria-hidden': true }),
        h('button', {
          type: 'button',
          className: 'dshbce-btn',
          'data-busy': busy ? 'true' : 'false',
          disabled,
          title,
          'aria-label': title,
          'aria-busy': busy,
          onMouseDown: (event) => { event.preventDefault() },
          onClick: () => { void onClick() },
        }, wandIcon(h)),
      ),
      status.length > 0 ? h('span', { className: 'dshbce-status', 'data-level': level }, status) : null,
      showRestore ? h('button', {
        type: 'button',
        className: 'dshbce-restore',
        title: table['wand.restore'],
        onMouseDown: (event) => { event.preventDefault() },
        onClick: () => { void onRestore() },
      }, table['wand.restore']) : null,
      copyText.length > 0 && !busy ? h('button', {
        type: 'button',
        className: 'dshbce-restore',
        title: table['wand.copy'],
        onMouseDown: (event) => { event.preventDefault() },
        onClick: () => { void onCopy() },
      }, table['wand.copy']) : null,
      h('span', { className: 'dshbce-live', 'aria-live': 'polite' }, status),
    )
  }

  enso.slots.register({ slot: 'composer.left', component: EnhanceButton })
  return () => { style.remove() }
}
