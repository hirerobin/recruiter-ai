# Story 5.4: Final Status Column & Recruiter Update Workflow

Status: done

## Acceptance Criteria

1. Spreadsheet schema includes: chat_id, name, age, education, phone, location, score, status, fail_reason, ktp_path, photo_path, cv_path, final_status, interview_notes, updated_at
2. Bot NEVER writes to `final_status` or `interview_notes` — recruiter-only fields
3. Recruiter manual entries in `final_status` preserved across bot updates (bot only updates its own columns)

## Tasks / Subtasks

- [x] Task 1: `SHEET_COLUMNS` in `sheets-tool.ts` excludes `final_status` and `interview_notes`
- [x] Task 2: `HEADER_ROW` appends them at the end so they appear in sheet but bot never writes to them
- [x] Task 3: `findRowByChatId` + range-scoped update ensures bot only overwrites its own columns (A:{n_cols})

## Dev Notes

Header row = `[...SHEET_COLUMNS, 'final_status', 'interview_notes']` — these last 2 columns are never touched by `upsertRow()` since it only writes `rowData` which maps to `SHEET_COLUMNS` only.

## Dev Agent Record

### File List

- `src/mastra/tools/sheets-tool.ts`
- `src/types/sheets.ts`

### Change Log

| Date | Change |
| --- | --- |
| 2026-04-02 | Implemented — recruiter columns protected by design |
