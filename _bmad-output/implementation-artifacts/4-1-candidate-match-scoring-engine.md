# Story 4.1: Candidate Match Scoring Engine

Status: done

## Acceptance Criteria

1. Given candidate (age 24, education SMA, no SIM required), score ≥50% with correct breakdown (age 30%, edu 40%, SIM 30%)
2. Candidate without SIM C applying for SIM C job → SIM component = 0%
3. Job with no SIM → SIM weight (30%) redistributed: age 45%, edu 55%
4. Same inputs twice → identical results (deterministic)

## Tasks / Subtasks

- [x] Task 1: `scoreCandidate()` pure function in `scoring-tool.ts`
- [x] Task 2: Education rank table (`SD=1 … S3=9`)
- [x] Task 3: SIM redistribution when not required
- [x] Task 4: `failReason` string listing unmet criteria
- [x] Task 5: `scoringTool` Mastra wrapper
- [x] Task 6: 10 unit tests covering all scoring scenarios

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes

- Scoring is deterministic — no random/LLM-based decisions
- `scoreCandidate()` is a pure function — no DB/API calls
- Tests corrected: age-fail alone with no SIM scores 55% (passes) since edu=55% weight — test updated to reflect reality
- 10 scoring tests all pass

### File List

- `src/mastra/tools/scoring-tool.ts`
- `src/mastra/tools/scoring-tool.test.ts`

### Change Log

| Date | Change |
| --- | --- |
| 2026-04-02 | Implemented — deterministic scorer with SIM redistribution, 10 tests |
