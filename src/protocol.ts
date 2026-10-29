/** Shared wire contract between the Host RPC and the browser wand. */

export const RPC_CHANNEL = '/api'
export const RPC_ENDPOINT = 'dsh-bce.enhance'

/** Abort budget for the enhance_prompt MCP call only (indexing uses the MCP client's own timeout). */
export const ENHANCE_TIMEOUT_MS = 90_000

export interface EnhanceRequest {
  prompt: string
  workspacePath?: string
  /** Latest DSH conversation snapshot no longer carries cwd; Host may resolve via this. */
  sessionId?: string
}

export type EnhanceErrorCode =
  | 'mcp_missing'
  | 'no_workspace'
  | 'empty_prompt'
  | 'index_failed'
  | 'not_git'
  | 'too_large'
  | 'timeout'
  | 'upstream'

export interface EnhanceOk {
  text: string
  warning?: 'no_index'
}

export interface RpcOk<T> {
  ok: true
  value: T
}

export interface RpcErr {
  ok: false
  error: {
    code: EnhanceErrorCode | string
    message: string
    details?: Record<string, unknown>
  }
}

export type RpcResult<T> = RpcOk<T> | RpcErr
