# Story 3.2: Application Confirmation & Conversational Data Collection

Status: done

## Story

As a candidate, I want to confirm the job I'm applying for and provide my personal details through natural conversation, so that applying feels like chatting, not filling out a form.

## Acceptance Criteria

1. Given candidate expresses intent to apply, FSM confirms the specific job
2. Given consent recorded and FSM in DATA_COLLECTION, bot collects 5 fields sequentially
3. Given bot asks for age and candidate gives non-numeric response, bot re-prompts with validation error
4. Given all 5 fields collected, bot displays review and candidate can confirm or correct

## Tasks / Subtasks

- [x] Task 1: `DATA_COLLECTION_FIELDS` sequence in `candidate.ts` types
- [x] Task 2: `validateField()`, `applyField()`, `nextField()` helpers in `screening-workflow.ts`
- [x] Task 3: `handleDataCollection()` in `fsm.ts` — validates, applies, saves partial to Sheets, prompts next field
- [x] Task 4: `buildDataReview()` shown when all fields collected
- [x] Task 5: `handleDataReviewReply()` — yes/no routing to FILE_UPLOAD or restart
- [x] Task 6: Partial Sheets write on each field via `writeToSheets()` (fire-and-forget)

## Dev Notes

- Age validation: `parseInt()` — NaN or outside 14–99 triggers re-prompt
- Review uses positive word matching (ya/yes/iya/ok) for flexibility
- On correction: resets `currentField` to start and clears `candidateData`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### File List

- `src/types/candidate.ts`
- `src/mastra/workflows/screening-workflow.ts`
- `src/bot/handlers/fsm.ts`
- `src/mastra/tools/sheets-tool.ts`

### Change Log

| Date | Change |
| --- | --- |
| 2026-04-02 | Implemented — 5-field sequential collection with partial Sheets saves |
