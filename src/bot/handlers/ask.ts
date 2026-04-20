import { mastra } from '../../mastra/index'
import { logger } from '../../logger'
import { consumePendingApply } from '../apply-trigger'
import { triggerConfirmation } from './fsm'
import { loadBotResponses, matchResponse } from '../../mastra/tools/bot-responses'
import type { BotContext, JobListing } from '../middleware/session'

const APOLOGY = '⚠️ Maaf, saya sedang mengalami gangguan teknis. Tim kami telah diberitahu dan akan segera membantu Anda.'

async function sendReply(ctx: BotContext, reply: string): Promise<void> {
  try {
    await ctx.reply(reply, { parse_mode: 'HTML' })
  } catch {
    await ctx.reply(reply.replace(/<[^>]*>/g, ''))
  }
}

/**
 * Parse numbered job listings from agent reply.
 * Matches patterns like:
 *   1️⃣ <b>Title</b> — Location
 *   2. <b>Title</b> — Location
 */
function parseJobsFromReply(reply: string): JobListing[] {
  const jobs: JobListing[] = []
  // Match numbered jobs (emoji numbers or "N.")
  const regex = /(?:[1-9]️⃣|[1-9]\.)\s*<b>([^<]+)<\/b>\s*[—–-]\s*([^\n]+)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(reply)) !== null) {
    jobs.push({
      title: match[1]!.trim(),
      location: match[2]!.trim(),
    })
  }
  return jobs
}

/**
 * Detect "daftar N" or "lamar N" pattern.
 * Returns the number (1-indexed) or null.
 */
function parseApplyByNumber(text: string): number | null {
  const match = /^(?:daftar|lamar|apply)\s+(\d+)\b/i.exec(text.trim())
  if (!match) return null
  const n = parseInt(match[1]!, 10)
  return n > 0 && n <= 20 ? n : null
}

/** Detect bare "daftar" / "lamar" / "apply" / "ya" / "iya" with no number */
function isApplyIntent(text: string): boolean {
  return /^(?:daftar|lamar|apply|mendaftar|melamar|ya|iya|oke|ok|mau|lanjut|setuju)\s*$/i.test(text.trim())
}

/** Detect standalone number like "1", "2" … used to select a job from the list */
function parseSelectNumber(text: string): number | null {
  const match = /^(\d+)$/.exec(text.trim())
  if (!match) return null
  const n = parseInt(match[1]!, 10)
  return n > 0 && n <= 20 ? n : null
}

