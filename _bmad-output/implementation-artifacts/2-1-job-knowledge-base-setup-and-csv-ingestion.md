# Story 2.1: Job Knowledge Base Setup & CSV Ingestion

Status: done

## Story

As an admin,
I want a CSV-based job knowledge base that ingests into pgvector,
So that the RAG pipeline has accurate, up-to-date job data to draw from.

## Acceptance Criteria

1. Given `knowledge/jobs.csv` exists with the defined schema, when `bun run scripts/seed-knowledge.ts` is executed, then all job records are embedded using `text-embedding-3-small` and stored in `job_embeddings`

2. Given the seed script has completed, when a pgvector similarity query is run, then correct matching job records are returned

3. Given a job record is added or edited in `jobs.csv`, when the seed script is run again, then the knowledge base reflects updated data and active sessions are not interrupted (idempotent upsert via `deleteFilter`)

## Tasks / Subtasks

- [x] Task 1: Create `knowledge/jobs.csv` with 8 sample jobs covering the full schema
- [x] Task 2: Create `src/mastra/rag/knowledge.ts` — `INDEX_NAME`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSION`, `jobQueryTool`
- [x] Task 3: Create `scripts/seed-knowledge.ts` — reads CSV, validates schema, embeds chunks, upserts to pgvector
- [x] Task 4: Install `csv-parse` dependency

## Dev Notes

### Files Created

```text
knowledge/jobs.csv              ← 8 sample jobs (full schema)
src/mastra/rag/knowledge.ts     ← RAG tool config (INDEX_NAME, jobQueryTool)
scripts/seed-knowledge.ts       ← Ingestion script
```

### Index Config

- Index name: `job_embeddings`
- Dimension: 1536 (text-embedding-3-small)
- Metric: cosine
- Created on first run of seed script if not exists

### Idempotency

Each job upsert uses `deleteFilter: { judul_job, lokasi }` to atomically replace existing vectors for the same job+location before inserting new ones — running the script twice is safe and doesn't interrupt active sessions.

### Usage

```bash
bun run scripts/seed-knowledge.ts              # default knowledge/jobs.csv
bun run scripts/seed-knowledge.ts path/to.csv  # custom path
```

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- `csv-parse@6.2.1` installed as production dependency.
- Seed script validates required columns and exits with clear error if any are missing.
- `PgVector.createIndex()` is called only if the index doesn't already exist (`listIndexes()` check).
- Each CSV row is turned into an `MDocument`, chunked recursively (maxSize 1000, overlap 100), then each chunk is embedded and upserted individually.

### File List

- `knowledge/jobs.csv`
- `src/mastra/rag/knowledge.ts`
- `scripts/seed-knowledge.ts`

### Change Log

| Date | Change |
| --- | --- |
| 2026-04-02 | Story implemented — knowledge base seeded with 8 sample jobs |
