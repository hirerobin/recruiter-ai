# Story 1.1: Project Initialization & Local Dev Environment

Status: done

## Story

As a developer,
I want a fully initialized project with all dependencies, TypeScript config, and a local PostgreSQL+pgvector database running,
So that I can start building features immediately with a consistent, reproducible environment.

## Acceptance Criteria

1. Given a clean working directory, when `bun install` is run, then all dependencies install without errors (Mastra, grammy, googleapis, pg, pino, zod and their types)
2. Given the project root, when `docker-compose up -d` is run, then PostgreSQL 16 with pgvector extension is accessible at `localhost:5432`
3. Given `bun run src/index.ts` is run without a `.env` file, then the app exits with a clear Zod validation error listing all missing required env vars
4. Given `.env.example` exists, when a developer copies it to `.env` and fills in values, then all required environment variables are documented with inline descriptions
5. Given a valid `.env`, when `bun run src/index.ts` is run, then the app starts without errors and Pino logs a startup message to stdout

## Tasks / Subtasks

- [x] Task 1: Initialize Bun project and install dependencies (AC: 1)
  - [x] Run `bun init -y` to create package.json
  - [x] Install production deps: `bun add @mastra/core @mastra/rag @ai-sdk/openai grammy @grammyjs/conversations googleapis pg pino zod`
  - [x] Install dev deps: `bun add -d @types/pg @types/bun typescript`
  - [x] Verify `bun install` completes without errors

- [x] Task 2: Create TypeScript configuration (AC: 1)
  - [x] Create `tsconfig.json` with strict mode, target ES2022, module NodeNext
  - [x] Ensure paths resolve correctly for `src/` imports

- [x] Task 3: Create `.gitignore` and `.env.example` (AC: 4)
  - [x] Create `.gitignore` — exclude: `.env`, `node_modules/`, `uploads/`, `*.js` (except config), `dist/`
  - [x] Create `.env.example` with all required vars and inline descriptions:
    - `TELEGRAM_BOT_TOKEN` — from BotFather
    - `TELEGRAM_WEBHOOK_URL` — HTTPS URL for webhook (leave empty for polling in dev)
    - `TELEGRAM_WEBHOOK_SECRET` — random secret for webhook validation
    - `ADMIN_TELEGRAM_CHAT_IDS` — comma-separated list of admin chat IDs
    - `RECRUITER_TELEGRAM_CHAT_ID` — recruiter's chat ID for escalation notifications
    - `OPENAI_API_KEY` — OpenAI API key
    - `DATABASE_URL` — PostgreSQL connection string (e.g. postgresql://user:pass@localhost:5432/recruiter_ai)
    - `NODE_ENV` — development or production

- [x] Task 4: Create `docker-compose.yml` for PostgreSQL + pgvector (AC: 2)
  - [x] Use image `pgvector/pgvector:pg16`
  - [x] Expose port 5432
  - [x] Set env: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB=recruiter_ai`
  - [x] Mount a named volume for data persistence
  - [x] Verify `docker-compose up -d` starts the container and pgvector is available

- [x] Task 5: Create `src/config/env.ts` with Zod validation (AC: 3, 5)
  - [x] Define Zod schema for all required env vars
  - [x] Parse `process.env` (or `Bun.env`) at module load time
  - [x] Throw descriptive error listing all missing/invalid vars if validation fails
  - [x] Export typed `env` object for use throughout the app

- [x] Task 6: Create `src/index.ts` entry point (AC: 3, 5)
  - [x] Import `env` from `src/config/env.ts` (triggers validation on startup)
  - [x] Initialize Pino logger
  - [x] Log startup message: `logger.info({ msg: 'recruiter-ai starting', env: env.NODE_ENV })`
  - [x] App exits with clear error if env validation fails (AC: 3)

- [x] Task 7: Create empty placeholder directories and `.gitkeep` files
  - [x] `uploads/.gitkeep`
  - [x] `knowledge/.gitkeep`
  - [x] `_bmad-output/implementation-artifacts/` (already exists)

- [x] Task 8: Write tests for env validation (AC: 3)
  - [x] Test: missing required env var throws descriptive error
  - [x] Test: all vars present → `env` object has correct typed values
  - [x] Run `bun test` — all tests pass

## Dev Notes

### Stack Versions (verified 2026-04-02)

| Package | Version |
| ------- | ------- |
| Bun.js | 1.3.10 |
| @mastra/core | 1.17.0 |
| @mastra/rag | (same as core, part of mastra monorepo) |
| grammy | 1.41.1 |
| pino | 10.3.1 |
| zod | 4.3.6 |
| PostgreSQL | 16 (via pgvector/pgvector:pg16 Docker image) |
| pgvector extension | 0.8.2 |

### Architecture Compliance

This story implements the project scaffold defined in `architecture.md` — Starter Template & Stack Decision section.

**Required project structure (create these dirs/files):**

```text
recruiter-ai/
├── src/
│   ├── index.ts              ← Entry point
│   └── config/
│       └── env.ts            ← Zod env validation
├── uploads/
│   └── .gitkeep
├── knowledge/
│   └── .gitkeep
├── .env                      ← NOT committed (gitignored)
├── .env.example              ← Committed template
├── .gitignore
├── tsconfig.json
├── package.json
└── docker-compose.yml
```

**Do NOT create yet** (later stories):

- `src/bot/` — Story 1.3
- `src/mastra/` — Story 1.2
- `src/db/` — Story 1.2
- `src/types/` — Story 1.3+

### Naming Conventions (from architecture patterns)

- Files: `kebab-case` (e.g., `env.ts` not `Env.ts`)
- Variables/functions: `camelCase`
- Env var names: `SCREAMING_SNAKE_CASE`
- TypeScript types: `PascalCase`

### Environment Variable Schema (Zod)

```typescript
import { z } from 'zod'

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_URL: z.string().url().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  ADMIN_TELEGRAM_CHAT_IDS: z.string().min(1),
  RECRUITER_TELEGRAM_CHAT_ID: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  DATABASE_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'production']).default('development'),
})

