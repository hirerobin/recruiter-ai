import { describe, test, expect, mock } from 'bun:test'
import { InlineKeyboard } from 'grammy'
import { startCommand } from './commands/start'
import { handleLangId, handleLangEn } from './middleware/language'
import type { BotContext } from './middleware/session'

function makeCtx(overrides: Partial<BotContext> = {}): BotContext {
  const session = { language: null as 'id' | 'en' | null }
  return {
    reply: mock(async () => undefined),
    answerCallbackQuery: mock(async () => undefined),
    session,
    ...overrides,
  } as unknown as BotContext
}

describe('startCommand', () => {
  test('replies with greeting and inline keyboard', async () => {
    const ctx = makeCtx()
    await startCommand(ctx)

    expect(ctx.reply).toHaveBeenCalledTimes(1)
    const [text, options] = (ctx.reply as ReturnType<typeof mock>).mock.calls[0] as [string, { reply_markup: InlineKeyboard }]
    expect(text).toContain('Halo')
    expect(text).toContain('Hello')
    expect(options.reply_markup).toBeInstanceOf(InlineKeyboard)

    const buttons = options.reply_markup.inline_keyboard.flat()
    const callbackDatas = buttons.map((b) => ('callback_data' in b ? b.callback_data : ''))
    expect(callbackDatas).toContain('lang:id')
    expect(callbackDatas).toContain('lang:en')
  })
})

describe('handleLangId', () => {
  test('sets session.language to "id" and replies in Bahasa', async () => {
    const ctx = makeCtx()
    await handleLangId(ctx)

    expect(ctx.session.language).toBe('id')
    expect(ctx.answerCallbackQuery).toHaveBeenCalledTimes(1)
    const [text] = (ctx.reply as ReturnType<typeof mock>).mock.calls[0] as [string]
    expect(text).toContain('Bahasa Indonesia')
  })
})

describe('handleLangEn', () => {
  test('sets session.language to "en" and replies in English', async () => {
    const ctx = makeCtx()
    await handleLangEn(ctx)

    expect(ctx.session.language).toBe('en')
    expect(ctx.answerCallbackQuery).toHaveBeenCalledTimes(1)
    const [text] = (ctx.reply as ReturnType<typeof mock>).mock.calls[0] as [string]
    expect(text).toContain('English selected')
  })
})
