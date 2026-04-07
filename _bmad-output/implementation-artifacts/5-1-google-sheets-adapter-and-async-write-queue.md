# Story 5.1: Google Sheets Adapter & Async Write Queue

Status: done

## Acceptance Criteria

1. Valid service account credentials → authenticates via JWT with least-privilege scope
2. Sheets write doesn't block the candidate's conversation (fire-and-forget)
3. API error → retry up to 3 times with 5s×attempt backoff
4. All retries fail → Pino error log with `chat_id`

## Tasks / Subtasks

- [x] Task 1: `writeToSheets()` service function in `sheets-tool.ts` — JWT auth, upsert by chat_id
- [x] Task 2: `ensureHeader()` — creates header row on first write
- [x] Task 3: `findRowByChatId()` — finds existing row for upsert
- [x] Task 4: Retry loop (3 attempts, 5s×n backoff) in `upsertRow()`
- [x] Task 5: `sheetsTool` Mastra wrapper with fire-and-forget pattern
- [x] Task 6: Add Google Sheets env vars to `env.ts` and `.env.example`

## Dev Notes

- `final_status` and `interview_notes` columns are appended to header but NEVER written by bot — recruiter-only fields
- `GOOGLE_SHEETS_SHEET_NAME` defaults to `'Candidates'` if not set
- Bot only writes to columns defined in `SHEET_COLUMNS` — recruiter manual columns are safe from bot overwrites

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### File List

- `src/mastra/tools/sheets-tool.ts`
- `src/types/sheets.ts`
- `src/config/env.ts` (updated — 4 new Google Sheets vars)
- `.env.example` (updated)
- `.env` (updated)
- `src/config/env.test.ts` (updated)

### Change Log

| Date | Change |
| --- | --- |
| 2026-04-02 | Implemented — JWT auth, upsert by chat_id, retry queue, recruiter columns protected |
