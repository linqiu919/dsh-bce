import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import React from 'react'
import {
  STYLE,
  canRestore,
  enhanceDraft,
  messageFor,
  nextRestore,
  onLoad,
  pickLocale,
} from '../enso/ui.js'

const locales = readFileSync(new URL('../src/client/locales.ts', import.meta.url), 'utf8')
const ui = readFileSync(new URL('../enso/ui.js', import.meta.url), 'utf8')
const wand = readFileSync(new URL('../src/client/wand-button.tsx', import.meta.url), 'utf8')

function composer(snap, replace = async () => ({ rev: 'r2' })) {
  return {
    readDraft: async () => snap,
    replaceDraft: replace,
  }
}

describe('carried copy and visuals', () => {
  it('keeps every DSH wand string except the Enso timeout copy', () => {
    const adapted = new Set(['wand.timeout', 'wand.indexTimeout'])
    for (const match of locales.matchAll(/'(wand\.[^']+)': '([^']*)'/g)) {
      if (adapted.has(match[1])) continue
      assert.equal(ui.includes(match[2]), true, match[1])
    }
    assert.match(ui, /Timed out \(90s\)/)
    assert.match(ui, /已超时（90 秒）/)
    assert.match(ui, /索引用尽了与增强共用的 90 秒/)
  })

  it('keeps the wand paths, the ring, and the theme fallbacks', () => {
    const path = wand.match(/d="(m21\.64[^"]+)"/)?.[1]
    assert.ok(path)
    assert.equal(ui.includes(path), true)
    assert.match(STYLE, /width: 26px/)
    assert.match(STYLE, /border-radius: 50%/)
    assert.match(STYLE, /scale\(0\.96\)/)
    assert.match(STYLE, /@property --dshbce-from/)
    assert.match(STYLE, /conic-gradient/)
    assert.match(STYLE, /1\.6s linear infinite/)
    assert.match(STYLE, /color: #4f46e5/)
    assert.match(STYLE, /color: #6366f1/)
    assert.match(STYLE, /var\(--destructive, #e5484d\)/)
    assert.match(STYLE, /var\(--success, #30a46c\)/)
    assert.match(STYLE, /var\(--secondary, var\(--muted, rgba\(15, 23, 42, 0\.05\)\)\)/)
    assert.match(STYLE, /var\(--muted-foreground, #8b8b8b\)/)
    assert.match(STYLE, /prefers-reduced-motion: reduce/)
    assert.match(ui, /aria-live': 'polite'/)
  })
})

describe('pickLocale', () => {
  const browser = { documentLang: '', languages: ['en-US'] }

  it('prefers an Enso locale over the browser', () => {
    assert.equal(pickLocale({ locale: 'zh' }, browser), 'zh')
    assert.equal(pickLocale({ locale: () => ({ language: 'zh-CN' }) }, browser), 'zh')
    assert.equal(pickLocale({ language: 'en' }, { documentLang: 'zh', languages: ['zh'] }), 'en')
  })

  it('uses the page language, then the browser language', () => {
    assert.equal(pickLocale({}, { documentLang: 'zh-Hans', languages: ['en'] }), 'zh')
    assert.equal(pickLocale({}, { documentLang: ' ', languages: ['zh-TW', 'en'] }), 'zh')
    assert.equal(pickLocale({}, { documentLang: '', languages: ['fr-FR'] }), 'en')
  })
})

describe('messageFor', () => {
  it('maps the DSH codes and the Enso draft errors in both languages', () => {
    assert.equal(messageFor('not_git', 'en'), 'This folder is not a Git repository. bce-tool only indexes Git projects.')
    assert.equal(messageFor('not_git', 'zh'), '当前目录不是 Git 仓库。bce-tool 默认只索引 Git 项目。')
    assert.match(messageFor('DRAFT_HAS_REFERENCES', 'zh'), /引用/)
    assert.match(messageFor('DRAFT_HAS_REFERENCES', 'en'), /references/)
    assert.match(messageFor('TOO_LARGE', 'en'), /32KB/)
    assert.match(messageFor('TOO_LARGE', 'zh'), /32KB/)
    assert.equal(messageFor('DRAFT_CHANGED', 'zh'), messageFor('draft_changed', 'zh'))
    assert.match(messageFor('DRAFT_BUSY', 'en'), /locked/)
    assert.equal(messageFor('TIMEOUT', 'en'), messageFor('timeout', 'en'))
    assert.match(messageFor('TIMEOUT', 'en'), /90s/)
    assert.match(messageFor('upstream', 'zh'), /增强失败/)
  })
})

describe('restore', () => {
  it('keeps the first original across chained enhancements in one session', () => {
    const first = nextRestore(undefined, 's1', 'draft', 'once')
    const second = nextRestore(first, 's1', 'once', 'twice')
    assert.deepEqual(second, { sessionId: 's1', original: 'draft', enhanced: 'twice' })
    const edited = nextRestore(second, 's1', 'once plus', 'thrice')
    assert.equal(edited.original, 'once plus')
    const other = nextRestore(second, 's2', 'twice', 'elsewhere')
    assert.equal(other.original, 'twice')
    assert.equal(canRestore(second, 's1', 'twice', false), true)
    assert.equal(canRestore(second, 's1', 'draft', false), false)
    assert.equal(canRestore(second, 's2', 'twice', false), false)
    assert.equal(canRestore(second, 's1', 'twice', true), false)
  })
})

describe('enhanceDraft', () => {
  it('replaces the draft with the generation and rev captured before the call', async () => {
    const replaceDraft = async () => ({ rev: 'r2' })
    const calls = []
    const enso = {
      composer: composer(
        { text: '  fix it  ', generation: 'c1', rev: 'r1', hasReferences: false },
        async (input) => {
          calls.push(input)
          return replaceDraft(input)
        },
      ),
      dispatch: async (action, payload) => {
        calls.push([action, payload])
        return { ok: true, text: 'better' }
      },
    }
    assert.deepEqual(await enhanceDraft(enso, 'c1', '  fix it  ', 'en'), {
      ok: true,
      sessionId: 'c1',
      original: 'fix it',
      enhanced: 'better',
    })
    assert.deepEqual(calls, [
      ['plugin.call', { method: 'enhance', args: { prompt: 'fix it' } }],
      { text: 'better', expect: { generation: 'c1', rev: 'r1' } },
    ])
  })

  it('does not replace a draft that changed, has references, or is rejected by the host', async () => {
    const replaceDraft = async () => {
      throw Object.assign(new Error('changed'), { code: 'DRAFT_CHANGED' })
    }
    const changed = {
      composer: composer({ text: 'fix it', generation: 'c1', rev: 'r1', hasReferences: false }, replaceDraft),
      dispatch: async () => ({ ok: true, text: 'better' }),
    }
    assert.deepEqual(await enhanceDraft(changed, 'c1', () => 'fix it now', 'zh'), {
      ok: false,
      code: 'draft_changed',
      message: '增强期间草稿已修改，未覆盖。',
    })

    let replaced = false
    const referenced = {
      composer: composer({ text: 'fix @file it', generation: 'c1', rev: 'r1', hasReferences: true }, async () => {
        replaced = true
        throw Object.assign(new Error('refs'), { code: 'DRAFT_HAS_REFERENCES' })
      }),
      dispatch: async () => ({ ok: true, text: 'better @file' }),
    }
    const blocked = await enhanceDraft(referenced, 'c1', 'fix @file it', 'en')
    assert.equal(replaced, true)
    assert.equal(blocked.ok, false)
    assert.equal(blocked.code, 'DRAFT_HAS_REFERENCES')
    assert.match(blocked.message, /references/)
    assert.equal(blocked.copyText, 'better @file')

    const oversized = {
      composer: composer({ text: 'fix it', generation: 'c1', rev: 'r1', hasReferences: false }, async () => {
        throw Object.assign(new Error('text 不合法或超过 32KB'), { code: 'INVALID_ARGS' })
      }),
      dispatch: async () => ({ ok: true, text: 'x'.repeat(40_000) }),
    }
    const huge = await enhanceDraft(oversized, 'c1', 'fix it', 'zh')
    assert.equal(huge.code, 'TOO_LARGE')
    assert.match(huge.message, /32KB/)
    assert.equal(huge.copyText.length, 40_000)

    const rejected = await enhanceDraft(changed, 'c1', 'fix it', 'en')
    assert.equal(rejected.code, 'DRAFT_CHANGED')
    assert.equal(rejected.message, 'The draft changed while enhancing, so it was not replaced.')
    assert.equal(rejected.copyText, undefined)
  })

  it('maps a host method timeout and a missing workspace from the backend', async () => {
    const timedOut = {
      composer: composer({ text: 'fix it', generation: 'c1', rev: 'r1', hasReferences: false }),
      dispatch: async () => {
        throw Object.assign(new Error('插件调用超时（90000ms）'), { code: 'TIMEOUT' })
      },
    }
    assert.match((await enhanceDraft(timedOut, 's', 'fix it', 'zh')).message, /90 秒/)

    const missing = {
      composer: composer({ text: 'fix it', generation: 'c1', rev: 'r1', hasReferences: false }),
      dispatch: async () => ({ ok: false, code: 'no_workspace', message: 'workspace path is missing' }),
    }
    assert.equal((await enhanceDraft(missing, 's', 'fix it', 'zh')).message, '请先打开一个工作区。')
  })
})

describe('onLoad', () => {
  it('registers the wand on composer.left and removes its style tag', async () => {
    const removed = []
    const style = { dataset: {}, textContent: '', remove() { removed.push(true) } }
    const previous = globalThis.document
    globalThis.document = {
      createElement() { return style },
      head: { appendChild() {} },
      documentElement: { lang: 'en' },
    }
    try {
      const registered = []
      const dispose = await onLoad({
        React,
        slots: {
          register(entry) {
            registered.push(entry)
            return () => {}
          },
        },
      })
      assert.equal(registered.length, 1)
      assert.equal(registered[0].slot, 'composer.left')
      assert.equal(typeof registered[0].component, 'function')
      assert.match(style.textContent, /dshbce-btn/)
      assert.equal(style.dataset.plugin, 'dsh.bce')
      dispose()
      assert.deepEqual(removed, [true])
    } finally {
      globalThis.document = previous
    }
  })
})
