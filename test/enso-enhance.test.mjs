import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mock, describe, it } from 'node:test'
import {
  ENHANCE_TIMEOUT_MS,
  HOST_LEAD_MS,
  classifyFailure,
  copyText,
  enhance,
  pickServer,
  waitBudget,
} from '../enso/main.mjs'

const ENHANCE_TIMEOUT_MESSAGE = `Enhancement timed out (${ENHANCE_TIMEOUT_MS / 1000}s). Indexing and rewriting share this limit. Add --no-webbrowser-enhance-prompt to the bce-tool MCP args if the review page is blocking.`
const INDEX_TIMEOUT_MESSAGE = 'Indexing used up the 90s limit shared with enhancement.'

function deferred() {
  let resolve
  let reject
  let settled = false
  const promise = new Promise((res, rej) => {
    resolve = (value) => {
      settled = true
      res(value)
    }
    reject = (error) => {
      settled = true
      rej(error)
    }
  })
  return {
    promise,
    resolve,
    reject,
    get settled() { return settled },
  }
}

function host({ tools = [], call, config = {}, signal } = {}) {
  return {
    enso: {
      config: { get: async () => config },
      mcp: {
        tools: async () => tools,
        call,
      },
    },
    ctx: { projectRoot: '/repo', ...(signal === undefined ? {} : { signal }) },
  }
}

describe('pickServer', () => {
  const tools = [
    { server: 'other', name: 'enhance_prompt', description: '' },
    { server: 'my-bce', name: 'enhance_prompt', description: '' },
    { server: 'my-bce', name: 'search_context', description: '' },
    { server: 'other', name: 'search_context', description: '' },
    { server: 'notes', name: 'search_context', description: '' },
  ]

  it('returns null when nothing provides enhance_prompt', () => {
    assert.equal(pickServer([], ''), null)
    assert.equal(pickServer([{ server: 'bce', name: 'search_context' }], 'bce'), null)
    assert.equal(pickServer(null, ''), null)
  })

  it('prefers the configured server, then a name containing bce, then the first', () => {
    assert.deepEqual(pickServer(tools, 'other'), { server: 'other', hasSearch: true })
    assert.deepEqual(pickServer(tools, ''), { server: 'my-bce', hasSearch: true })
    assert.deepEqual(pickServer(tools, 'missing'), { server: 'my-bce', hasSearch: true })
    assert.deepEqual(pickServer(tools, '  other  '), { server: 'other', hasSearch: true })
    assert.deepEqual(
      pickServer([{ server: 'alpha', name: 'enhance_prompt' }, { server: 'beta', name: 'enhance_prompt' }], ''),
      { server: 'alpha', hasSearch: false },
    )
  })

  it('matches bce case-insensitively and only counts search on the chosen server', () => {
    assert.deepEqual(
      pickServer([{ server: 'LocalBCE', name: 'enhance_prompt' }, { server: 'notes', name: 'search_context' }], ''),
      { server: 'LocalBCE', hasSearch: false },
    )
  })
})

describe('classifyFailure', () => {
  it('classifies the same failure phrases as the DSH host', () => {
    assert.equal(classifyFailure('path is not managed by git'), 'not_git')
    assert.equal(classifyFailure('Error: not a git repository'), 'not_git')
    assert.equal(classifyFailure('project is too large to index'), 'too_large')
    assert.equal(classifyFailure('payload exceeds the 20 MB limit'), 'too_large')
    assert.equal(classifyFailure('request timed out'), 'timeout')
    assert.equal(classifyFailure('MCP timeout'), 'timeout')
    assert.equal(classifyFailure('tool call aborted'), 'timeout')
  })

  it('does not classify a phrase that only successful text might quote', () => {
    assert.equal(classifyFailure('indexed 12 files'), undefined)
    assert.equal(classifyFailure('exceeds the expected count'), undefined)
    assert.equal(classifyFailure('the user aborted the idea'), undefined)
  })
})

