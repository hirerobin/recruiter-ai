# Recruiter AI

AI-powered recruitment Telegram bot that automates the entire candidate screening pipeline — from job discovery to interview scheduling.

Built for staffing agencies in Indonesia with bilingual support (Bahasa Indonesia / English).

## Architecture

```
Telegram (grammy)
    |
    v
+-------------------+     +------------------+     +------------------+
|   Bot Layer       |     |  Mastra AI Layer |     |  External APIs   |
|                   |     |                  |     |                  |
| - FSM Dispatcher  |---->| - Recruiter Agent|---->| - OpenAI GPT-4o  |
| - Session Mgmt    |     |   (RAG Q&A)     |     | - Telegram API   |
| - File Handler    |     | - Scoring Engine |     | - Google Sheets  |
| - Guard Middleware|     | - Job Lookup     |     | - Google Drive   |
| - Calendly Webhook|     |   (pgvector)    |     | - Calendly       |
+-------------------+     +------------------+     +------------------+
         |                        |
         v                        v
+------------------------------------------------+
|              PostgreSQL + pgvector              |
|                                                |
| - bot_sessions (grammy session persistence)    |
| - interview_bookings (slot management)         |
| - job_embeddings (RAG vector index)            |
| - mastra_threads / mastra_messages (AI memory) |
+------------------------------------------------+
```

## Candidate Flow

```
/start
  |
  v
Language Select (ID/EN)
  |
  v
Candidate Asking (RAG Q&A) <--+
  |                            |
  | "daftar" / "apply"        |
  v                            |
Consent (UU PDP)               |
  |                            |
  | agree          decline --->+
  v
Data Collection
  | name -> age -> education -> phone -> location
  v
Data Review (ya/tidak)
  |
  v
File Upload
  | KTP -> Passport Photo -> CV
  v
Scoring Engine
  |
  +---> PASS --> Interview Scheduling (Calendly)
  |                    |
  |                    v
  |              Google Sheets (interview_notes)
  |              + Telegram confirmation
  |
  +---> FAIL --> See other jobs? ---> Candidate Asking
                 No thanks? -------> Farewell
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | [Bun](https://bun.sh) v1.3+ |
| Bot Framework | [grammy](https://grammy.dev) v1.41 |
| AI Agent | [Mastra](https://mastra.ai) v1.21 + GPT-4o |
| RAG / Embeddings | pgvector + `text-embedding-3-small` |
| Database | PostgreSQL 16 (pgvector/pgvector:pg16) |
| Language | TypeScript 6 |
| Validation | Zod 4 |
| Logging | Pino |
| Google APIs | googleapis (Sheets, Drive, OAuth2) |
| Scheduling | Calendly (webhook integration) |

## Features

- **Bilingual AI Agent** — GPT-4o answers job questions grounded in a vector knowledge base (RAG). Never fabricates job details.
- **FSM-driven Screening** — 11-state finite state machine manages the entire candidate journey with session persistence across restarts.
- **Weighted Scoring Engine** — Deterministic scoring against real job requirements (age 30-45%, education 40-55%, SIM 0-30%). Threshold: 50/100.
- **File Upload + Google Drive** — KTP, passport photo, CV uploaded via Telegram, stored locally and synced to Google Drive.
- **Google Sheets Tracking** — Every candidate gets a row with 16 columns (data, score, status, file links, interview notes).
- **Calendly Integration** — Qualified candidates get a personalized booking link. Webhook writes interview date back to Sheets + sends Telegram confirmation.
- **Recruiter Escalation** — Agent auto-notifies recruiters when it can't answer a question or an error occurs.
- **Admin Knowledge Upload** — Admins can upload CSV/PDF files via Telegram to update the job knowledge base.
- **Interview Scheduler Fallback** — Built-in inline keyboard scheduler when Calendly is not configured (configurable Mon-Fri 9am-3pm WIB).

## Scoring Algorithm

| Criteria | Weight (no SIM) | Weight (SIM required) |
|----------|:---:|:---:|
| Age (within range) | 45% | 30% |
| Education (>= minimum) | 55% | 40% |
| SIM (exact match) | - | 30% |

**Pass threshold:** >= 50/100

Education ranking: SD(1) < SMP(2) < SMA/SMK(3) < D1(4) < D2(5) < D3(6) < S1(7) < S2(8) < S3(9)

## Project Structure

```
src/
  bot/
    commands/start.ts        # /start command + session reset
    handlers/
      ask.ts                 # RAG agent message handler
      fsm.ts                 # FSM dispatcher (consent, data, files, scoring)
      interview.ts           # Built-in interview scheduler
      calendly-webhook.ts    # Calendly webhook handler
      admin-upload.ts        # Admin CSV/PDF knowledge upload
    middleware/
      session.ts             # Session type + middleware factory
      guard.ts               # Require language selection guard
      language.ts            # Language callback handlers
    apply-trigger.ts         # Agent->FSM handoff shared state
    index.ts                 # Bot setup, routing, HTTP server
  config/
    env.ts                   # Zod-validated environment config
    schedule.ts              # Interview schedule configuration
  db/
    client.ts                # pg.Pool + migration runner
    session-storage.ts       # PostgreSQL session adapter for grammy
    migrations/
      001_init.sql           # pgvector + bot_sessions
      002_interview_bookings.sql
  mastra/
    agents/recruiter-agent.ts  # GPT-4o agent with tools
    rag/knowledge.ts           # Vector query tool config
    tools/
      scoring-tool.ts        # Weighted candidate scoring
      job-lookup.ts          # pgvector job requirements lookup
      apply-tool.ts          # Application trigger tool
      notify-tool.ts         # Recruiter notification
      files-tool.ts          # Telegram file download
      drive-upload.ts        # Google Drive upload (OAuth2)
      sheets-tool.ts         # Google Sheets read/write
      vision-validator.ts    # GPT-4o vision KTP/photo validation
    workflows/
      screening-workflow.ts  # FSM step builders (consent, prompts, messages)
  types/
    candidate.ts             # FsmState enum, CandidateData, FileUploads
    job.ts                   # JobRecord interface
    sheets.ts                # SheetsRow types
  index.ts                   # Entry point (initDb + startBot)
  logger.ts                  # Pino logger

