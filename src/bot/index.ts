import { Bot, webhookCallback } from 'grammy'
import { env } from '../config/env'
import { logger } from '../logger'
import { createSessionMiddleware, type BotContext } from './middleware/session'
import { requireSession } from './middleware/guard'
import { startCommand } from './commands/start'
import { handleLangId, handleLangEn } from './middleware/language'
import { handleCandidateMessage } from './handlers/ask'
import { handleAdminUpload } from './handlers/admin-upload'
import {
  handleConsentAgree, handleConsentDecline,
  handleDataCollection, handleDataReviewReply,
  handleFileUpload,
  handleRejectionBrowse, handleRejectionExit,
} from './handlers/fsm'
import { handleInterviewBooking } from './handlers/interview'
import { PostgresSessionStorage } from '../db/session-storage'
import { FsmState } from '../types/candidate'

export const bot = new Bot<BotContext>(env.TELEGRAM_BOT_TOKEN)

bot.use(createSessionMiddleware(new PostgresSessionStorage()))
bot.use(requireSession)

// ─── Commands ─────────────────────────────────────────────────────────────────
bot.command('start', startCommand)

// ─── Language selection ───────────────────────────────────────────────────────
bot.callbackQuery('lang:id', handleLangId)
bot.callbackQuery('lang:en', handleLangEn)

// ─── Consent callbacks ────────────────────────────────────────────────────────
bot.callbackQuery('consent:agree', handleConsentAgree)
bot.callbackQuery('consent:decline', handleConsentDecline)

// ─── Rejection callbacks ──────────────────────────────────────────────────────
bot.callbackQuery('rejection:browse', handleRejectionBrowse)
bot.callbackQuery('rejection:exit', handleRejectionExit)

// ─── Interview scheduling ────────────────────────────────────────────────────
bot.callbackQuery(/^interview:/, handleInterviewBooking)

// ─── Admin: document upload ───────────────────────────────────────────────────
bot.on('message:document', async (ctx) => {
  logger.info({ chat_id: String(ctx.chat.id), event: 'document_received', fsmState: ctx.session.fsmState })
  // Admin upload takes priority over file-upload FSM step
  const adminIds = env.ADMIN_TELEGRAM_CHAT_IDS.split(',').map((id) => id.trim())
  if (adminIds.includes(String(ctx.chat.id))) {
    return handleAdminUpload(ctx)
  }
  // Candidate file upload during FILE_UPLOAD state
  if (ctx.session.fsmState === FsmState.FILE_UPLOAD) {
    return handleFileUpload(ctx)
  }
})

// ─── Candidate: photo upload ──────────────────────────────────────────────────
bot.on('message:photo', async (ctx) => {
  logger.info({ chat_id: String(ctx.chat.id), event: 'photo_received', fsmState: ctx.session.fsmState })
  if (ctx.session.fsmState === FsmState.FILE_UPLOAD) {
    return handleFileUpload(ctx)
  }
  // If not in FILE_UPLOAD state, tell user what to do
  const l = ctx.session.language ?? 'id'
  await ctx.reply(
    l === 'id'
      ? '⚠️ Saat ini saya tidak memerlukan foto. Silakan ikuti instruksi di atas.'
      : '⚠️ I don\'t need a photo right now. Please follow the instructions above.'
  )
})

// ─── Text messages: FSM-routed ────────────────────────────────────────────────
bot.on('message:text', async (ctx) => {
  const state = ctx.session.fsmState

  if (state === FsmState.LANGUAGE_SELECT) {
    await ctx.reply(
      'Silakan pilih bahasa menggunakan tombol di atas.\nPlease select your language using the buttons above.'
    )
    return
  }

  if (state === FsmState.DATA_COLLECTION) {
    // If no currentField set, we're in review mode
    if (!ctx.session.currentField) {
      return handleDataReviewReply(ctx)
    }
    return handleDataCollection(ctx)
  }

  // All other states → recruiter agent (RAG Q&A)
  return handleCandidateMessage(ctx)
})

export async function startBot(): Promise<void> {
  // Always start HTTP server for Calendly webhook (port 3000)
  const calendlyHandler = await import('./handlers/calendly-webhook').then((m) => m.handleCalendlyWebhook)

  if (env.TELEGRAM_WEBHOOK_URL) {
    const secret = env.TELEGRAM_WEBHOOK_SECRET ?? ''
    const tgHandler = webhookCallback(bot, 'bun', { secretToken: secret || undefined })
    Bun.serve({
      port: 3000,
      fetch: (req) => {
        const url = new URL(req.url)
        if (url.pathname === '/webhooks/calendly' && req.method === 'POST') {
          return calendlyHandler(req)
        }
        return tgHandler(req)
      },
    })
    await bot.api.setWebhook(env.TELEGRAM_WEBHOOK_URL, {
      secret_token: secret || undefined,
    })
    logger.info({ msg: 'bot started', mode: 'webhook', url: env.TELEGRAM_WEBHOOK_URL })
  } else {
    // Polling mode for Telegram + HTTP server for Calendly
    Bun.serve({
      port: 3000,
      fetch: (req) => {
        const url = new URL(req.url)
        if (url.pathname === '/webhooks/calendly' && req.method === 'POST') {
          return calendlyHandler(req)
        }
        return new Response('OK', { status: 200 })
      },
    })
    bot.start()
    logger.info({ msg: 'bot started', mode: 'polling', webhookServer: 'http://localhost:3000' })
  }
}
