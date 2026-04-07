---
stepsCompleted: ['step-01-init', 'step-02-context', 'step-03-starter', 'step-04-decisions', 'step-05-patterns', 'step-06-structure', 'step-07-validation', 'step-08-complete']
status: 'complete'
completedAt: '2026-04-02'
inputDocuments: ['prd.md']
workflowType: 'architecture'
project_name: 'recruiter-ai'
user_name: 'Rashauna'
date: '2026-03-28'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements (35 FRs across 6 capability areas):**

- Conversation & Onboarding (FR1–FR5): Telegram entry point, language selection, session persistence, UU PDP consent
- Job Discovery & Q&A (FR6–FR12): RAG-powered free-form Q&A grounded in job knowledge base, AI escalation on low confidence
- Candidate Application (FR13–FR18): Data collection via conversation, file uploads (KTP, Pas photo, CV) with confirmation
- Candidate Screening & Outcome (FR19–FR23): Match scoring engine, pass/fail routing, rejection with re-entry, post-test delivery
- Knowledge Base Management (FR24–FR27): Admin CRUD on job data without code changes, auto re-indexing on change
- Recruiter Operations (FR28–FR33): Telegram escalation notifications, Google Sheets CRUD (partial/full/rejected/final)
- Data & Session Management (FR34–FR35): Session persistence across restarts, file access control

**Non-Functional Requirements (18 NFRs — architecturally significant):**

- Performance: ≤3s conversational response, ≤5s RAG response, non-blocking Sheets writes
- Security: Access-controlled file storage, env-only secrets, UU PDP consent recording, no over-collection
- Scalability: 50 concurrent sessions baseline, re-indexing must not block live sessions, Sheets→Postgres migration path
- Reliability: Session persistence on restart, Sheets write queue+retry, OpenAI fallback to escalation
- Integration: Least-privilege service account, HTTPS webhook + secret token, ≤10s timeouts with graceful errors

**Scale & Complexity:**

- Complexity level: Medium-High
- Primary domain: Backend service + Conversational AI
- Estimated architectural components: 7 (Bot handler, FSM engine, RAG pipeline, Knowledge base ingester, Google Sheets adapter, File store, Notification service)
- Concurrent sessions baseline: 50

### Technical Constraints & Dependencies

- Runtime: Bun.js single process (MVP)
- Bot framework: grammy (TypeScript-first, session middleware built-in)
- Database: PostgreSQL — dual purpose (pgvector for RAG + session state table)
- External APIs: OpenAI (embeddings + generation), Google Sheets API, Telegram Bot API
- File size limit: 20MB per Telegram upload
- All secrets via `.env` — never hardcoded

### Cross-Cutting Concerns

- **Error handling & retry:** Google Sheets unavailability → queue + retry; OpenAI unavailability → escalate to recruiter
- **Language context (ID/EN):** Must propagate through FSM state, RAG response prompts, rejection messages, and recruiter notifications
- **Session isolation:** Each `chat_id` is fully independent; no shared mutable state between concurrent sessions
- **Graceful degradation:** Bot must never go silent — always escalate or notify on any failure path
- **Secrets management:** Single `.env` file, accessed via Bun's built-in env handling

## Starter Template & Stack Decision

### Primary Technology Domain

Backend AI Service + Conversational Bot — no frontend, no web framework needed.

### Selected Approach: Mastra + Bun.js (Manual Init)

**Rationale:** Mastra v1.0 (stable, Jan 2026) replaces the majority of custom plumbing originally planned — RAG pipeline, conversation memory, and workflow execution are all built-in. No official `bun create grammy` or Mastra+Bun starter exists, so we initialize manually. Bun.js is retained for runtime performance; Mastra is pure TypeScript with no native C++ addons — compatible with Bun.

**Final Stack:**

| Layer | Technology | Rationale |
| --- | --- | --- |
| Runtime | Bun.js | Fast startup, TypeScript-native, Node.js compatible |
| AI Framework | Mastra v1.0 | Built-in RAG, memory, workflows, pgvector integration |
| Bot Framework | grammy | TypeScript-first Telegram bot, Bun-compatible |
| LLM | OpenAI GPT-4o | Via Mastra's AI SDK integration |
| Embeddings | OpenAI text-embedding-3-small | Via Mastra's built-in embedding support |
| Vector Store | pgvector (PostgreSQL) | Mastra has native pgvector integration |
| Session State | Mastra memory (pgvector-backed) | Replaces custom session table |
| Candidate Records | Google Sheets API | MVP tracking — migrates to Postgres in Phase 2 |
| File Storage | Local `uploads/` folder | MVP — migrates to cloud bucket in Phase 2 |
| Secrets | `.env` via `Bun.env` | Never hardcoded, gitignored |

