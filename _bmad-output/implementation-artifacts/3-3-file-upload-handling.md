# Story 3.3: File Upload Handling — KTP, Pas Photo & CV

Status: done

## Acceptance Criteria

1. Given FSM at file upload step, file type and size validated (≤20MB, correct mime type)
2. Valid KTP saved to `uploads/<chat_id>/ktp.<ext>`, confirmed within ≤5s
3. Valid Pas photo saved to `uploads/<chat_id>/photo.<ext>`
4. Valid CV saved to `uploads/<chat_id>/cv.<ext>`
5. File >20MB — informs candidate of limit and asks for re-upload
6. All 3 files uploaded → FSM transitions to SCORING

## Tasks / Subtasks

- [x] Task 1: `downloadAndSaveFile()` service in `files-tool.ts` — fetch from Telegram, write to `uploads/<chatId>/`
- [x] Task 2: `handleFileUpload()` in `fsm.ts` — handles both `message:document` and `message:photo`
- [x] Task 3: `getFilePrompt()`, `nextFileStep()` helpers in `screening-workflow.ts`
- [x] Task 4: After cv received → trigger `runScoring()`
- [x] Task 5: Register `message:document` and `message:photo` handlers in `bot/index.ts`

## Dev Notes

- `message:document` handler: admins routed to admin-upload first, then candidates for FILE_UPLOAD state
- Grammy photo messages return array of sizes — largest selected for highest quality
- Unsupported mime type returns clear error, does not save

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### File List

- `src/mastra/tools/files-tool.ts`
- `src/mastra/workflows/screening-workflow.ts`
- `src/bot/handlers/fsm.ts`
- `src/bot/index.ts` (updated)

### Change Log

| Date | Change |
| --- | --- |
| 2026-04-02 | Implemented — KTP/photo/CV upload with validation, scoped paths |
