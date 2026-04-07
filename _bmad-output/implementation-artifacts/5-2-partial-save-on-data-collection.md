# Story 5.2: Partial Save on Data Collection Start

Status: done

## Acceptance Criteria

1. Candidate completes first field (name) → partial row written to Sheets with status "partial"
2. Each additional field collected → existing row updated (upsert by chat_id)
3. Candidate drops off → partial row visible with collected data

## Tasks / Subtasks

- [x] Task 1: `handleDataCollection()` calls `writeToSheets()` fire-and-forget after each field
- [x] Task 2: Upsert logic in `sheets-tool.ts` ensures no duplicate rows per chat_id

## Dev Agent Record

### File List

- `src/bot/handlers/fsm.ts`
- `src/mastra/tools/sheets-tool.ts`

### Change Log

| Date | Change |
| --- | --- |
| 2026-04-02 | Implemented — partial save on each field, upsert by chat_id |