**Initialization Commands:**

```bash
bun init -y
bun add @mastra/core @mastra/rag @ai-sdk/openai
bun add grammy @grammyjs/conversations
bun add googleapis
bun add pg
bun add -d @types/pg @types/bun typescript
```

**Project Structure:**

```text
recruiter-ai/
├── src/
│   ├── bot/
│   │   ├── index.ts              # grammy bot setup + webhook/polling
│   │   ├── commands/             # /start handler
│   │   └── middleware/           # Language detection
│   ├── mastra/
│   │   ├── index.ts              # Mastra instance configuration
│   │   ├── agents/
│   │   │   └── recruiter.ts      # Recruiter AI agent (RAG + memory)
│   │   ├── workflows/
│   │   │   └── screening.ts      # Candidate screening workflow (FSM)
│   │   ├── tools/
│   │   │   ├── scoring.ts        # Candidate match scoring tool
│   │   │   ├── sheets.ts         # Google Sheets read/write tool
│   │   │   ├── notify.ts         # Recruiter Telegram notification tool
│   │   │   └── files.ts          # File upload/storage tool
│   │   └── rag/
│   │       └── knowledge.ts      # Job knowledge base + pgvector config
│   ├── db/
│   │   └── client.ts             # PostgreSQL connection (pgvector)
│   └── config/
│       └── env.ts                # Typed env vars
├── knowledge/                    # Job data files (CSV/JSON for ingestion)
├── uploads/                      # Candidate file storage (MVP)
├── .env                          # Secrets (gitignored)
├── .env.example
├── tsconfig.json
└── package.json
```

**Note:** Project initialization and dependency installation is the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**

- PostgreSQL hosting: Local Docker (dev) → own VPS (production)
- Bot deployment: Own VPS with HTTPS webhook
- Logging & observability: Pino + Mastra built-in tracing (combined)

**Important Decisions (Shape Architecture):**

- Input validation: Zod for env vars and Mastra tool inputs
- File access: Path-scoped local filesystem (`uploads/<chat_id>/`)
- Session state: Mastra memory (pgvector-backed) — no Redis needed
- Candidate records: Google Sheets API (MVP) → Postgres Phase 2

**Deferred Decisions (Post-MVP):**

- File storage → cloud bucket (S3-compatible) in Phase 2
- Google Sheets → Postgres relational tables in Phase 2
- CI/CD pipeline → post-MVP (manual VPS deploy for MVP)

### Data Architecture

| Decision | Choice | Rationale |
| --- | --- | --- |
| Primary database | PostgreSQL 16 (pgvector) | Mastra native integration; dual-purpose RAG + session |
| Dev database | Local Docker (`postgres:16-alpine`) | Zero-cost, offline, matches prod schema |
| Prod database | PostgreSQL on own VPS | Co-located with bot — low latency, no egress cost |
| Session state | Mastra Memory (pgvector-backed) | Built-in; 50 concurrent sessions well within limits |
| Candidate records | Google Sheets API | Recruiter team already uses Sheets; migrate Phase 2 |
| Input validation | Zod | TypeScript-native for env vars and tool inputs |
| RAG vector store | pgvector (via Mastra) | Single DB; no additional vector infrastructure |

### Authentication & Security

| Decision | Choice | Rationale |
| --- | --- | --- |
| Bot auth | Telegram secret token header | grammy validates `X-Telegram-Bot-Api-Secret-Token` |
| Secrets management | `.env` via `Bun.env` | Never hardcoded; `.env` gitignored |
| UU PDP consent | Recorded in Mastra session state | Consent timestamp + chat_id logged before data collection |
| File access control | Scoped to `uploads/<chat_id>/` | Candidates cannot access other candidates' files |
| Over-collection | Only FR14–FR17 fields collected | Enforced by FSM — no free-form data extraction |

### API & Communication Patterns

