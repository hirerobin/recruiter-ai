/**
 * Background watcher that detects idle candidates mid-flow and prompts them.
 *
 * Flow:
 *   1. Every 60s, scan bot_sessions for active FSM states (DATA_COLLECTION, FILE_UPLOAD, CONSENT)
 *   2. If lastActivityAt > IDLE_THRESHOLD_MS ago AND no idle prompt sent yet → send prompt
 *   3. Candidate taps "Lanjut" → re-prompt current question
 *   4. Candidate taps "Cari loker baru" → reset to CANDIDATE_ASKING
 *   5. If idle for ABANDON_THRESHOLD_MS after prompt → auto-reset session to CANDIDATE_ASKING
 */
import { InlineKeyboard } from 'grammy'
import { pool } from '../db/client'
import { FsmState } from '../types/candidate'
import { logger } from '../logger'
import type { Bot } from 'grammy'
import type { BotContext, SessionData } from './middleware/session'
import { loadDataNeeds, buildPrompt } from '../mastra/tools/data-needs'

const IDLE_THRESHOLD_MS = 5 * 60 * 1000       // 5 min → send prompt
const ABANDON_THRESHOLD_MS = 10 * 60 * 1000    // 10 min after prompt → auto-reset
const CHECK_INTERVAL_MS = 60 * 1000             // check every 60s

const WATCHED_STATES = new Set<string>([
  FsmState.DATA_COLLECTION,
  FsmState.FILE_UPLOAD,
  FsmState.CONSENT,
])

interface SessionRow {
  key: string
  data: SessionData
  updated_at: Date
}

async function scanIdleSessions(): Promise<SessionRow[]> {
  const res = await pool.query<SessionRow>(
    `SELECT key, data, updated_at FROM bot_sessions
     WHERE updated_at > NOW() - INTERVAL '24 hours'`,
  )
  return res.rows
}

async function saveSession(key: string, data: SessionData): Promise<void> {
  await pool.query(
    `UPDATE bot_sessions SET data = $2::jsonb, updated_at = NOW() WHERE key = $1`,
    [key, JSON.stringify(data)],
  )
}

export function startIdleWatcher(bot: Bot<BotContext>): void {
  const idleKeyboard = new InlineKeyboard()
    .text('▶️ Lanjutkan', 'idle:continue')
    .row()
    .text('🔄 Cari Loker Baru', 'idle:restart')

  const tick = async () => {
    try {
      const sessions = await scanIdleSessions()
      const now = Date.now()

      for (const row of sessions) {
        const { key: chatId, data } = row
        if (!data?.fsmState || !WATCHED_STATES.has(data.fsmState)) continue

        const lastActivity = data.lastActivityAt ? new Date(data.lastActivityAt).getTime() : 0
        const idleMs = now - lastActivity

        // ABANDON: already prompted, still idle → reset
        if (data.idlePromptSentAt) {
          const promptAgeMs = now - new Date(data.idlePromptSentAt).getTime()
          if (promptAgeMs > ABANDON_THRESHOLD_MS) {
            try {
              await bot.api.sendMessage(
                chatId,
                '⏰ Sesi lamaran dibatalkan karena tidak ada respons. Ketik <b>ada lowongan</b> kapan saja untuk mulai lagi.',
                { parse_mode: 'HTML' },
              )
            } catch (err) {
              logger.error({ event: 'idle_abandon_notify_error', chatId, err })
            }
            // Reset to browsing state
            data.fsmState = FsmState.CANDIDATE_ASKING
            data.currentQuestionIndex = 0
            data.answers = {}
            data.files = {}
            data.appliedJob = null
            data.consentRecordedAt = null
            data.idlePromptSentAt = null
            await saveSession(chatId, data)
            logger.info({ event: 'idle_session_reset', chatId })
          }
          continue
        }

        // IDLE: send prompt
        if (idleMs > IDLE_THRESHOLD_MS) {
          try {
            await bot.api.sendMessage(
              chatId,
              '👋 Masih di sana? Proses pendaftaran Anda tertunda.\n\nIngin melanjutkan atau cari lowongan lain?',
              { reply_markup: idleKeyboard },
            )
            data.idlePromptSentAt = new Date().toISOString()
            await saveSession(chatId, data)
            logger.info({ event: 'idle_prompt_sent', chatId, idleMinutes: Math.round(idleMs / 60000) })
          } catch (err) {
            logger.error({ event: 'idle_prompt_error', chatId, err })
          }
        }
      }
    } catch (err) {
      logger.error({ event: 'idle_watcher_error', err })
    }
  }

  // Initial tick + interval
  setInterval(() => void tick(), CHECK_INTERVAL_MS)
  logger.info({ event: 'idle_watcher_started', intervalSec: CHECK_INTERVAL_MS / 1000 })
}

// ─── Callback handlers ───────────────────────────────────────────────────────

export async function handleIdleContinue(ctx: BotContext): Promise<void> {
  await ctx.answerCallbackQuery()
  ctx.session.idlePromptSentAt = null
  ctx.session.lastActivityAt = new Date().toISOString()

  const state = ctx.session.fsmState
  if (state === FsmState.DATA_COLLECTION || state === FsmState.FILE_UPLOAD) {
    const questions = await loadDataNeeds()
    const idx = ctx.session.currentQuestionIndex ?? 0
    const q = questions[idx]
    if (q) {
      await ctx.reply('✅ Baik, mari lanjutkan.\n\n' + buildPrompt(q, idx, questions.length), { parse_mode: 'HTML' })
      return
    }
  }

  await ctx.reply('✅ Baik, silakan lanjutkan dari pertanyaan terakhir.')
}

export async function handleIdleRestart(ctx: BotContext): Promise<void> {
  await ctx.answerCallbackQuery()
  ctx.session.fsmState = FsmState.CANDIDATE_ASKING
  ctx.session.currentQuestionIndex = 0
  ctx.session.answers = {}
  ctx.session.files = {}
  ctx.session.appliedJob = null
  ctx.session.consentRecordedAt = null
  ctx.session.idlePromptSentAt = null
  ctx.session.lastActivityAt = new Date().toISOString()

  await ctx.reply('🔄 Oke, mari cari lowongan baru. Ketik <b>ada lowongan</b> atau sebutkan posisi yang Anda cari.', { parse_mode: 'HTML' })
}
