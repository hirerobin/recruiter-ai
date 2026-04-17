---
name: seed
description: Re-seed the job knowledge base from Google Sheets into pgvector
disable-model-invocation: true
---

# Seed Knowledge Base

Re-seed the job knowledge base from Google Sheets into pgvector.

## Steps

1. Ensure Docker is running and PostgreSQL container is up
2. Run the seed script: `bun run scripts/seed-knowledge.ts`
3. Report how many jobs were indexed

## Usage
- `/seed` — seed from Google Sheets (default)
- `/seed --csv` — seed from local CSV file
