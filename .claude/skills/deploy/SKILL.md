---
name: deploy
description: Start the recruiter-ai bot (Docker + seed + run)
disable-model-invocation: true
---

# Deploy / Start Bot

Start the full recruiter-ai stack locally.

## Steps

1. Check if Docker Desktop is running, start it if not
2. Run `docker-compose up -d` to start PostgreSQL
3. Wait for the health check to pass
4. Run `bun run scripts/seed-knowledge.ts` to seed/update the knowledge base
5. Kill any existing bun processes
6. Start the bot: `bun run src/index.ts` (background)
7. Verify it started by checking logs for "bot started"
8. Report the bot status (PID, mode, webhook server URL)