describe('enhance', () => {
  it('indexes then rewrites, and a configured server skips the bce preference', async () => {
    const calls = []
    const call = async (server, tool, args) => {
      calls.push([server, tool, args])
      return tool === 'enhance_prompt'
        ? { content: '  better prompt  ', isError: false }
        : { content: 'indexed', isError: false }
    }
    const tools = [
      { server: 'other', name: 'enhance_prompt' },
      { server: 'my-bce', name: 'enhance_prompt' },
      { server: 'my-bce', name: 'search_context' },
    ]
    const first = host({ tools, call })
    assert.deepEqual(await enhance(first.enso, { prompt: '  fix the bug  ' }, first.ctx), {
      ok: true,
      text: 'better prompt',
    })
    assert.deepEqual(calls, [
      ['my-bce', 'search_context', { project_root_path: '/repo', query: 'fix the bug' }],
      ['my-bce', 'enhance_prompt', { project_root_path: '/repo', prompt: 'fix the bug', conversation_history: '' }],
    ])

    calls.length = 0
    const second = host({ tools, call, config: { server: 'other' } })
    assert.deepEqual(await enhance(second.enso, { prompt: 'x' }, second.ctx), {
      ok: true,
      text: 'better prompt',
      warning: 'no_index',
    })
    assert.deepEqual(calls.map(([server, tool]) => [server, tool]), [['other', 'enhance_prompt']])
  })

  it('keeps a successful body even when it quotes a failure phrase', async () => {
    const { enso, ctx } = host({
      tools: [{ server: 'bce', name: 'enhance_prompt' }],
      call: async () => ({ content: 'this repo is not a git repository on purpose', isError: false }),
    })
    assert.deepEqual(await enhance(enso, { prompt: 'x' }, ctx), {
      ok: true,
      text: 'this repo is not a git repository on purpose',
      warning: 'no_index',
    })
  })

  it('reports an empty prompt, a missing project, and a missing tool', async () => {
    const { enso, ctx } = host({ tools: [], call: async () => ({ content: '', isError: false }) })
    assert.deepEqual(await enhance(enso, { prompt: '   ' }, ctx), { ok: false, code: 'empty_prompt', message: 'prompt is empty' })
    assert.deepEqual(await enhance(enso, { prompt: 'x' }, { projectRoot: null }), {
      ok: false,
      code: 'no_workspace',
      message: 'workspace path is missing',
    })
    assert.equal((await enhance(enso, { prompt: 'x' }, ctx)).code, 'mcp_missing')
  })

  it('classifies a failed index and a failed rewrite', async () => {
    const tools = [
      { server: 'bce', name: 'enhance_prompt' },
      { server: 'bce', name: 'search_context' },
    ]
    const git = host({
      tools,
      call: async () => ({ content: 'Error: path is not a git repository', isError: false }),
    })
    assert.equal((await enhance(git.enso, { prompt: 'x' }, git.ctx)).code, 'not_git')

    const large = host({
      tools,
      call: async (_server, tool) => tool === 'search_context'
        ? { content: 'too large to index', isError: true }
        : { content: 'unused', isError: false },
    })
    assert.equal((await enhance(large.enso, { prompt: 'x' }, large.ctx)).code, 'too_large')

    const upstream = host({
      tools: [{ server: 'bce', name: 'enhance_prompt' }],
      call: async () => ({ content: '', isError: true }),
    })
    assert.deepEqual(await enhance(upstream.enso, { prompt: 'x' }, upstream.ctx), {
      ok: false,
      code: 'upstream',
      message: 'enhance_prompt failed',
    })
  })

  it('stops an index that uses up the shared 90s budget without aborting the MCP call', async () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    try {
      const search = deferred()
      const tools = [
        { server: 'bce', name: 'enhance_prompt' },
        { server: 'bce', name: 'search_context' },
      ]
      const { enso, ctx } = host({
        tools,
        call: async () => search.promise,
      })
      const pending = enhance(enso, { prompt: 'x' }, ctx)
      for (let i = 0; i < 5; i++) await Promise.resolve()
      mock.timers.tick(1_000)
      await Promise.resolve()
      assert.equal(search.settled, false)
      mock.timers.tick(ENHANCE_TIMEOUT_MS)
      assert.deepEqual(await pending, {
        ok: false,
        code: 'index_timeout',
        message: INDEX_TIMEOUT_MESSAGE,
      })
      assert.equal(search.settled, false)
    } finally {
      mock.timers.reset()
    }
  })

  it('stops waiting for enhance_prompt inside the same 90s budget without aborting the MCP call', async () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    try {
      const rewrite = deferred()
      const { enso, ctx } = host({
        tools: [
          { server: 'bce', name: 'enhance_prompt' },
          { server: 'bce', name: 'search_context' },
        ],
        call: async (_server, tool) => {
          if (tool === 'search_context') return { content: 'indexed', isError: false }
          return rewrite.promise
        },
      })
      const pending = enhance(enso, { prompt: 'x' }, ctx)
      for (let i = 0; i < 10; i++) await new Promise((resolve) => process.nextTick(resolve))
      mock.timers.tick(1_000)
      await new Promise((resolve) => process.nextTick(resolve))
      assert.equal(rewrite.settled, false)
      mock.timers.tick(ENHANCE_TIMEOUT_MS)
      for (let i = 0; i < 10; i++) await new Promise((resolve) => process.nextTick(resolve))
      assert.deepEqual(await pending, {
        ok: false,
        code: 'timeout',
        message: ENHANCE_TIMEOUT_MESSAGE,
      })
      assert.equal(rewrite.settled, false)
    } finally {
      mock.timers.reset()
    }
  })

  it('treats a host abort during enhance_prompt as a timeout', async () => {
    const controller = new AbortController()
    const rewrite = deferred()
    const { enso, ctx } = host({
      tools: [{ server: 'bce', name: 'enhance_prompt' }],
      signal: controller.signal,
      call: async () => rewrite.promise,
    })
    const pending = enhance(enso, { prompt: 'x' }, ctx)
    controller.abort()
    assert.equal((await pending).code, 'timeout')
    assert.equal(rewrite.settled, false)
  })

  it('maps a rejected index call with TIMEOUT to index_timeout', async () => {
    const { enso, ctx } = host({
      tools: [
        { server: 'bce', name: 'enhance_prompt' },
        { server: 'bce', name: 'search_context' },
      ],
      call: async () => {
        throw Object.assign(new Error('MCP 调用超时'), { code: 'TIMEOUT' })
      },
    })
    assert.equal((await enhance(enso, { prompt: 'x' }, ctx)).code, 'index_timeout')
  })
})