| Decision | Choice | Rationale |
| --- | --- | --- |
| Telegram integration | HTTPS Webhook (own VPS) | More efficient than polling; VPS provides stable endpoint |
| Webhook security | Secret token header validation | grammy built-in `webhookCallback` |
| Google Sheets writes | Async queue + retry (in-memory, MVP) | Non-blocking; handles transient Sheets API failures |
| OpenAI fallback | Escalate to recruiter on error | Bot never goes silent — FR20 requirement |
| Response timeout | ≤3s conversational / ≤5s RAG | Enforced by Mastra agent timeout config |

### Infrastructure & Deployment

| Decision | Choice | Rationale |
| --- | --- | --- |
| Runtime | Bun.js (single process, own VPS) | Low memory; handles 50 concurrent sessions comfortably |
| Deployment target | Own VPS (Linux) | Full control; co-located with PostgreSQL |
| Process management | systemd service (or Docker on VPS) | Auto-restart on crash; startup on boot |
| File storage (MVP) | Local `uploads/` on VPS | Sufficient for MVP; migrates to cloud bucket Phase 2 |
| Logging | Pino (structured JSON) + Mastra tracing | Pino: low-overhead logs; Mastra: AI agent trace spans |
| Log output (MVP) | stdout → systemd journal | No external aggregator for MVP |
| CI/CD | Manual deploy (MVP) | Single dev; automate post-MVP |

### Decision Impact Analysis

**Implementation Sequence:**

1. PostgreSQL + pgvector on Docker (local) → Mastra-ready
2. `.env` configuration with all required secrets
3. grammy bot + webhook registration on VPS
4. Mastra instance + pgvector connection
5. RAG knowledge base ingestion pipeline
6. Recruiter AI agent (RAG + memory)
7. Screening workflow (FSM: GREETING → OUTCOME)
8. Google Sheets adapter + async write queue
9. Scoring tool + file upload tool
10. Recruiter notification tool

**Cross-Component Dependencies:**

- Mastra memory requires pgvector initialized before bot starts
- Screening workflow requires scoring + Sheets tools registered in Mastra
- Recruiter notification requires `RECRUITER_TELEGRAM_CHAT_ID` env var
- RAG pipeline requires knowledge base seeded before first candidate interaction

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:** 6 areas where AI agents could make inconsistent choices — naming, file structure, tool return formats, error handling, logging, and FSM state management.

### Naming Patterns

**Database Naming:**

- Tables: `snake_case` plural — `candidate_sessions`, `job_embeddings`
- Columns: `snake_case` — `chat_id`, `consent_recorded_at`, `created_at`
- pgvector column: always named `embedding` (standardized across tables)
- Indexes: `idx_<table>_<column>` — e.g., `idx_candidate_sessions_chat_id`

**Code Naming:**

- Variables/functions: `camelCase` — `chatId`, `getCandidateData`
- Types/interfaces: `PascalCase` — `CandidateData`, `JobRecord`
- Enums: `PascalCase` name, `SCREAMING_SNAKE_CASE` values — `FsmState.DATA_COLLECTION`
- FSM state literals: `SCREAMING_SNAKE_CASE` — `GREETING`, `DATA_COLLECTION`, `SCORING`
- Mastra tools/agents/workflows: `camelCase` — `scoringTool`, `recruiterAgent`, `screeningWorkflow`
- Environment variables: `SCREAMING_SNAKE_CASE` — `OPENAI_API_KEY`, `TELEGRAM_BOT_TOKEN`
- File names: `kebab-case` — `recruiter-agent.ts`, `screening-workflow.ts`

### Structure Patterns

**Project Organization:**

- Tests: co-located as `*.test.ts` next to the file under test
- Shared types (3+ consumers): `src/types/`
- Mastra tools: one tool per file in `src/mastra/tools/`
- No barrel `index.ts` re-exports unless explicitly needed

**Import Order:**

1. External packages (`grammy`, `@mastra/core`)
2. Internal absolute imports (`src/config/env`)
3. Relative imports (`./scoring-tool`)

### Format Patterns

**Mastra Tool Return Format** — every tool MUST return:

```typescript
// Success
{ success: true, data: T }
// Failure
{ success: false, error: string }
```

Never `throw` inside a Mastra tool — return `{ success: false, error }` instead.

