import { describe, test, expect, mock } from 'bun:test'
import { requireSession } from './middleware/guard'
import type { BotContext } from './middleware/session'

function makeCtx(
  language: 'id' | 'en' | null,
  text?: string
): BotContext {
  return {
    chat: { id: 123 },
    message: text !== undefined ? { text } : undefined,
    session: { language },
    reply: mock(async () => undefined),
  } as unknown as BotContext
}

describe('requireSession', () => {
  test('calls next() when session language is set', async () => {
    const ctx = makeCtx('id')
    const next = mock(async () => undefined)
    await requireSession(ctx, next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(ctx.reply).not.toHaveBeenCalled()
  })

  test('redirects to /start when language is null and message is not /start', async () => {
    const ctx = makeCtx(null, 'hello')
    const next = mock(async () => undefined)
    await requireSession(ctx, next)
    expect(next).not.toHaveBeenCalled()
    expect(ctx.reply).toHaveBeenCalledTimes(1)
    const [text] = (ctx.reply as ReturnType<typeof mock>).mock.calls[0] as [string]
    expect(text).toContain('/start')
  })

  test('allows /start through even when language is null', async () => {
    const ctx = makeCtx(null, '/start')
    const next = mock(async () => undefined)
    await requireSession(ctx, next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(ctx.reply).not.toHaveBeenCalled()
  })

  test('calls next() when ctx.chat is missing (non-chat update)', async () => {
    const ctx = makeCtx(null) as BotContext
    ;(ctx as Record<string, unknown>).chat = undefined
    const next = mock(async () => undefined)
    await requireSession(ctx, next)
    expect(next).toHaveBeenCalledTimes(1)
  })
})
