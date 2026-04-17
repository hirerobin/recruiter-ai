import { FsmState } from '../../types/candidate'
import type { BotContext } from '../middleware/session'

const GREETING =
  `👋 Halo!\n\n` +
  `Saya adalah asisten rekrutmen AI yang akan membantu Anda melalui proses lamaran kerja.\n\n` +
  `Silakan tanyakan lowongan yang tersedia, atau ketik *daftar* jika sudah siap melamar.`

export async function startCommand(ctx: BotContext): Promise<void> {
  // Reset session to a clean slate whenever /start is called
  ctx.session.language = 'id'
  ctx.session.fsmState = FsmState.CANDIDATE_ASKING
  ctx.session.appliedJob = null
  ctx.session.consentRecordedAt = null
  ctx.session.currentField = null
  ctx.session.candidateData = {}
  ctx.session.files = {}
  ctx.session.isAdmin = false
  await ctx.reply(GREETING, { parse_mode: 'Markdown' })
}
