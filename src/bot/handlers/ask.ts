import { recruiterAgent } from '../../mastra/agents/recruiter-agent'
import { logger } from '../../logger'
import { consumePendingApply } from '../apply-trigger'
import { triggerConfirmation } from './fsm'
import { loadBotResponses, matchResponse } from '../../mastra/tools/bot-responses'
import type { BotContext } from '../middleware/session'

const APOLOGY = '⚠️ Maaf, saya sedang mengalami gangguan teknis. Tim kami telah diberitahu dan akan segera membantu Anda.'

const APPLY_KEYWORDS = ['daftar', 'apply', 'melamar', 'mendaftar', 'lamar']

function isApplyIntent(text: string): boolean {
  return APPLY_KEYWORDS.some((kw) => text.toLowerCase().trim().includes(kw))
}

async function sendReply(ctx: BotContext, reply: string): Promise<void> {
  try {
    await ctx.reply(reply, { parse_mode: 'HTML' })
  } catch {
    await ctx.reply(reply.replace(/<[^>]*>/g, ''))
  }
}

export async function handleCandidateMessage(ctx: BotContext): Promise<void> {
  const text = ctx.message?.text
  if (!text) return

  const chatId = String(ctx.chat!.id)
  logger.info({ chat_id: chatId, event: 'candidate_message' })

  // 1. Direct apply shortcut
  if (isApplyIntent(text) && ctx.session.appliedJob) {
    logger.info({ chat_id: chatId, event: 'direct_apply_trigger', job: ctx.session.appliedJob })
    await triggerConfirmation(ctx, ctx.session.appliedJob)
    return
  }

  // 2. Check bot response templates from Sheets (greeting, thanks, farewell, etc.)
  const responses = await loadBotResponses()
  const matched = matchResponse(text, responses)

  if (matched) {
    logger.info({ chat_id: chatId, event: 'bot_response_matched', category: matched.category })

    // [SHOW_JOBS] / [SEARCH_JOBS] → forward to RAG agent
    if (matched.response === '[SHOW_JOBS]' || matched.response === '[SEARCH_JOBS]') {
      // Fall through to agent below
    } else {
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
  messageWithContext += text

  let reply: string
  try {
    const result = await recruiterAgent.generate(messageWithContext, {
      memory: { thread: chatId, resource: chatId },
    })
    reply = result.text ?? ''
  } catch (err) {
    logger.error({ chat_id: chatId, event: 'agent_error', err })
    reply = APOLOGY
  }

  if (!reply.trim()) reply = APOLOGY

  // Check if agent triggered application flow
  const pendingJob = consumePendingApply(chatId)
  if (pendingJob !== null) {
    ctx.session.appliedJob = pendingJob
    if (reply.trim()) await sendReply(ctx, reply)
    await triggerConfirmation(ctx, pendingJob)
    return
  }

  // Extract job title for future "daftar" shortcut
  if (!ctx.session.appliedJob && reply) {
    const jobMatch = /<b>([^<]+)<\/b>\s*[—–-]\s*\S+/.exec(reply)
    if (jobMatch?.[1]) {
      ctx.session.appliedJob = jobMatch[1].trim()
      logger.info({ chat_id: chatId, event: 'job_detected', job: ctx.session.appliedJob })
    }
  }

  await sendReply(ctx, reply)
}
