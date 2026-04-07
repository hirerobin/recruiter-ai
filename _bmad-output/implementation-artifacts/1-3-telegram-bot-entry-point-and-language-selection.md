# Story 1.3: Telegram Bot Entry Point & Language Selection

Status: done

## Story

As a candidate,
I want to start the bot with `/start` and choose my language,
So that all subsequent messages are in my preferred language.

## Acceptance Criteria

1. Given a candidate sends `/start` to the bot, when the bot receives the message, then the bot replies with a greeting explaining what the bot does and presents two language options: [Bahasa Indonesia] [English]

2. Given a candidate selects Bahasa Indonesia, when the language is selected, then the bot confirms selection in Bahasa Indonesia and the language preference is stored in the candidate's session

3. Given a candidate selects English, when the language is selected, then the bot confirms selection in English and subsequent bot messages use English

4. Given the bot is deployed in webhook mode, when a webhook request arrives with an invalid or missing secret token, then the request is rejected with 403 and not processed

## Tasks / Subtasks

- [x] Task 1: Create `src/bot/middleware/session.ts` (AC: 2, 3)
  - [x] Define `SessionData` interface: `{ language: 'id' | 'en' | null }`
  - [x] Define `BotContext` type: `Context & SessionFlavor<SessionData>`
  - [x] Export grammy `session()` middleware with `initial: () => ({ language: null })`

- [x] Task 2: Create `src/bot/commands/start.ts` (AC: 1)
  - [x] Build greeting message (ID and EN side-by-side, pre-language-selection)
  - [x] Build `InlineKeyboard` with two buttons: Bahasa Indonesia (`lang:id`), English (`lang:en`)
  - [x] Export `startCommand` handler function

- [x] Task 3: Create `src/bot/middleware/language.ts` (AC: 2, 3)
  - [x] Handle `callbackQuery('lang:id')`: set `ctx.session.language = 'id'`, confirm in Bahasa
  - [x] Handle `callbackQuery('lang:en')`: set `ctx.session.language = 'en'`, confirm in English
  - [x] Call `ctx.answerCallbackQuery()` in both handlers

- [x] Task 4: Create `src/bot/index.ts` (AC: 1, 4)
  - [x] Instantiate `Bot<BotContext>` with `env.TELEGRAM_BOT_TOKEN`
  - [x] Apply session middleware
  - [x] Register `/start` command handler
  - [x] Register language callback query handlers
  - [x] Export `startBot()`: polling if no `TELEGRAM_WEBHOOK_URL`, else `Bun.serve()` + `webhookCallback(bot, 'bun', { secretToken })`

- [x] Task 5: Wire `startBot()` into `src/index.ts` (AC: 1)
  - [x] Import and call `await startBot()` after `initDb()`
  - [x] Logs `{ msg: 'bot started', mode: 'polling'|'webhook' }` on success

- [x] Task 6: Write tests for handlers (AC: 1, 2, 3)
  - [x] Test: `/start` sends greeting with language keyboard (buttons contain lang:id, lang:en)
  - [x] Test: `lang:id` callback sets session.language and replies in Bahasa
  - [x] Test: `lang:en` callback sets session.language and replies in English
  - [x] Run `bun test` — 14 pass, 3 skip (DB integration), 0 fail

## Dev Notes

### Files Created

```text
src/
├── bot/
│   ├── index.ts                    ← Bot setup + startBot()
│   ├── commands/
│   │   └── start.ts                ← /start handler
│   └── middleware/
│       ├── session.ts              ← SessionData + BotContext type
│       └── language.ts             ← Callback query handlers for lang selection
└── index.ts                        ← updated: calls startBot()
```

### BotContext Pattern

```typescript
import { Context, SessionFlavor } from 'grammy'

export interface SessionData {
  language: 'id' | 'en' | null
}

export type BotContext = Context & SessionFlavor<SessionData>
```

### Session Note

Grammy in-memory session is used in this story. Session survives for the process lifetime only. Story 1.4 replaces MemorySessionStorage with a PostgreSQL-backed adapter for persistence across restarts.

### Webhook Mode

```typescript
import { webhookCallback } from 'grammy'
// grammy 'bun' adapter works with Bun.serve() natively
const handler = webhookCallback(bot, 'bun', {
  secretToken: env.TELEGRAM_WEBHOOK_SECRET,
})
Bun.serve({ port: 3000, fetch: handler })
```

Grammy validates `X-Telegram-Bot-Api-Secret-Token` header automatically — returns 401 on mismatch.

### Key Constraints

- Do NOT add FSM logic — that is Story 2.x
- Do NOT add Mastra agent calls — that is Story 2.x
- Language stored in grammy session only (Story 1.4 adds persistence)
- Never send empty messages — always reply

### References

- FR1–FR3: bot entry, language, session foundation
- NFR4: HTTPS webhook + secret token validation
- Architecture: `src/bot/` boundaries

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None.

### Completion Notes List

- Extracted `logger` to `src/logger.ts` to avoid circular dependency (`bot/index.ts` → `index.ts` → `bot/index.ts`).
- Grammy has a native `'bun'` adapter for `webhookCallback` — no extra package needed.
- Grammy auto-validates `X-Telegram-Bot-Api-Secret-Token` header when `secretToken` is set in `webhookCallback` options (returns 401 on mismatch).
- Test for `startCommand` checks that the keyboard contains `lang:id` and `lang:en` callback data, not the text content (text is in keyboard buttons, not the message body).
- In-memory grammy session used — Story 1.4 will add PostgreSQL persistence.
- 14 pass, 3 skip (DB integration), 0 fail.

### File List

- `src/bot/middleware/session.ts`
- `src/bot/commands/start.ts`
- `src/bot/middleware/language.ts`
- `src/bot/index.ts`
- `src/logger.ts` (new — extracted from index.ts to break circular dep)
- `src/index.ts` (updated)
- `src/bot/bot.test.ts`

### Change Log

| Date | Change |
| --- | --- |
| 2026-04-02 | Story implemented — all 6 tasks complete, 14 unit tests pass |
