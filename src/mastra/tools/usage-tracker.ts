/**
 * Per-session AI usage tracker.
 * Accumulates token usage across all AI calls in a recruitment session
 * (recruiter chat, embeddings, vision validation, interview scoring)
 * and provides cost estimates in USD.
 *
 * Usage is keyed by storeId (chatId or chatId_timestamp in dev).
 */

interface ModelUsage {
  inputTokens: number
  outputTokens: number
  calls: number
}

interface SessionUsage {
  models: Record<string, ModelUsage>
  startedAt: number
}

// Pricing per 1M tokens as of mid-2025
const PRICE_PER_1M: Record<string, { input: number; output: number }> = {
  'gpt-4o':                    { input: 2.50,  output: 10.00 },
  'gpt-4o-mini':               { input: 0.15,  output: 0.60  },
  'text-embedding-3-small':    { input: 0.02,  output: 0     },
  'gpt-4o-realtime-preview':   { input: 5.00,  output: 20.00 },
}

const sessions = new Map<string, SessionUsage>()

function getOrCreate(storeId: string): SessionUsage {
  let s = sessions.get(storeId)
  if (!s) {
    s = { models: {}, startedAt: Date.now() }
    sessions.set(storeId, s)
  }
  return s
}

export function trackUsage(
  storeId: string,
  model: string,
  inputTokens: number,
  outputTokens = 0,
): void {
  const s = getOrCreate(storeId)
  const key = model.replace(/^(openai\/)/, '').split('-20')[0]! // strip date suffix
  const m = s.models[key] ?? { inputTokens: 0, outputTokens: 0, calls: 0 }
  m.inputTokens += inputTokens
  m.outputTokens += outputTokens
  m.calls += 1
  s.models[key] = m
}

function calcCost(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICE_PER_1M[model]
  if (!price) return 0
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000
}

export function getSessionSummary(storeId: string): string | null {
  const s = sessions.get(storeId)
  if (!s) return null

  let totalCost = 0
  let totalInput = 0
  let totalOutput = 0
  const lines: string[] = []

  for (const [model, usage] of Object.entries(s.models)) {
    const cost = calcCost(model, usage.inputTokens, usage.outputTokens)
    totalCost += cost
    totalInput += usage.inputTokens
    totalOutput += usage.outputTokens
    const costStr = cost > 0 ? ` | $${cost.toFixed(4)}` : ''
    lines.push(`${model}: in=${usage.inputTokens} out=${usage.outputTokens} calls=${usage.calls}${costStr}`)
  }

  const durationMin = Math.round((Date.now() - s.startedAt) / 60_000)
  const header = `Total: in=${totalInput} out=${totalOutput} | $${totalCost.toFixed(4)} | ${durationMin}min`
  return [header, ...lines].join('\n')
}

export function clearSession(storeId: string): void {
  sessions.delete(storeId)
}
