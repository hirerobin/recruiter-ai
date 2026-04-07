/**
 * In-process shared state for agent→FSM handoff.
 *
 * When the recruiter agent decides a candidate is ready to apply, it calls
 * applyTriggerTool which sets a pending entry here.  After agent.generate()
 * returns, handleCandidateMessage calls consumePendingApply() to check for
 * and clear the flag, then calls triggerConfirmation() in the bot layer.
 */

const pendingTriggers = new Map<string, string>() // chatId → jobTitle

export function setPendingApply(chatId: string, jobTitle: string): void {
  pendingTriggers.set(chatId, jobTitle)
}

export function consumePendingApply(chatId: string): string | null {
  const jobTitle = pendingTriggers.get(chatId) ?? null
  if (jobTitle !== null) pendingTriggers.delete(chatId)
  return jobTitle
}
