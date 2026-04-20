import type { NextFunction } from 'grammy'
import type { BotContext } from './session'

export async function requireSession(ctx: BotContext, next: NextFunction): Promise<void> {
  if (!ctx.chat) return next()

  // Track activity on every interaction — reset idle detection
  ctx.session.lastActivityAt = new Date().toISOString()
  ctx.session.idlePromptSentAt = null

  // Always allow commands and callbacks through
  if (ctx.message?.text?.startsWith('/')) return next()
  if (ctx.callbackQuery) return next()

  // If no language set (new user), redirect to /start
  if (!ctx.session.language) {
    await ctx.reply('Silakan ketik /start untuk memulai.')
    return
  }

  return next()
}