**Telegram Message Format:**

- Never send an empty message
- Every response ends with a clear next-action hint or question
- Rejection messages always include re-entry instructions (FR22)

**Date/Time:** ISO 8601 strings in DB — `2026-03-28T10:00:00.000Z`

**JSON field naming:**

- Mastra tool inputs/outputs: `camelCase`
- Google Sheets row data: `snake_case` matching spreadsheet column headers
- Language codes: `'id'` or `'en'` (lowercase ISO 639-1)

### Error Handling Patterns

**Rule: Bot never goes silent.** Every error path MUST produce either a user-facing message or recruiter escalation.

**Error Hierarchy:**

```text
OpenAI error           → escalate to recruiter (notifyTool)
Google Sheets error    → queue + retry (3 attempts, 5s backoff) → then notify recruiter
File upload error      → inform candidate, prompt retry
Unhandled/unknown      → Pino error log (with chat_id) + escalate to recruiter
```

**Pino Log Levels:**

- `logger.debug` — dev-only tracing (disabled in prod)
- `logger.info` — FSM transitions, Sheets writes, session start/end
- `logger.warn` — retry attempts, fallbacks triggered
- `logger.error` — unrecoverable errors (always include `err` object and `chat_id`)

**Structured Log Context** — every log call inside a session MUST include `chat_id`:

```typescript
logger.info({ chat_id, step: 'DATA_COLLECTION', event: 'field_collected', field: 'name' })
```

### FSM State Patterns

**Canonical FSM States:**

```text
GREETING → LANGUAGE_SELECT → CANDIDATE_ASKING → CONFIRMATION
→ DATA_COLLECTION → SCORING → OUTCOME
  └─ PASS → POST_TEST
  └─ FAIL → REJECTED
  └─ ESCALATED
```

**State Rules:**

- State stored in Mastra memory under key `fsmState`
- Transitions only through Mastra workflow steps — never mutate directly
- Invalid transitions: log `warn` + escalate to recruiter

### Enforcement Guidelines

**All AI agents MUST:**

- Use `snake_case` for all PostgreSQL identifiers
- Use `camelCase` for all TypeScript identifiers
- Return `{ success, data?, error? }` from every Mastra tool
- Include `chat_id` in every Pino log call inside a session
- Never send an empty Telegram message
- Use canonical FSM state strings from the list above
- Validate all env vars at startup via Zod in `src/config/env.ts`
- Never hardcode secrets — always use `Bun.env.VAR_NAME`

**Anti-Patterns:**

- `throw` inside a Mastra tool
- Calling Google Sheets API synchronously in a message handler
- Storing candidate files outside `uploads/<chat_id>/`
- Silent catch blocks — `catch (e) {}` — always log + escalate

## Project Structure & Boundaries

### Complete Project Directory Structure

```text
recruiter-ai/
├── src/
│   ├── index.ts                        # Entry point — starts grammy bot (webhook/polling)
│   ├── bot/
│   │   ├── index.ts                    # grammy bot setup + webhook handler (FR1, FR34)
│   │   ├── commands/
│   │   │   └── start.ts                # /start command — greeting + language prompt (FR1–FR2)
│   │   └── middleware/
│   │       ├── language.ts             # Language detection + session language set (FR3)
│   │       └── session.ts              # Session init + Mastra memory bootstrap (FR34–FR35)
│   ├── mastra/
│   │   ├── index.ts                    # Mastra instance — registers all tools, agents, workflows
│   │   ├── agents/
│   │   │   └── recruiter-agent.ts      # Recruiter AI agent — RAG + memory (FR6–FR12)
│   │   ├── workflows/
│   │   │   └── screening-workflow.ts   # Candidate screening FSM: GREETING→OUTCOME (FR13–FR23)
│   │   ├── tools/
│   │   │   ├── scoring-tool.ts         # Candidate match scoring: age/edu/SIM (FR19–FR20)
│   │   │   ├── sheets-tool.ts          # Google Sheets CRUD + async write queue (FR28–FR33)
│   │   │   ├── notify-tool.ts          # Recruiter Telegram DM notification (FR21, FR28–FR29)
│   │   │   └── files-tool.ts           # File upload validation + storage (FR15–FR17, FR35)
│   │   └── rag/
│   │       └── knowledge.ts            # Job knowledge base — pgvector config + query (FR6–FR12, FR24–FR27)
│   ├── db/
│   │   ├── client.ts                   # PostgreSQL connection pool (pgvector-enabled)
│   │   └── migrations/
│   │       └── 001_init.sql            # Schema: candidate_sessions, job_embeddings tables
│   ├── config/
│   │   └── env.ts                      # Zod-validated env schema + typed Bun.env exports
│   └── types/
│       ├── candidate.ts                # CandidateData, FsmState enum, ApplicationRecord
│       ├── job.ts                      # JobRecord (matches knowledge base CSV schema)
│       └── sheets.ts                   # SheetsRow types: partial, full, rejected, final
├── knowledge/
│   ├── jobs.csv                        # Source job data for RAG ingestion (FR24–FR27)
│   └── ingest.ts                       # Ingestion script: CSV → embeddings → pgvector
├── uploads/                            # Candidate file storage, scoped by chat_id (FR15–FR17, FR35)
│   └── .gitkeep
├── scripts/
│   └── seed-knowledge.ts               # Runs ingest.ts — seeds/re-seeds knowledge base
├── .env                                # Secrets (gitignored)
├── .env.example                        # Required env var template
├── .gitignore
├── tsconfig.json
├── package.json
└── docker-compose.yml                  # PostgreSQL 16 + pgvector local dev setup
```

