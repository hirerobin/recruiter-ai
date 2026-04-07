/**
 * Calendly webhook handler.
 * When a candidate books an interview via Calendly, this endpoint:
 *   1. Looks up chat_id from the pending-interview map (set when Calendly link was sent)
 *   2. Writes the interview date/time to Google Sheets (interview_notes column)
 *   3. Sends a confirmation message to the candidate on Telegram
 *
 * Calendly free plan does NOT forward UTM params in webhooks, so we match
 * candidates by name using a pending map populated when the link is shown.
 */
import { writeToSheets } from '../../mastra/tools/sheets-tool'
import { logger } from '../../logger'
import { bot } from '../index'

// ─── Pending interview map ───────────────────────────────────────────────────
// Populated by fsm.ts when the Calendly link is shown to a candidate.
// Key = lowercase candidate name, Value = { chatId, appliedJob }

interface PendingInterview {
  chatId: string
  appliedJob: string
}

const pendingInterviews = new Map<string, PendingInterview>()

export function setPendingInterview(name: string, chatId: string, appliedJob: string): void {
  pendingInterviews.set(name.toLowerCase().trim(), { chatId, appliedJob })
}

function consumePendingInterview(name: string): PendingInterview | null {
  const key = name.toLowerCase().trim()
  const entry = pendingInterviews.get(key) ?? null
  if (entry) pendingInterviews.delete(key)
  return entry
}

// ─── Webhook handler ─────────────────────────────────────────────────────────

export async function handleCalendlyWebhook(req: Request): Promise<Response> {
  let body: any
  try {
    body = await req.json()
  } catch {
    return new Response('Bad Request', { status: 400 })
  }

  // Only handle invitee.created events
  if (body.event !== 'invitee.created') {
    return new Response('OK', { status: 200 })
  }

  const payload = body.payload ?? {}
  const startTime: string | null = payload.scheduled_event?.start_time ?? null
  const inviteeName: string | null = payload.name ?? null

  logger.info({ event: 'calendly_webhook_received', inviteeName, startTime })

  if (!startTime) {
    logger.warn({ event: 'calendly_webhook_no_time' })
    return new Response('OK', { status: 200 })
  }

  // Try UTM first (works on paid Calendly plans)
  const tracking = payload.tracking ?? {}
  let chatId: string | null = tracking.utm_content ?? null
  let appliedJob: string | null = tracking.utm_campaign ?? null

  // Fallback: match by name from pending map
  if (!chatId && inviteeName) {
    const pending = consumePendingInterview(inviteeName)
    if (pending) {
      chatId = pending.chatId
      appliedJob = pending.appliedJob
      logger.info({ event: 'calendly_matched_by_name', inviteeName, chatId })
    }
  }

  if (!chatId) {
    logger.warn({ event: 'calendly_webhook_no_match', inviteeName })
    return new Response('OK', { status: 200 })
  }

  // Format the interview date for display
  const dt = new Date(startTime)
  const interviewDate = dt.toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  }) + ' WIB'

  // Write interview date to Google Sheets (interview_notes column)
  try {
    await writeToSheets({ chat_id: chatId, status: 'qualified' }, `Interview: ${interviewDate}`)
    logger.info({ event: 'calendly_sheets_updated', chatId, interviewDate })
  } catch (err) {
    logger.error({ event: 'calendly_sheets_error', chatId, err })
  }

  // Send confirmation to candidate via Telegram
  try {
    await bot.api.sendMessage(
      chatId,
      `✅ *Interview terjadwal!*\n\n📅 ${interviewDate}\n💼 ${appliedJob ?? ''}\n\nSampai jumpa! 🎉`,
      { parse_mode: 'Markdown' }
    )
    logger.info({ event: 'calendly_candidate_notified', chatId })
  } catch (err) {
    logger.error({ event: 'calendly_notify_candidate_error', chatId, err })
  }

  return new Response('OK', { status: 200 })
}