describe('waitBudget', () => {
  it('is the shared 90s cap minus the host lead', () => {
    assert.equal(ENHANCE_TIMEOUT_MS, 90_000)
    assert.equal(HOST_LEAD_MS, 1_500)
    assert.equal(waitBudget(0), 88_500)
    assert.equal(waitBudget(80_000), 8_500)
    assert.equal(waitBudget(90_000), 0)
  })
})

describe('copyText', () => {
  it('writes the enhanced prompt through the host clipboard', async () => {
    const written = []
    const enso = { ui: { clipboard: { writeText: async (text) => { written.push(text) } } } }
    assert.deepEqual(await copyText(enso, { text: 'better' }), { ok: true })
    assert.deepEqual(written, ['better'])
    assert.equal((await copyText(enso, { text: '  ' })).code, 'empty_prompt')
  })
})

describe('manifest', () => {
  const manifest = JSON.parse(readFileSync(new URL('../enso/enso-plugin.json', import.meta.url), 'utf8'))
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const tsdown = readFileSync(new URL('../tsdown.config.ts', import.meta.url), 'utf8')

  it('is a directly installable Enso 0.2.13 plugin with the minimum permissions', () => {
    assert.equal(manifest.schemaVersion, 1)
    assert.equal(manifest.id, 'dsh.bce')
    assert.equal(manifest.version, '0.1.3')
    assert.equal(manifest.icon, 'icon.png')
    assert.equal(manifest.engines.enso, '>=0.2.13')
    assert.equal(manifest.main, 'main.mjs')
    assert.equal(manifest.renderer, 'ui.js')
    assert.deepEqual(manifest.permissions, ['ui.slot', 'composer.draft', 'mcp.call', 'ui.clipboard'])
    assert.deepEqual(manifest.mcp.tools, ['search_context', 'enhance_prompt'])
    assert.deepEqual(manifest.contributes.methods, [{ name: 'enhance', timeoutMs: 90_000 }])
    assert.equal(manifest.contributes.configuration[0].key, 'server')
    assert.equal(manifest.id.includes('-'), false)
    const icon = readFileSync(new URL('../enso/icon.png', import.meta.url))
    assert.equal(
      createHash('sha256').update(icon).digest('hex'),
      '63c1d40b707b4deb5cd0dfde66b20df628a2ff1384f88890d70ef6595e7d6a44',
    )
  })

  it('leaves the DeepSeek Harness package contents alone', () => {
    assert.deepEqual(pkg.files, [
      'lib/index.js',
      'lib/index.d.ts',
      'lib/client.js',
      'locale/*.json',
      'icon.png',
      'cordis.patch.yml',
    ])
    assert.equal(pkg.files.some((entry) => entry.includes('enso')), false)
    assert.equal(tsdown.includes('enso/'), false)
    assert.equal(tsdown.includes("entry: ['src/index.ts']"), true)
  })
})