### Requirements to Structure Mapping

| FR Category | FRs | Primary Location |
| --- | --- | --- |
| Conversation & Onboarding | FR1–FR5 | `src/bot/commands/`, `src/bot/middleware/` |
| Job Discovery & Q&A | FR6–FR12 | `src/mastra/agents/recruiter-agent.ts`, `src/mastra/rag/knowledge.ts` |
| Candidate Application | FR13–FR18 | `src/mastra/workflows/screening-workflow.ts`, `src/mastra/tools/files-tool.ts` |
| Candidate Screening & Outcome | FR19–FR23 | `src/mastra/workflows/screening-workflow.ts`, `src/mastra/tools/scoring-tool.ts` |
| Knowledge Base Management | FR24–FR27 | `knowledge/`, `knowledge/ingest.ts`, `scripts/seed-knowledge.ts` |
| Recruiter Operations | FR28–FR33 | `src/mastra/tools/notify-tool.ts`, `src/mastra/tools/sheets-tool.ts` |
| Data & Session Management | FR34–FR35 | `src/db/`, `src/bot/middleware/session.ts`, `uploads/` |

### Architectural Boundaries

#### Boundary 1: Bot layer → Mastra layer

- `src/bot/` owns the Telegram transport layer only — message receipt and response sending
- `src/bot/` calls Mastra agent or workflow per message; never implements business logic directly
- Language context and `chat_id` passed as Mastra thread identifiers

#### Boundary 2: Mastra agent vs workflow

- `recruiter-agent.ts` handles free-form Q&A (RAG) — stateless per query
- `screening-workflow.ts` handles the linear candidate journey (FSM) — stateful via Mastra memory
- Bot routes to agent when FSM state is `CANDIDATE_ASKING`, to workflow for all other states

#### Boundary 3: Mastra tools → External services

- `sheets-tool.ts` owns all Google Sheets API calls — async queue with retry, never called directly from workflow
- `notify-tool.ts` owns all recruiter Telegram DM calls — fire-and-forget with error log
- `files-tool.ts` owns file validation and `uploads/<chat_id>/` path scoping

#### Boundary 4: Knowledge base ingestion vs live RAG

- `knowledge/ingest.ts` is a one-time/admin script — not imported by the bot process
- `src/mastra/rag/knowledge.ts` queries the already-indexed pgvector data at runtime
- Re-indexing (FR26–FR27) runs via `scripts/seed-knowledge.ts` without restarting the bot

### Integration Points

**Data Flow — Candidate Q&A:**

```text
Telegram message (candidate)
  → grammy (src/bot/index.ts)
  → recruiter-agent (RAG: pgvector similarity search → OpenAI GPT-4o)
  → Telegram reply (≤5s)
```

**Data Flow — Candidate Application:**