export const env = envSchema.parse(Bun.env)
export type Env = z.infer<typeof envSchema>
```

**Note on Zod v4:** In Zod v4 (4.x), the API is largely compatible with v3. Use `z.object`, `z.string`, `z.enum`, `.parse()` — all work the same. No breaking changes relevant to this schema.

### Docker Compose Reference

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: recruiter
      POSTGRES_PASSWORD: recruiter_pass
      POSTGRES_DB: recruiter_ai
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

The `pgvector/pgvector:pg16` image has pgvector pre-installed — no need to manually install the extension.

### Pino Logger Setup

```typescript
import pino from 'pino'
export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
})
```

Pino v10 has the same API as v9. No breaking changes for basic usage.

### Testing with Bun

Bun has a built-in test runner. Tests are co-located as `*.test.ts`:

```bash
bun test                    # run all tests
bun test src/config/        # run tests in specific directory
```

Test files use `describe`, `test`, `expect` from `bun:test`:

```typescript
import { describe, test, expect } from 'bun:test'
```

### Key Constraints

- All secrets via `Bun.env` — NEVER hardcoded (NFR7)
- `.env` is gitignored — `.env.example` is committed
- This story does NOT connect to the database — that is Story 1.2
- This story does NOT start the Telegram bot — that is Story 1.3

### References

- Stack decisions: [architecture.md — Starter Template & Stack Decision](_bmad-output/planning-artifacts/architecture.md)
- Naming patterns: [architecture.md — Implementation Patterns & Consistency Rules](_bmad-output/planning-artifacts/architecture.md)
- Project structure: [architecture.md — Project Structure & Boundaries](_bmad-output/planning-artifacts/architecture.md)
- FR coverage: FR1 partial (entry point), NFR7 (env vars), NFR13 partial (foundation for session)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None.

### Completion Notes List

- Actual installed versions differ slightly from research: Bun 1.3.4 (research said 1.3.10), @mastra/core 1.21.0 (research said 1.17.0) — both newer, no API changes affecting this story.
- `bun init -y` created a root `index.ts` — deleted it; entry point is `src/index.ts` per architecture.
- `DATABASE_URL` uses `z.string().min(1)` instead of `z.string().url()` for flexibility with connection string formats that Zod's url validator rejects (e.g. postgres:// scheme).
- All 5 ACs verified manually: bun install ✅, docker-compose up -d ✅, missing .env exits with clear error ✅, .env.example documented ✅, valid env starts with Pino log ✅.
- 8/8 tests passing (`bun test src/config/`).

### File List

- `package.json`
- `tsconfig.json`
- `docker-compose.yml`
- `.gitignore`
- `.env.example`
- `src/index.ts`
- `src/config/env.ts`
- `src/config/env.test.ts`
- `uploads/.gitkeep`
- `knowledge/.gitkeep`

### Change Log

| Date | Change |
| --- | --- |
| 2026-04-02 | Story implemented — all 8 tasks complete, 5 ACs verified, 8 tests passing |
