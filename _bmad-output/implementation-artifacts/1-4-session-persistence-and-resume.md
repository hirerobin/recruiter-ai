# Story 1.4: Session Persistence & Resume

Status: done

## Story

As a candidate,
I want my conversation to resume exactly where I left off if the bot restarts or I return later,
So that I never lose my progress mid-application.

## Acceptance Criteria

1. Given a candidate has completed language selection, when the bot process restarts, then the candidate's session state (language, FSM step) is preserved in PostgreSQL

2. Given a candidate returns to the bot after an interruption, when they send any message, then the bot retrieves their session and continues from the last FSM state and does not prompt for language selection again

3. Given a candidate has no existing session, when they send any message other than `/start`, then the bot redirects them to `/start` to begin a new session

## Tasks / Subtasks

- [x] Task 1: Add `bot_sessions` table to `001_init.sql` (AC: 1)
  - [x] `CREATE TABLE IF NOT EXISTS bot_sessions (key TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`
  - [x] Add index on `updated_at` for future cleanup queries

- [x] Task 2: Create `src/db/session-storage.ts` (AC: 1, 2)
  - [x] Implement `PostgresSessionStorage` class with grammy `StorageAdapter<SessionData>` interface
  - [x] `read(key)` — SELECT data FROM bot_sessions WHERE key = $1
  - [x] `write(key, value)` — INSERT … ON CONFLICT DO UPDATE (upsert)
  - [x] `delete(key)` — DELETE FROM bot_sessions WHERE key = $1

- [x] Task 3: Update `src/bot/middleware/session.ts` (AC: 1, 2)
  - [x] Changed `sessionMiddleware` export to `createSessionMiddleware(storage?)` factory function
  - [x] When `storage` is provided use it; otherwise fall back to in-memory default

- [x] Task 4: Create `src/bot/middleware/guard.ts` (AC: 3)
  - [x] Export `requireSession` middleware
  - [x] If `ctx.session.language === null` AND not a `/start` command → reply redirect message and return
  - [x] Otherwise call `next()`

- [x] Task 5: Update `src/bot/index.ts` (AC: 1, 2, 3)
  - [x] Pass `new PostgresSessionStorage()` to `createSessionMiddleware()`
  - [x] Register `requireSession` guard after session middleware

- [x] Task 6: Write tests (AC: 2, 3)
  - [x] `PostgresSessionStorage` integration tests (auto-skip when no DB)
  - [x] `requireSession`: redirects when `session.language === null`
  - [x] `requireSession`: calls `next()` when `session.language` is set
  - [x] `requireSession`: allows `/start` through even with null language
  - [x] Run `bun test` — 19 pass, 9 skip (DB integration), 0 fail

## Dev Notes

### bot_sessions Table

```sql
CREATE TABLE IF NOT EXISTS bot_sessions (
  key        TEXT        PRIMARY KEY,
  data       JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bot_sessions_updated_at ON bot_sessions (updated_at);
```

### PostgresSessionStorage

Implements grammy's `StorageAdapter<T>` interface:

```typescript
interface StorageAdapter<T> {
  read: (key: string) => Promise<T | undefined>
  write: (key: string, value: T) => Promise<void>
  delete: (key: string) => Promise<void>
}
```

Grammy session key = `ctx.chat.id` by default (one session per candidate chat).

### Guard Middleware Pattern

```typescript
export async function requireSession(ctx: BotContext, next: NextFunction): Promise<void> {
  if (!ctx.chat) return next()
  if (ctx.message?.text?.startsWith('/start')) return next()
  if (ctx.session.language === null) {
    await ctx.reply('Silakan ketik /start untuk memulai.\nPlease type /start to begin.')
    return
  }
  return next()
}
```

### Key Constraints

- `initDb()` (Story 1.2) already runs `001_init.sql` at startup — `bot_sessions` table is created before bot starts
- Do NOT add FSM state to `SessionData` yet — that is Epic 2+
- Existing unit tests are unaffected (they mock ctx directly, bypass middleware)

### References

- FR34: Session persistence across restarts
- FR35: File access control (session isolation — each `chat_id` is its own key)
- Architecture: Session state stored in PostgreSQL

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None.

### Completion Notes List

- `createSessionMiddleware(storage?)` factory pattern keeps tests clean — unit tests mock `ctx.session` directly and bypass middleware entirely; no DB needed for unit tests.
- Grammy session key defaults to `ctx.chat.id` (string) — one row per candidate in `bot_sessions`.
- Integration tests for `PostgresSessionStorage` auto-skip when Postgres is not reachable (same pattern as Story 1.2).
- `requireSession` guard handles edge cases: missing `ctx.chat` (inline queries / channel posts) passes through without redirecting.
- 19 unit tests pass, 9 DB integration tests auto-skip, 0 fail.

### File List

- `src/db/migrations/001_init.sql` (updated — added `bot_sessions` table + index)
- `src/db/session-storage.ts`
- `src/db/session-storage.test.ts`
- `src/bot/middleware/session.ts` (updated — `createSessionMiddleware` factory)
- `src/bot/middleware/guard.ts`
- `src/bot/index.ts` (updated — PostgresSessionStorage + requireSession)
- `src/bot/guard.test.ts`

### Change Log

| Date | Change |
| --- | --- |
| 2026-04-02 | Story implemented — all 6 tasks complete, 19 unit tests pass, 9 DB integration tests auto-skip |
