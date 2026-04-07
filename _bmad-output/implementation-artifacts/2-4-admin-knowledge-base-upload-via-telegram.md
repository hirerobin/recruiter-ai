# Story 2.4: Admin Knowledge Base Upload via Telegram

Status: done

## Story

As an admin,
I want to send a CSV or PDF file to the bot on Telegram to update the job knowledge base,
So that I can keep job listings current without needing server access.

## Acceptance Criteria

1. Given non-admin sends a document, the file is silently ignored

2. Given admin sends a valid CSV, bot validates schema, indexes jobs, replies "Knowledge base diperbarui — {n} pekerjaan diindeks"

3. Given admin sends a PDF, bot extracts text, chunks, embeds into pgvector, replies success

4. Given admin sends CSV with missing columns, bot replies with clear error listing missing fields

5. Given re-index triggered, active candidate sessions continue uninterrupted (upsert is atomic)

## Tasks / Subtasks

- [x] Task 1: Create `src/bot/handlers/admin-upload.ts` — handles `message:document`
- [x] Task 2: Admin check via `ADMIN_TELEGRAM_CHAT_IDS` env var (comma-separated)
- [x] Task 3: CSV path — parse, validate schema, embed, upsert (reuses seed logic inline)
- [x] Task 4: PDF path — extract text, chunk, embed, upsert
- [x] Task 5: Register `message:document` handler in `src/bot/index.ts`

## Dev Notes

### Admin Check

`ADMIN_TELEGRAM_CHAT_IDS` is a comma-separated list. Non-admin uploads are silently ignored (no reply) — no information leakage about admin functionality.

### PDF Text Extraction

MVP approach: raw UTF-8 extraction with non-ASCII characters stripped. Adequate for text-based PDFs. Binary PDFs (scanned images) will produce empty text and return an error to the admin. Full PDF parsing (pdf-parse/pdfjs) can be added in Phase 2.

### File Download

Files downloaded via `https://api.telegram.org/file/bot{TOKEN}/{file_path}` using `ctx.api.getFile()` to get the path first.

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### File List

- `src/bot/handlers/admin-upload.ts`
- `src/bot/index.ts` (updated — registers message:document handler)

### Change Log

| Date | Change |
| --- | --- |
| 2026-04-02 | Story implemented — CSV + PDF admin upload with admin role check |
