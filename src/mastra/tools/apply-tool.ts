import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { setPendingApply } from '../../bot/apply-trigger'

/**
 * Called by the recruiter agent when a candidate confirms they want to apply.
 * Signals the bot layer (via shared in-process Map) to transition the FSM to
 * the CONSENT state.
 */
export const applyTriggerTool = createTool({
  id: 'applyTriggerTool',
  description:
    'Trigger the formal application process for a candidate. Call this ONLY when the candidate has clearly confirmed they want to apply for a specific job (e.g. they said "daftar", "apply", "saya mau melamar", "I want to apply", or similar). Do NOT call this for general job questions.',
  inputSchema: z.object({
    chatId: z.string().describe('The candidate Telegram chat ID (from the [CHAT_ID:xxx] context line)'),
    jobTitle: z.string().describe('The job title the candidate is applying for. Use the exact title from the knowledge base if known, otherwise a descriptive string.'),
  }),
  execute: async (inputData) => {
    setPendingApply(inputData.chatId, inputData.jobTitle)
    return { triggered: true, jobTitle: inputData.jobTitle }
  },
})
