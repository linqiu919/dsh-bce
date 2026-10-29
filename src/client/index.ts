import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type { Context } from '@deepseek-ai/cordis'
import { LOCALE_NAMESPACE } from './constants.ts'
import { en, zh, type BceLocaleKey } from './locales.ts'
import { injectStyles } from './styles.ts'
import { registerWandButton } from './wand-button.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.dshBce': BceLocaleKey
  }
}

export const inject = ['slots', 'locale', 'connection']

export function apply(ctx: Context): void {
  ctx.effect(
    () => ctx.locale.register(LOCALE_NAMESPACE, { zh, en }),
    'dsh-bce: dictionaries',
  )
  ctx.effect(() => injectStyles())
  registerWandButton(ctx)
}