```text
Telegram message (candidate)
  → grammy
  → screening-workflow (FSM step via Mastra memory)
    → scoring-tool (match score calculation)
    → sheets-tool (async partial save → Google Sheets)
    → [pass] post-test link sent OR notify-tool (escalation)
    → [fail] rejection message + sheets-tool (rejected row)
  → Telegram reply (≤3s)
```

**External Service Integration Points:**

| Service | Tool | Pattern |
| --- | --- | --- |
| OpenAI API | Mastra built-in (recruiter-agent) | Sync call, ≤5s timeout, escalate on error |
| Google Sheets API | `sheets-tool.ts` | Async queue, 3 retries, 5s backoff |
| Telegram Bot API | grammy + `notify-tool.ts` | Webhook receive; sync send; fire-and-forget for recruiter notify |
| PostgreSQL (pgvector) | `src/db/client.ts` | Shared connection pool; Mastra reads directly |

### Development Workflow

**Local development:**

```bash
docker-compose up -d                    # Start PostgreSQL + pgvector
bun run scripts/seed-knowledge.ts       # Seed job knowledge base
bun run src/index.ts                    # Start bot in polling mode
```

**Production (own VPS):**

```bash
# Bot runs as systemd service, webhook on https://<vps-domain>/webhook
# PostgreSQL runs on same VPS, accessed via localhost
# Logs: stdout → systemd journal (journalctl -u recruiter-ai)
```

## Architecture Validation Results

### Coherence Validation

**Decision Compatibility:**

All technology choices are compatible and mutually reinforcing:

- Bun.js + TypeScript — native pairing, no config friction
- Mastra v1.0 (pure TypeScript, no native C++ addons) — confirmed Bun-compatible
- grammy — TypeScript-first, runs on Bun without modification
- pgvector (PostgreSQL 16) — Mastra has native pgvector integration; no ORM layer needed
- OpenAI GPT-4o + text-embedding-3-small — both via Mastra's built-in AI SDK; single client
- Google Sheets API (`googleapis`) — standard npm package, Bun-compatible
- Pino + Mastra tracing — independent concerns; no conflicts
- Zod — TypeScript-native; used only at startup for env validation, no runtime overhead

No contradictory decisions found.

**Pattern Consistency:**

- `snake_case` DB columns align with PostgreSQL conventions and pgvector column naming
- `camelCase` TypeScript aligns with Mastra tool/agent/workflow naming
- `{ success, data?, error? }` tool return format is consistent with error hierarchy (no throws)
- FSM `SCREAMING_SNAKE_CASE` states align with TypeScript enum value conventions
- Pino structured log format (`{ chat_id, step, event }`) consistent across all error handling patterns

**Structure Alignment:**

- Bot layer → Mastra layer boundary is clean; no business logic leaks into `src/bot/`
- Knowledge base ingestion is fully separate from the runtime bot process (FR26–FR27 safe)
- `uploads/<chat_id>/` path scoping enforced by `files-tool.ts` boundary — file access control holds

### Requirements Coverage Validation

**Functional Requirements — All 35 FRs covered:**

| FR Category | Coverage | Location |
| --- | --- | --- |
| FR1–FR5: Onboarding | ✅ | `src/bot/commands/start.ts`, `src/bot/middleware/language.ts`, Mastra memory |
| FR6–FR12: Job Q&A | ✅ | `src/mastra/agents/recruiter-agent.ts`, `src/mastra/rag/knowledge.ts` |
| FR13–FR18: Application | ✅ | `src/mastra/workflows/screening-workflow.ts`, `src/mastra/tools/files-tool.ts` |
| FR19–FR23: Screening & Outcome | ✅ | `src/mastra/workflows/screening-workflow.ts`, `src/mastra/tools/scoring-tool.ts` |
| FR24–FR27: Knowledge Base Mgmt | ✅ | `knowledge/ingest.ts`, `scripts/seed-knowledge.ts` |
| FR28–FR33: Recruiter Operations | ✅ | `src/mastra/tools/notify-tool.ts`, `src/mastra/tools/sheets-tool.ts` |
| FR34–FR35: Data & Session | ✅ | Mastra memory (pgvector-backed = persistent), `src/db/`, `uploads/` |

**Non-Functional Requirements — All 18 NFRs addressed:**

