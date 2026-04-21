import { mastra } from '../../mastra/index'
import { logger } from '../../logger'
import { consumePendingApply } from '../apply-trigger'
import { triggerConfirmation } from './fsm'
import { loadBotResponses, matchResponse } from '../../mastra/tools/bot-responses'
import { lookupFullJobDetail } from '../../mastra/tools/job-lookup'
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
 * Parse numbered job cards from agent reply.
 * Each card format (4 lines):
 *   1️⃣ <b>Title</b> — Location
 *   🏢 Company
 *   📋 Requirements
 *   💰 Salary
 */
function parseJobsFromReply(reply: string): JobListing[] {
  const jobs: JobListing[] = []
  // Split into individual cards by numbered emoji/dot headers
  const cardRegex = /([1-9]️⃣|[1-9]\.)\s*<b>([^<]+)<\/b>\s*[—–-]\s*([^\n]+)([\s\S]*?)(?=[1-9]️⃣|[1-9]\.|$)/g
  let match: RegExpExecArray | null
  while ((match = cardRegex.exec(reply)) !== null) {
    const title = match[2]!.trim()
    const location = match[3]!.trim()
    const body = match[4] ?? ''
    const company = /🏢\s*(.+)/.exec(body)?.[1]?.trim()
    const requirements = /📋\s*(.+)/.exec(body)?.[1]?.trim()
    const salary = /💰\s*(.+)/.exec(body)?.[1]?.trim()
    jobs.push({ title, location, company, requirements, salary })
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

/** Render a full job detail card from session data + optional pgvector enrichment */
async function showJobDetail(ctx: BotContext, job: JobListing): Promise<void> {
  // Try to enrich with description/benefit from pgvector
  const detail = await lookupFullJobDetail(job.title)

  const company     = detail?.company     || job.company     || ''
  const requirements = detail?.requirements || job.requirements || ''
  const salary      = detail?.salary      || job.salary      || ''
  const description = detail?.description || ''
  const benefit     = detail?.benefit     || ''

  const lines: string[] = [`<b>${job.title}</b> — ${job.location}`]
  if (company)      lines.push(`🏢 ${company}`)
  if (description)  lines.push(`📄 <i>${description}</i>`)
  if (requirements) lines.push(`📋 ${requirements}`)
  if (salary)       lines.push(`💰 ${salary}`)
  if (benefit)      lines.push(`🎁 ${benefit}`)
  lines.push('')
  lines.push(`Tertarik? Ketik <b>daftar</b> atau <b>ya</b> untuk melamar posisi ini. 😊`)

  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' })
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
      // Multiple jobs — show detail bot-side, set pendingApplyJob
      const selected = jobs[idx]!
      ctx.session.pendingApplyJob = selected
      logger.info({ chat_id: chatId, event: 'job_selected', number: selectNumber, job: selected.title })
      await showJobDetail(ctx, selected)
      return
    }
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
