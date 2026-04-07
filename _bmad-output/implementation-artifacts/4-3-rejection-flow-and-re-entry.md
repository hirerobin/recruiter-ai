# Story 4.3: Rejection Flow & Re-Entry

Status: done

## Acceptance Criteria

1. Candidate scores <50% → polite rejection with unmet requirement explanation
2. Bot offers [Lihat lowongan lain / See other jobs] and decline option
3. Tap "See other jobs" → FSM returns to CANDIDATE_ASKING with language preserved
4. Tap "No thanks" → farewell message, session ends gracefully

## Tasks / Subtasks

- [x] Task 1: `buildFailMessage()` in `screening-workflow.ts` — bilingual, includes fail reason
- [x] Task 2: `buildFarewellMessage()` — bilingual farewell with /start hint
- [x] Task 3: Rejection InlineKeyboard (`rejection:browse`, `rejection:exit`)
- [x] Task 4: `handleRejectionBrowse()` — resets candidateData/files, returns to CANDIDATE_ASKING
- [x] Task 5: `handleRejectionExit()` — sends farewell, returns to CANDIDATE_ASKING
- [x] Task 6: Register rejection callbacks in `bot/index.ts`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### File List

- `src/mastra/workflows/screening-workflow.ts`
- `src/bot/handlers/fsm.ts`
- `src/bot/index.ts` (updated)

### Change Log

| Date | Change |
| --- | --- |
| 2026-04-02 | Implemented — rejection with re-entry offer, farewell path |
