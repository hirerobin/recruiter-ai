import { FsmState } from '../../types/candidate'
import type { BotContext } from './session'

export async function handleLangId(ctx: BotContext): Promise<void> {
  ctx.session.language = 'id'
  ctx.session.fsmState = FsmState.CANDIDATE_ASKING
  await ctx.answerCallbackQuery()
  await ctx.reply(
    '✅ Bahasa Indonesia dipilih.\n\nSelamat datang! Saya siap membantu Anda mencari informasi lowongan kerja.\n\nSilakan tanyakan lowongan yang tersedia, atau ketik *daftar* jika sudah siap melamar. 😊',
    { parse_mode: 'Markdown' }
  )
}

export async function handleLangEn(ctx: BotContext): Promise<void> {
  ctx.session.language = 'en'
  ctx.session.fsmState = FsmState.CANDIDATE_ASKING
  await ctx.answerCallbackQuery()
  await ctx.reply(
    '✅ English selected.\n\nWelcome! I am ready to help you find job opportunities.\n\nFeel free to ask about available positions, or type *apply* when you are ready to submit an application. 😊',
    { parse_mode: 'Markdown' }
  )
}
