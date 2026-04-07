import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { env } from '../../config/env'
import { logger } from '../../logger'

export interface NotifyInput {
  chatId: string
  question: string
  language: 'id' | 'en'
}

export async function sendRecruiterNotification(input: NotifyInput): Promise<void> {
  const { chatId, question, language } = input
  const candidateLink = `tg://user?id=${chatId}`
  const message =
    language === 'id'
      ? `📢 *Eskalasi dari kandidat*\n\nChat ID: \`${chatId}\`\nLink: ${candidateLink}\n\nPertanyaan:\n_${question}_`
      : `📢 *Escalation from candidate*\n\nChat ID: \`${chatId}\`\nLink: ${candidateLink}\n\nQuestion:\n_${question}_`

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: env.RECRUITER_TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: 'Markdown',
        }),
      }
    )
    if (res.ok) {
      logger.info({ chat_id: chatId, event: 'notify_recruiter_sent' })
    } else {
      const body = await res.text()
      logger.error({ chat_id: chatId, event: 'notify_recruiter_failed', status: res.status, body })
    }
  } catch (err) {
    logger.error({ chat_id: chatId, event: 'notify_recruiter_error', err })
  }
}

export const notifyTool = createTool({
  id: 'notify-recruiter',
  description: 'Send a Telegram DM to the recruiter for escalation.',
  inputSchema: z.object({
    chatId: z.string(),
    question: z.string(),
    language: z.enum(['id', 'en']),
  }),
  execute: async (inputData) => {
    await sendRecruiterNotification(inputData)
    return { success: true }
  },
})
