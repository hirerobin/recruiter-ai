import type { NextFunction } from 'grammy'
import type { BotContext } from './session'

export async function requireSession(ctx: BotContext, next: NextFunction): Promise<void> {
  if (!ctx.chat) return next()

  // Always allow /start and /admin through
  if (ctx.message?.text?.startsWith('/start')) return next()
  if (ctx.message?.text?.startsWith('/admin')) return next()
  if (ctx.message?.text?.startsWith('/menu')) return next()

  // Always allow callback queries (inline button clicks) through
  // so language selection, consent, rejection buttons work
  if (ctx.callbackQuery) return next()

  if (ctx.session.language === null) {
    await ctx.reply(
      'Silakan ketik /start untuk memulai.\nPlease type /start to begin.'
    )
    return
  }

  return next()
}
