# Story 2.3: AI Escalation & Recruiter Notification

Status: done

## Story

As a candidate with an unanswerable question,
I want the bot to acknowledge it can't help and immediately connect me with a human,
So that I never feel stuck or receive a wrong answer.

## Acceptance Criteria

1. Given no relevant knowledge base match, the bot sends acknowledgement and fires recruiter DM

2. Given escalation triggered, `notify-tool.ts` sends Telegram DM to `RECRUITER_TELEGRAM_CHAT_ID` with candidate chat_id, question, and direct link

3. Given escalation occurred, candidate remains in `CANDIDATE_ASKING` state (FSM not advanced)

4. Given recruiter DM fails, error is logged at Pino error level and candidate still receives acknowledgement

## Tasks / Subtasks

- [x] Task 1: Create `src/mastra/tools/notify-tool.ts` — Mastra tool using Telegram Bot API to DM the recruiter
- [x] Task 2: Register `notifyTool` in `recruiter-agent.ts` tools
- [x] Task 3: Agent instructions tell agent when to escalate (no match, out-of-scope, API error)

## Dev Notes

### Notify Tool

Uses `fetch` directly to `api.telegram.org/bot{TOKEN}/sendMessage` — no grammy dependency in tools layer.

- On success → `{ success: true }`
- On failure → `{ success: false, error: '...' }` — does NOT throw (so agent continues to send apology to candidate)

### Escalation Decision

The agent (GPT-4o) decides when to call `notifyTool` based on instructions. The recruiter-agent instructions explicitly list escalation triggers:
- No relevant job found
- Out-of-scope question
- Candidate asks for human
- API error (handled in `ask.ts` error catch)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### File List

- `src/mastra/tools/notify-tool.ts`
- `src/mastra/agents/recruiter-agent.ts` (references notifyTool in tools)

### Change Log

| Date | Change |
| --- | --- |
| 2026-04-02 | Story implemented — notify tool with Telegram DM, graceful failure logging |
