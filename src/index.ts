/**
 * dsh-bce host half: discover the configured bce-tool MCP tools and proxy
 * search_context + enhance_prompt for the composer magic wand.
 */

import type { Context } from '@deepseek-ai/cordis'
import { registerEnhanceRpc } from './rpc.ts'

/** Must match package.json name and cordis.patch.yml id. */
export const name = 'dsh-bce'

/** Wait until the tool registry exists; connection is optional (headless). */
export const inject = ['tools']

export function apply(ctx: Context): void {
  registerEnhanceRpc(ctx)
}