| NFR | Requirement | Architectural Support |
| --- | --- | --- |
| Performance | ≤3s conversational, ≤5s RAG | Mastra agent timeout config; async Sheets writes |
| Concurrency | 50 concurrent sessions | Bun single process + Mastra memory (pgvector-backed) |
| Session persistence | Survive restarts | Mastra memory stored in PostgreSQL — survives process restart |
| Security | UU PDP consent recorded | FSM step records consent timestamp in Mastra session state |
| Security | File access control | `uploads/<chat_id>/` path scoping in `files-tool.ts` |
| Security | Secrets via env only | Zod-validated `.env` via `Bun.env` — never hardcoded |
| Reliability | Sheets queue + retry | Async queue, 3 retries, 5s backoff in `sheets-tool.ts` |
| Reliability | OpenAI fallback | Escalation to recruiter via `notify-tool.ts` on any OpenAI error |
| Reliability | Bot never silent | Error hierarchy ensures every path produces a response or escalation |
| Scalability | Re-indexing non-blocking | `scripts/seed-knowledge.ts` runs independently of bot process |
| Integration | HTTPS webhook + secret token | grammy `webhookCallback` with `X-Telegram-Bot-Api-Secret-Token` |
| Integration | ≤10s timeouts | Mastra agent and tool timeout configuration |

### Gap Analysis Results

**Critical Gaps:** None — all decisions needed to begin implementation are documented.

**Important Gaps (noted for implementation):**

- Test runner not explicitly named — use Bun's built-in test runner (`bun test`); tests co-located as `*.test.ts`
- `.env.example` content not enumerated in architecture — define required vars during project initialization story

**Nice-to-Have (deferred to Phase 2):**

- CI/CD pipeline (GitHub Actions → VPS deploy via SSH)
- Log aggregation (Loki + Grafana, or similar)
- Cloud file storage migration (S3-compatible bucket)

### Architecture Completeness Checklist

#### Requirements Analysis

- [x] Project context thoroughly analyzed (35 FRs, 18 NFRs)
- [x] Scale and complexity assessed (Medium-High, 50 concurrent sessions)
- [x] Technical constraints identified (Bun.js, 20MB file limit, UU PDP)
- [x] Cross-cutting concerns mapped (error handling, language, session isolation)

#### Architectural Decisions

- [x] Critical decisions documented with technology versions
- [x] Technology stack fully specified (Mastra v1.0, grammy, PostgreSQL 16, pgvector)
- [x] Integration patterns defined (webhook, Sheets queue, OpenAI fallback)
- [x] Performance and security considerations addressed

#### Implementation Patterns

- [x] Naming conventions established (snake_case DB, camelCase TS, kebab-case files)
- [x] Structure patterns defined (co-located tests, no barrel exports)
- [x] Communication patterns specified (Mastra tool return format)
- [x] Process patterns documented (error hierarchy, log levels, FSM transitions)

#### Project Structure

- [x] Complete directory structure defined with FR annotations
- [x] Component boundaries established (4 explicit boundaries)
- [x] Integration points mapped (data flow diagrams for Q&A and application paths)
- [x] Requirements to structure mapping complete (all 7 FR categories)

### Architecture Readiness Assessment

Overall Status: **READY FOR IMPLEMENTATION** — Confidence Level: **High**

#### Key Strengths

- Mastra consolidates RAG + memory + workflows — eliminates significant custom plumbing vs. manual approach
- Single PostgreSQL instance serves dual purpose (pgvector + session) — no additional infrastructure
- Clean FSM state machine prevents bot from going silent in any failure path
- Async Sheets queue isolates Google Sheets latency from candidate-facing response times

#### Areas for Future Enhancement

- CI/CD pipeline automation (Phase 2)
- Cloud file storage migration off VPS (Phase 2)
- Google Sheets → Postgres candidate record migration (Phase 2)
- Bun test suite scaffolding (early implementation)

### Implementation Handoff

#### First implementation step

```bash
bun init -y
bun add @mastra/core @mastra/rag @ai-sdk/openai
bun add grammy @grammyjs/conversations
bun add googleapis pg pino zod
bun add -d @types/pg @types/bun typescript
```

**AI agents implementing this project must:**

- Follow all architectural decisions exactly as documented
- Use implementation patterns consistently — naming, structure, error handling, logging
- Respect the 4 architectural boundaries defined in the Project Structure section
- Reference the canonical FSM state list and Mastra tool return format for every new file