scripts/
  seed-knowledge.ts          # Seed jobs.csv into pgvector
  google-auth-token.ts       # One-time OAuth2 token generator
  pg_hba.conf                # Custom PostgreSQL auth config

knowledge/
  jobs.csv                   # Job listings (12 columns)

docker-compose.yml           # PostgreSQL + pgvector
```

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.3+
- [Docker](https://www.docker.com/) (for PostgreSQL + pgvector)
- Telegram Bot Token (from [@BotFather](https://t.me/BotFather))
- OpenAI API Key

### 1. Install dependencies

```bash
bun install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your credentials
```

### 3. Start PostgreSQL

```bash
docker-compose up -d
```

### 4. Seed the knowledge base

```bash
bun run scripts/seed-knowledge.ts
```

### 5. Start the bot

```bash
bun run src/index.ts
```

The bot starts in **polling mode** (local dev) with an HTTP server on port 3000 for Calendly webhooks.

## Environment Variables

| Variable | Required | Description |
|----------|:--------:|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | Bot token from @BotFather |
| `ADMIN_TELEGRAM_CHAT_IDS` | Yes | Comma-separated admin chat IDs |
| `RECRUITER_TELEGRAM_CHAT_ID` | Yes | Chat ID for recruiter notifications |
| `OPENAI_API_KEY` | Yes | OpenAI API key (GPT-4o + embeddings) |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Yes | Google service account email |
| `GOOGLE_PRIVATE_KEY` | Yes | Service account private key |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | Yes | Target spreadsheet ID |
| `GOOGLE_SHEETS_SHEET_NAME` | No | Sheet tab name (default: "Sheet1") |
| `GOOGLE_DRIVE_FOLDER_ID` | No | Google Drive folder for uploads |
| `GOOGLE_OAUTH_CLIENT_ID` | No | OAuth2 client ID (for Drive) |
| `GOOGLE_OAUTH_CLIENT_SECRET` | No | OAuth2 client secret |
| `GOOGLE_DRIVE_REFRESH_TOKEN` | No | OAuth2 refresh token |
| `CALENDLY_URL` | No | Calendly event link |
| `CALENDLY_WEBHOOK_SIGNING_KEY` | No | Webhook verification key |
| `TELEGRAM_WEBHOOK_URL` | No | HTTPS URL for webhook mode |
| `TELEGRAM_WEBHOOK_SECRET` | No | Webhook verification secret |

## Google Sheets Schema

| Column | Description |
|--------|-------------|
| chat_id | Telegram chat ID |
| name | Candidate full name |
| age | Candidate age |
| education | Education level (SMA, S1, etc.) |
| phone | Phone number |
| location | City/area |
| applied_job | Job title applied for |
| score | Screening score (0-100) |
| status | partial / qualified / rejected |
| fail_reason | Why candidate failed (if applicable) |
| ktp_path | KTP file path or Drive URL |
| photo_path | Photo file path or Drive URL |
| cv_path | CV file path or Drive URL |
| updated_at | Last update timestamp |
| final_status | Manual recruiter status |
| interview_notes | Interview date from Calendly |

## Knowledge Base (jobs.csv)

Each row represents a job listing with these columns:

| Column | Example |
|--------|---------|
| judul_job | Driver Ekspedisi |
| lokasi | Palangkaraya |
| deskripsi | Mengantarkan barang... |
| client | PT Logistik Nusantara |
| requirement.age | 25-40 |
| requirement.jenis_sim | B1 |
| requirement.pendidikan | SMA |
| role | Driver |
| benefit | Gaji Rp 3.500.000 + ... |
| post_test | https://forms.example.com/... |
| recruiter_name | Sari Dewi |
| recruitment_number | +6281234567890 |

## Testing

```bash
bun test
```

55 tests across 7 files covering scoring engine, screening workflow, session storage, bot handlers, and environment validation.

## Deployment

For production, set `TELEGRAM_WEBHOOK_URL` to your HTTPS URL and the bot will switch from polling to webhook mode automatically. The HTTP server on port 3000 handles both Telegram webhooks and Calendly webhooks.

```bash
# Example: deploy with pm2
pm2 start bun -- run src/index.ts --name recruiter-ai
```

## License

MIT
