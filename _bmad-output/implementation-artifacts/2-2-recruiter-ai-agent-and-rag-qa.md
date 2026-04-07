# Story 2.2: Recruiter AI Agent & RAG Q&A

Status: done

## Story

As a candidate,
I want to ask free-form questions about jobs and receive accurate, grounded answers,
So that I can make an informed decision about applying.

## Acceptance Criteria

1. Given the knowledge base is seeded, when a candidate asks "ada lowongan di Palangkaraya?", then the bot returns relevant jobs from pgvector within ≤5s

2. Given a candidate asks about salary, then the response contains only information from retrieved context — no fabrication

3. Given a candidate asks in Bahasa Indonesia, then the response is in Bahasa Indonesia

4. Given OpenAI API errors, then the bot sends an apology in the candidate's language and the error is logged

## Tasks / Subtasks

- [x] Task 1: Create `src/mastra/agents/recruiter-agent.ts` — Mastra Agent with GPT-4o, jobQueryTool, notifyTool
- [x] Task 2: Register agent in `src/mastra/index.ts`
- [x] Task 3: Create `src/bot/handlers/ask.ts` — handles `message:text`, calls agent, sends reply
- [x] Task 4: Register `message:text` handler in `src/bot/index.ts`

## Dev Notes

### Agent Memory

Agent uses `memory: { thread: chatId, resource: chatId }` so each candidate has isolated conversation history stored in `mastra_threads`/`mastra_messages` via `PostgresStore`.

### Error Handling

- OpenAI error → log at `error` level with `chat_id` → reply with apology in candidate's language
- Empty agent response → fallback to apology message
- Agent always produces a reply — bot never goes silent

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### File List

- `src/mastra/agents/recruiter-agent.ts`
- `src/mastra/index.ts` (updated — registers recruiterAgent)
- `src/bot/handlers/ask.ts`
- `src/bot/index.ts` (updated — registers message:text handler)

### Change Log

| Date | Change |
| --- | --- |
| 2026-04-02 | Story implemented — recruiter agent with RAG + error handling wired to bot |
