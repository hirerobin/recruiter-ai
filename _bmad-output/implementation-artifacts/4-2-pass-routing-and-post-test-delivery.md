# Story 4.2: Pass Routing & Post-Test Delivery

Status: done

## Acceptance Criteria

1. Candidate scores ≥50% → FSM transitions to PASS, congratulations message sent
2. Pass message includes post-test link from job's `post_test` field
3. Recruiter contact info included in pass message

## Tasks / Subtasks

- [x] Task 1: `buildPassMessage()` in `screening-workflow.ts` — bilingual, includes post_test and recruiter contact
- [x] Task 2: `runScoring()` in `fsm.ts` — sets `FsmState.PASS`, writes qualified row to Sheets, sends pass message

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### File List

- `src/mastra/workflows/screening-workflow.ts`
- `src/bot/handlers/fsm.ts`

### Change Log

| Date | Change |
| --- | --- |
| 2026-04-02 | Implemented — pass routing with post-test link and recruiter contact |
