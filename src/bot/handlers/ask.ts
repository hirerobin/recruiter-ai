import { recruiterAgent } from '../../mastra/agents/recruiter-agent'
import { logger } from '../../logger'
import { consumePendingApply } from '../apply-trigger'
import { triggerConfirmation } from './fsm'
import type { BotContext } from '../middleware/session'

const FALLBACK_ID = 'id'
const FALLBACK_EN = 'en'

const APOLOGY: Record<string, string> = {
  id: '⚠️ Maaf, saya sedang mengalami gangguan teknis. Tim kami telah diberitahu dan akan segera membantu Anda.',
  en: '⚠️ Sorry, I\'m experiencing a technical issue. Our team has been notified and will assist you shortly.',
}

// Keywords that indicate the candidate wants to apply
const APPLY_KEYWORDS = ['daftar', 'apply', 'melamar', 'mendaftar', 'lamar']

function isApplyIntent(text: string): boolean {
  const lower = text.toLowerCase().trim()
  return APPLY_KEYWORDS.some((kw) => lower.includes(kw))
}

export async function handleCandidateMessage(ctx: BotContext): Promise<void> {
  const text = ctx.message?.text
  if (!text) return

  const chatId = String(ctx.chat!.id)
  const language = ctx.session.language ?? FALLBACK_ID

  logger.info({ chat_id: chatId, event: 'candidate_message', language })

  // If candidate already discussed a job and says "daftar", trigger directly
  // without waiting for the agent (which often asks follow-up questions instead)
  if (isApplyIntent(text) && ctx.session.appliedJob) {
    logger.info({ chat_id: chatId, event: 'direct_apply_trigger', job: ctx.session.appliedJob })
    await triggerConfirmation(ctx, ctx.session.appliedJob)
    return
  }

  // Prefix chatId so the agent can extract it for applyTriggerTool
  const messageWithContext = `[CHAT_ID:${chatId}]\n${text}`

  let reply: string
  try {
    const result = await recruiterAgent.generate(messageWithContext, {
      memory: {
        thread: chatId,
        resource: chatId,
      },
    })
    reply = result.text ?? ''
  } catch (err) {
    logger.error({ chat_id: chatId, event: 'agent_error', err })
    reply = APOLOGY[language] ?? APOLOGY[FALLBACK_EN]
  }

  if (!reply.trim()) {
    reply = APOLOGY[language] ?? APOLOGY[FALLBACK_EN]
  }

  // Check if the agent triggered the application flow via tool
  const pendingJob = consumePendingApply(chatId)
  if (pendingJob !== null) {
    ctx.session.appliedJob = pendingJob
    if (reply.trim()) await ctx.reply(reply, { parse_mode: 'HTML' })
    await triggerConfirmation(ctx, pendingJob)
    return
  }

  // Extract job title from agent response for future "daftar" shortcut
  // If agent mentions a specific job, remember it in session
  if (!ctx.session.appliedJob && reply) {
    const jobMatch = /<b>([^<]+)<\/b>\s*[—–-]\s*\S+/.exec(reply)
    if (jobMatch?.[1]) {
      ctx.session.appliedJob = jobMatch[1].trim()
      logger.info({ chat_id: chatId, event: 'job_detected', job: ctx.session.appliedJob })
    }
  }

  await ctx.reply(reply, { parse_mode: 'HTML' })
}
