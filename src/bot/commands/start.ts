import { InlineKeyboard } from 'grammy'
import { FsmState } from '../../types/candidate'
import type { BotContext } from '../middleware/session'

const GREETING =
  `👋 Halo! / Hello!\n\n` +
  `Saya adalah asisten rekrutmen AI yang akan membantu Anda melalui proses lamaran kerja.\n` +
  `I am an AI recruitment assistant that will guide you through the job application process.\n\n` +
  `Silakan pilih bahasa Anda / Please select your language:`

const languageKeyboard = new InlineKeyboard()
  .text('🇮🇩 Bahasa Indonesia', 'lang:id')
  .text('🇬🇧 English', 'lang:en')

export async function startCommand(ctx: BotContext): Promise<void> {
  // Reset session to a clean slate whenever /start is called
  ctx.session.language = null
  ctx.session.fsmState = FsmState.LANGUAGE_SELECT
  ctx.session.appliedJob = null
  ctx.session.consentRecordedAt = null
  ctx.session.currentField = null
  ctx.session.candidateData = {}
  ctx.session.files = {}
  await ctx.reply(GREETING, { reply_markup: languageKeyboard })
}
