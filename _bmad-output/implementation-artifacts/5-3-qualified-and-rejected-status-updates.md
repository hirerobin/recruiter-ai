# Story 5.3: Qualified & Rejected Status Updates

Status: done

## Acceptance Criteria

1. Candidate passes → Sheets row updated: status "qualified", all fields populated, file paths recorded
2. Candidate fails → Sheets row updated: status "rejected", `fail_reason` populated
3. File paths (ktp_path, photo_path, cv_path) correctly reference `uploads/<chat_id>/` files

## Tasks / Subtasks

- [x] Task 1: `runScoring()` in `fsm.ts` calls `writeToSheets()` with final status, score, fail_reason, all file paths

## Dev Agent Record

### File List

- `src/bot/handlers/fsm.ts`

### Change Log

| Date | Change |
| --- | --- |
| 2026-04-02 | Implemented — final status update on scoring outcome |
