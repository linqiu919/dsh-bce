import type { Context } from '@deepseek-ai/cordis'
import { enhancePrompt } from './mcp-enhance.ts'
import { RPC_ENDPOINT, type EnhanceOk, type RpcResult } from './protocol.ts'

interface FetchRoute {
  readonly path: string
  readonly methods: readonly ('GET' | 'HEAD' | 'POST')[]
  readonly requestBody: 'buffered'
  readonly fetch: (request: Request) => Promise<Response>
}

interface ClientRequestEnvelope {
  type: 'client-request'
  rpcId: string
  method: string
  payload: unknown
}

function readEnvelope(body: unknown): ClientRequestEnvelope | undefined {
  if (typeof body !== 'object' || body === null) return undefined
  const record = body as Record<string, unknown>
  if (record.type !== 'client-request' || typeof record.rpcId !== 'string' || typeof record.method !== 'string') {
    return undefined
  }
  return { type: 'client-request', rpcId: record.rpcId, method: record.method, payload: record.payload }
}

function serverResponse(rpcId: string, result: RpcResult<EnhanceOk>): Response {
  return Response.json({ type: 'server-response', rpcId, result })
}

function fetchRouteFor(
  handler: (payload: unknown, signal: AbortSignal) => Promise<RpcResult<EnhanceOk>>,
): FetchRoute {
  return {
    path: `/api/${RPC_ENDPOINT}`,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
        return new Response('content type must be application/json', { status: 415 })
      }
      let body: unknown
      try {
        body = await request.json()
      } catch {
        return new Response('body is not JSON', { status: 400 })
      }
      const envelope = readEnvelope(body)
      if (envelope === undefined) {
        const rawId = (body as Record<string, unknown> | null)?.rpcId
        return serverResponse(typeof rawId === 'string' ? rawId : 'invalid-request', {
          ok: false,
          error: { code: 'upstream', message: 'invalid client-request message', details: {} },
        })
      }
      if (envelope.method !== RPC_ENDPOINT) {
        return serverResponse(envelope.rpcId, {
          ok: false,
          error: {
            code: 'upstream',
            message: `method ${JSON.stringify(envelope.method)} does not match ${JSON.stringify(RPC_ENDPOINT)}`,
            details: {},
          },
        })
      }
      return serverResponse(envelope.rpcId, await handler(envelope.payload, request.signal))
    },
  }
}

/**
 * Register Host RPC for the wand button.
 * Prefers exact Fetch routes (DSH 0.1.5+); falls back to `/api` intercept (0.1.1).
 * Headless profiles without `connection` skip registration.
 */
export function registerEnhanceRpc(ctx: Context): void {
  ctx.inject(['connection'], (wired) => {
    const connection = wired.get('connection') as {
      fetch?: { register: (route: FetchRoute) => () => Promise<void> }
      rpc?: {
        intercept?: (
          channel: '/api',
          matches: (endpoint: string) => boolean,
          handler: (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<RpcResult<EnhanceOk>>,
          options: { authority: 'loopback' },
        ) => () => Promise<void>
      }
    }

    const handler = (payload: unknown, signal: AbortSignal) => enhancePrompt(ctx, payload, signal)

    const register = connection.fetch?.register
    if (typeof register === 'function') {
      wired.effect(
        () => register(fetchRouteFor(handler)),
        'dsh-bce: /api/dsh-bce.enhance fetch route',
      )
      return
    }

    const intercept = connection.rpc?.intercept
    if (typeof intercept === 'function') {
      wired.effect(
        () => intercept(
          '/api',
          (endpoint) => endpoint === RPC_ENDPOINT,
          async (_endpoint, payload, signal) => handler(payload, signal),
          { authority: 'loopback' },
        ),
        'dsh-bce: /api intercept dsh-bce.enhance',
      )
    }
  })
}