export async function handleCandidateMessage(ctx: BotContext): Promise<void> {
  const text = ctx.message?.text
  if (!text) return

  const chatId = String(ctx.chat!.id)
  logger.info({ chat_id: chatId, event: 'candidate_message' })

  const jobs = ctx.session.lastShownJobs ?? []
  const pending = ctx.session.pendingApplyJob

  // Helper: directly apply a job
  const applyJob = async (job: { title: string; location: string }) => {
    ctx.session.appliedJob = job.title
    ctx.session.pendingApplyJob = null
    await sendReply(ctx, `Baik, proses pendaftaran untuk <b>${job.title}</b> — ${job.location} dimulai ya. 🎉`)
    await triggerConfirmation(ctx, job.title)
  }

  // 1a. "daftar N" / "lamar N" — apply directly by list number
  const applyNumber = parseApplyByNumber(text)
  if (applyNumber !== null) {
    if (jobs.length === 0) {
      await sendReply(ctx, 'Belum ada daftar lowongan yang ditampilkan. Ketik <b>ada lowongan</b> untuk lihat daftar lowongan tersedia. 😊')
      return
    }
    const idx = applyNumber - 1
    if (idx >= jobs.length) {
      await sendReply(ctx, `Maaf, nomor ${applyNumber} tidak ada di daftar. Hanya ada ${jobs.length} lowongan — silakan pilih antara 1-${jobs.length}.`)
      return
    }
    logger.info({ chat_id: chatId, event: 'apply_by_number', number: applyNumber, job: jobs[idx]!.title })
    await applyJob(jobs[idx]!)
    return
  }

  // 1b. Confirm intent ("daftar", "ya", "oke", etc.)
  if (isApplyIntent(text)) {
    // If candidate is on a detail view — apply immediately
    if (pending) {
      logger.info({ chat_id: chatId, event: 'apply_from_pending', job: pending.title })
      await applyJob(pending)
      return
    }
    if (jobs.length === 1) {
      logger.info({ chat_id: chatId, event: 'apply_direct', job: jobs[0]!.title })
      await applyJob(jobs[0]!)
      return
    }
    if (jobs.length === 0) {
      await sendReply(ctx, 'Anda ingin melamar posisi apa? Ketik <b>ada lowongan</b> untuk lihat daftar lowongan tersedia. 😊')
      return
    }
    // Multiple jobs — ask which one bot-side (no agent round-trip)
    const list = jobs.map((j, i) => `  ${i + 1}. <b>${j.title}</b> — ${j.location}`).join('\n')
    await sendReply(ctx, `Posisi mana yang ingin Anda lamar?\n\n${list}\n\nBalas dengan <b>nomor</b> atau ketik <b>daftar [nomor]</b>. 😊`)
    return
  }

  // 1c. Standalone number — select or confirm a job
  const selectNumber = parseSelectNumber(text)
  if (selectNumber !== null && jobs.length > 0) {
    const idx = selectNumber - 1
    if (idx < jobs.length) {
      if (pending) {
        // Already in detail view — any number is a confirm/apply
        logger.info({ chat_id: chatId, event: 'apply_confirm_number', job: pending.title })
        await applyJob(pending)
        return
      }
      if (jobs.length === 1) {
        // Single job in context — confirm apply
        logger.info({ chat_id: chatId, event: 'apply_confirm_number', job: jobs[0]!.title })
        await applyJob(jobs[0]!)
        return
      }
      // Multiple jobs — set pendingApplyJob so next message applies directly
      ctx.session.pendingApplyJob = jobs[idx]!
      logger.info({ chat_id: chatId, event: 'job_selected', number: selectNumber, job: jobs[idx]!.title })
    }
    // Fall through to agent to show job detail
  }

  // 2. Check bot response templates from Sheets (greeting, thanks, farewell, etc.)
  const responses = await loadBotResponses()
  const matched = matchResponse(text, responses)

  if (matched) {
    logger.info({ chat_id: chatId, event: 'bot_response_matched', category: matched.category })

    // [SHOW_JOBS] / [SEARCH_JOBS] → forward to RAG agent
    if (matched.response !== '[SHOW_JOBS]' && matched.response !== '[SEARCH_JOBS]') {
      // Direct response — no agent needed (fast, cheap)
      await sendReply(ctx, matched.response)
      return
    }
  }

  // 3. Forward to RAG agent for job queries
  const replyToText = ctx.message?.reply_to_message?.text
  let messageWithContext = `[CHAT_ID:${chatId}]\n`
  if (replyToText) {
    messageWithContext += `[REPLYING TO: ${replyToText}]\n`
  }
  // Include last-shown jobs as hint to agent
  if (ctx.session.lastShownJobs?.length) {
    const list = ctx.session.lastShownJobs.map((j, i) => `  ${i + 1}. ${j.title} — ${j.location}`).join('\n')
    messageWithContext += `[LAST SHOWN JOBS:\n${list}\n]\n`
  }
  messageWithContext += text

  let reply: string
  try {
    const agent = mastra.getAgent('recruiterAgent')
    const result = await agent.generate(messageWithContext, {
      memory: { thread: chatId, resource: chatId },
    })
    reply = result.text ?? ''
  } catch (err) {
    logger.error({ chat_id: chatId, event: 'agent_error', err })
    reply = APOLOGY
  }

  if (!reply.trim()) reply = APOLOGY

  // Parse jobs from reply — store in session for next "daftar N"
  const parsedJobs = parseJobsFromReply(reply)
  if (parsedJobs.length > 0) {
    ctx.session.lastShownJobs = parsedJobs
    ctx.session.pendingApplyJob = null  // new list shown — clear any prior selection
    logger.info({ chat_id: chatId, event: 'jobs_tracked', count: parsedJobs.length })
  }

  // Check if agent triggered application flow
  const pendingJob = consumePendingApply(chatId)
  if (pendingJob !== null) {
    ctx.session.appliedJob = pendingJob
    if (reply.trim()) await sendReply(ctx, reply)
    await triggerConfirmation(ctx, pendingJob)
    return
  }

  await sendReply(ctx, reply)
}
