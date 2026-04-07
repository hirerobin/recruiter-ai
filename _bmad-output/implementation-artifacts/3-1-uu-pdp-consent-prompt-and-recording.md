# Story 3.1: UU PDP Consent Prompt & Recording

Status: done

## Story

As a candidate, I want to be clearly informed about what data will be collected and why before providing any personal information, so that I can give informed consent in compliance with UU PDP.

## Acceptance Criteria

1. Given a candidate confirms intent to apply, when FSM transitions to consent step, then bilingual consent message is sent listing all data collected and the purpose
2. Given candidate taps [Saya Setuju / I Agree], then `consentRecordedAt` ISO 8601 timestamp is saved in session and FSM advances to `DATA_COLLECTION`
3. Given candidate taps [Saya Tolak / I Decline], then no personal data is collected and FSM returns to `CANDIDATE_ASKING`

## Tasks / Subtasks

- [x] Task 1: Define `buildConsentMessage()` in `screening-workflow.ts`
- [x] Task 2: Create consent InlineKeyboard (`consent:agree`, `consent:decline`)
- [x] Task 3: `handleConsentAgree` — saves timestamp, advances FSM, prompts first data field
- [x] Task 4: `handleConsentDecline` — returns to `CANDIDATE_ASKING`, clears applied job
- [x] Task 5: Register consent callbacks in `bot/index.ts`

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
| 2026-04-02 | Implemented — consent callbacks wired, timestamp saved in session |
