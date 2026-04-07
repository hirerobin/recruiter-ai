---
stepsCompleted: ['step-01-validate', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
status: 'complete'
completedAt: '2026-04-02'
inputDocuments: ['prd.md', 'architecture.md']
workflowType: 'epics-and-stories'
project_name: 'recruiter-ai'
---

# recruiter-ai - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for recruiter-ai, decomposing the requirements from the PRD and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: A candidate can initiate a conversation with the bot via Telegram
FR2: A candidate can select their preferred language (Bahasa Indonesia or English) at the start of a session
FR3: A candidate can receive a greeting message that explains what the bot does
FR4: A candidate can resume an interrupted session without restarting from scratch
FR5: A candidate can receive explicit notification of what personal data will be collected and why, and provide consent before any data is gathered
FR6: A candidate can ask free-form questions about available jobs in natural language
FR7: A candidate can ask about job requirements (age, education, license, location) and receive accurate answers
FR8: A candidate can ask about compensation and benefits for a specific job and receive accurate answers
FR9: A candidate can request a list of all available jobs
FR10: A candidate can filter or ask about jobs available in a specific area
FR11: A candidate can receive answers grounded only in the job knowledge base (no fabricated details)
FR12: A candidate whose question cannot be answered by the AI can be escalated to a human recruiter without leaving the chat
FR13: A candidate can confirm their intent to apply for a specific job
FR14: A candidate can provide their personal data (name, age, education level, phone number, location) through conversational prompts
FR15: A candidate can upload their KTP document as a file attachment within the Telegram chat
FR16: A candidate can upload their Pas photo as a file attachment within the Telegram chat
FR17: A candidate can upload their CV as a file attachment within the Telegram chat
FR18: A candidate can receive confirmation that each uploaded file was received successfully
FR19: The system can calculate a match score for a candidate against a specific job's requirements
FR20: A candidate who meets the minimum match threshold can be automatically advanced to the next recruitment stage
FR21: A candidate who does not meet the minimum match threshold can receive an automated, polite rejection message explaining why
FR22: A rejected candidate can be offered the option to browse other available jobs
FR23: A candidate who passes screening can receive next-step instructions (e.g. post-test link)
FR24: An admin can add a new job listing to the knowledge base without modifying code
FR25: An admin can edit an existing job listing's details (requirements, salary, description) without modifying code
FR26: An admin can remove a job listing from the knowledge base without modifying code
FR27: The system can re-index the knowledge base automatically when job data changes
FR28: A recruiter can receive a Telegram notification when the AI cannot handle a candidate's query
FR29: A recruiter can view all candidate records (name, age, education, phone, location, status, file references) in Google Sheets
FR30: The system can save candidate data to Google Sheets as a partial record when data collection begins
FR31: The system can update a candidate's Google Sheets record to "qualified" with full data when they pass screening
FR32: The system can update a candidate's Google Sheets record to "rejected" when they fail screening
FR33: A recruiter can manually update a candidate's record in Google Sheets after interview completion
FR34: The system can persist a candidate's conversation state so sessions survive bot restarts or connection drops
FR35: Uploaded candidate files can be stored securely and accessed only by authorized recruiters
FR36: An authorized admin can send a knowledge base file (CSV or PDF) directly to the bot via Telegram to update job listings without modifying server files
FR37: The system must verify the sender is an authorized admin (via configured admin Telegram chat ID) before processing any knowledge base file upload

### NonFunctional Requirements

NFR1: Bot must respond to standard conversational messages within ≤3 seconds under normal load
NFR2: RAG pipeline (embedding lookup + GPT-4o generation) must complete within ≤5 seconds per query
NFR3: Google Sheets write operations must complete within ≤3 seconds without blocking the conversation flow
NFR4: File upload acknowledgement must be sent to the candidate within ≤5 seconds of receiving the file
NFR5: All candidate personal data must be stored in a system accessible only to authorized recruiters
NFR6: Uploaded files (KTP, Pas photo, CV) must be stored with access controls — not publicly accessible via URL
NFR7: All API credentials must be stored as environment variables — never hardcoded or committed to version control
NFR8: Candidate consent must be recorded before any personal data is collected (UU PDP compliance)
NFR9: The system must not request or store passwords, payment information, or any data beyond what is required for recruitment screening
NFR10: The system must support at least 50 concurrent candidate sessions without response time degradation (MVP baseline)
NFR11: Knowledge base re-indexing must not block active candidate sessions
NFR12: The architecture must support future migration from Google Sheets to Postgres without a full application rewrite
NFR13: Conversation session state must be persisted so no candidate loses progress due to a bot restart or network interruption
NFR14: If the Google Sheets API is unavailable, the system must queue the write and retry — candidate data must not be silently lost
NFR15: If the OpenAI API is unavailable, the bot must notify the candidate and escalate to a recruiter rather than returning an empty or error response
NFR16: Google Sheets integration must use a service account with least-privilege access (write to candidate sheet only)
NFR17: Telegram webhook must be configured with HTTPS and a secret token to prevent unauthorized message injection
NFR18: All external API calls (OpenAI, Google, Telegram) must have a timeout of ≤10 seconds with graceful error handling

### Additional Requirements

- Project initialization: `bun init -y` + install all dependencies before any implementation stories
- PostgreSQL 16 + pgvector Docker container must be running before Mastra can initialize
- Mastra instance (`src/mastra/index.ts`) must be configured and connected before agents/workflows can operate
- `.env` and `.env.example` must be created with all required vars; validated by Zod at startup
- Knowledge base (`knowledge/jobs.csv`) must be seeded via `scripts/seed-knowledge.ts` before RAG queries work
- VPS deployment: systemd service or Docker for process management; Let's Encrypt TLS for webhook endpoint
- Pino logger must be initialized at application startup before any module logs
- `docker-compose.yml` required for local PostgreSQL + pgvector dev environment

### UX Design Requirements

N/A — recruiter-ai is a backend-only service. All user interaction is via Telegram; no web frontend or design system required.

### FR Coverage Map

| FR | Epic | Description |
| --- | --- | --- |
| FR1 | Epic 1 | Telegram bot entry point |
| FR2 | Epic 1 | Language selection |
| FR3 | Epic 1 | Greeting message |
| FR4 | Epic 1 | Session resume |
| FR34 | Epic 1 | Session persistence across restarts |
| FR6 | Epic 2 | Free-form job questions |
| FR7 | Epic 2 | Job requirements Q&A |
| FR8 | Epic 2 | Compensation/benefits Q&A |
| FR9 | Epic 2 | List all available jobs |
| FR10 | Epic 2 | Filter jobs by area |
| FR11 | Epic 2 | RAG-grounded answers only |
| FR12 | Epic 2 | AI escalation to recruiter |
| FR24 | Epic 2 | Admin adds job listing |
| FR25 | Epic 2 | Admin edits job listing |
| FR26 | Epic 2 | Admin removes job listing |
| FR27 | Epic 2 | Auto re-index on data change |
| FR28 | Epic 2 | Recruiter Telegram notification on escalation |
| FR36 | Epic 2 | Admin uploads CSV/PDF via Telegram to update knowledge base |
| FR37 | Epic 2 | Admin role verification before processing knowledge uploads |
| FR5 | Epic 3 | UU PDP consent prompt |
| FR13 | Epic 3 | Candidate confirms intent to apply |
| FR14 | Epic 3 | Personal data collection via conversation |
| FR15 | Epic 3 | KTP upload |
| FR16 | Epic 3 | Pas photo upload |
| FR17 | Epic 3 | CV upload |
| FR18 | Epic 3 | File receipt confirmation |
| FR35 | Epic 3 | Secure file storage |
| FR19 | Epic 4 | Match score calculation |
| FR20 | Epic 4 | Pass routing → next stage |
| FR21 | Epic 4 | Rejection message |
| FR22 | Epic 4 | Re-entry to job listing after rejection |
| FR23 | Epic 4 | Post-test link delivery |
| FR29 | Epic 5 | Recruiter views candidates in Sheets |
| FR30 | Epic 5 | Partial save on data collection start |
| FR31 | Epic 5 | Full save on pass |
| FR32 | Epic 5 | Rejected status on fail |
| FR33 | Epic 5 | Recruiter manual update after interview |

## Epic List

### Epic 1: Project Foundation & Bot Infrastructure

The bot is live on Telegram, greets candidates, handles language selection, and persists sessions across restarts. All infrastructure (PostgreSQL + pgvector, Mastra instance, env config, Pino logger) is initialized and running.

**FRs covered:** FR1, FR2, FR3, FR4, FR34
**Additional reqs:** bun init, dependencies, docker-compose, Mastra setup, Zod env validation, HTTPS webhook, systemd/VPS

---

### Epic 2: Job Discovery, RAG Q&A & Knowledge Base

Candidates can ask free-form questions about jobs and get accurate, grounded answers. Admins can upload a CSV or PDF via Telegram to update the job knowledge base — re-indexing happens automatically. Questions the AI can't answer trigger an immediate recruiter Telegram notification.

**FRs covered:** FR6, FR7, FR8, FR9, FR10, FR11, FR12, FR24, FR25, FR26, FR27, FR28, FR36, FR37

---

### Epic 3: Candidate Application & Data Collection

Candidates can confirm intent to apply, provide UU PDP consent, submit personal data through conversation, and upload KTP, Pas photo, and CV — all within Telegram. Files are stored securely, scoped by candidate.

**FRs covered:** FR5, FR13, FR14, FR15, FR16, FR17, FR18, FR35

---

### Epic 4: Candidate Screening & Outcome Routing

The scoring engine evaluates candidates against job requirements and routes them to the correct outcome: advancement with next steps, polite rejection with re-entry offer, or post-test link delivery.

**FRs covered:** FR19, FR20, FR21, FR22, FR23

---

### Epic 5: Candidate Tracking & Recruiter Operations

All candidate records land in Google Sheets in real time — partial save on data entry, qualified on pass, rejected on fail. Recruiters have full pipeline visibility and can manually update records after interviews.

**FRs covered:** FR29, FR30, FR31, FR32, FR33

---

## Epic 1: Project Foundation & Bot Infrastructure — Stories

The bot is live on Telegram, greets candidates, handles language selection, and persists sessions across restarts. All infrastructure (PostgreSQL + pgvector, Mastra instance, env config, Pino logger) is initialized and running.

### Story 1.1: Project Initialization & Local Dev Environment

As a developer,
I want a fully initialized project with all dependencies, TypeScript config, and a local PostgreSQL+pgvector database running,
So that I can start building features immediately with a consistent environment.

**Acceptance Criteria:**

**Given** a clean working directory
**When** I run `bun install` and `docker-compose up -d`
**Then** all dependencies are installed without errors
**And** PostgreSQL 16 with pgvector is accessible at `localhost:5432`

**Given** the project is initialized
**When** I run `bun run src/index.ts`
**Then** the application starts without errors
**And** Pino logs a startup message to stdout

**Given** `.env.example` exists
**When** a developer copies it to `.env` and fills in values
**Then** all required environment variables are documented with descriptions

### Story 1.2: Database Schema & Mastra Instance

As a developer,
I want the PostgreSQL schema migrated and the Mastra instance connected to pgvector,
So that session memory and vector embeddings are ready to use.

**Acceptance Criteria:**

**Given** PostgreSQL is running with pgvector
**When** the migration script runs (`001_init.sql`)
**Then** `candidate_sessions` and `job_embeddings` tables are created
**And** the `vector` extension is enabled

**Given** the Mastra instance is configured in `src/mastra/index.ts`
**When** the app starts
**Then** Mastra connects to pgvector without errors
**And** a Pino info log confirms the connection

### Story 1.3: Telegram Bot Entry Point & Language Selection

As a candidate,
I want to start the bot with `/start` and choose my language,
So that all subsequent messages are in my preferred language.

**Acceptance Criteria:**

**Given** a candidate sends `/start` to the bot
**When** the bot receives the message
**Then** the bot replies with a greeting explaining what the bot does
**And** presents two language options: [Bahasa Indonesia] [English]

**Given** a candidate selects Bahasa Indonesia
**When** the language is selected
**Then** the bot confirms selection in Bahasa Indonesia
**And** the language preference is stored in the candidate's Mastra session

**Given** a candidate selects English
**When** the language is selected
**Then** the bot confirms selection in English
**And** subsequent bot messages use English

**Given** the bot is deployed on a VPS in webhook mode
**When** a webhook request arrives with an invalid or missing secret token
**Then** the request is rejected with 403 and not processed

### Story 1.4: Session Persistence & Resume

As a candidate,
I want my conversation to resume exactly where I left off if the bot restarts or I return later,
So that I never lose my progress mid-application.

**Acceptance Criteria:**

**Given** a candidate has completed language selection
**When** the bot process restarts
**Then** the candidate's session state (language, FSM step) is preserved in PostgreSQL

**Given** a candidate returns to the bot after an interruption
**When** they send any message
**Then** the bot retrieves their session and continues from the last FSM state
**And** does not prompt for language selection again

**Given** a candidate has no existing session
**When** they send any message other than `/start`
**Then** the bot redirects them to `/start` to begin a new session

---

## Epic 2: Job Discovery, RAG Q&A & Knowledge Base — Stories

Candidates can ask free-form questions about jobs and get accurate, grounded answers. Admins can upload a CSV or PDF via Telegram to update the job knowledge base — re-indexing happens automatically. Questions the AI can't answer trigger an immediate recruiter Telegram notification.

### Story 2.1: Job Knowledge Base Setup & CSV Ingestion

As an admin,
I want a CSV-based job knowledge base that ingests into pgvector,
So that the RAG pipeline has accurate, up-to-date job data to draw from.

**Acceptance Criteria:**

**Given** `knowledge/jobs.csv` exists with the defined schema (judul_job, lokasi, deskripsi, client, requirement.age, requirement.jenis_sim, requirement.pendidikan, role, benefit, post_test, recruiter_name, recruitment_number)
**When** `bun run scripts/seed-knowledge.ts` is executed
**Then** all job records are embedded using `text-embedding-3-small` and stored in `job_embeddings`

**Given** the seed script has completed
**When** a pgvector similarity query is run against "warehouse job Palangkaraya"
**Then** the correct matching job records are returned

**Given** a job record is added or edited in `jobs.csv`
**When** the seed script is run again
**Then** the knowledge base reflects the updated data
**And** active candidate sessions are not interrupted

### Story 2.2: Recruiter AI Agent & RAG Q&A

As a candidate,
I want to ask free-form questions about jobs and receive accurate, grounded answers,
So that I can make an informed decision about applying without speaking to a recruiter.

**Acceptance Criteria:**

**Given** the knowledge base is seeded and the bot is in `CANDIDATE_ASKING` state
**When** a candidate asks "ada lowongan di Palangkaraya?"
**Then** the bot returns relevant jobs from pgvector within ≤5 seconds

**Given** a candidate asks about salary ("gajinya berapa?")
**When** the RAG agent generates a response
**Then** the response contains only information from retrieved knowledge base context
**And** no job details are fabricated

**Given** a candidate asks in Bahasa Indonesia
**When** the agent generates a response
**Then** the response is in Bahasa Indonesia

**Given** the OpenAI API returns an error or times out
**When** the agent call fails
**Then** the bot sends an apology message in the candidate's language and triggers recruiter escalation

### Story 2.3: AI Escalation & Recruiter Notification

As a candidate with an unanswerable question,
I want the bot to acknowledge it can't help and immediately connect me with a human,
So that I never feel stuck or receive a wrong answer.

**Acceptance Criteria:**

**Given** a candidate asks a question with no relevant knowledge base match
**When** the RAG pipeline confidence is below threshold
**Then** the bot sends a bilingual message: "This question needs our team's attention. I've notified them."

**Given** an escalation is triggered
**When** the candidate receives the acknowledgement
**Then** `notify-tool.ts` fires a Telegram DM to `RECRUITER_TELEGRAM_CHAT_ID` with: candidate chat_id, the original question, and a direct Telegram link to the candidate

**Given** an escalation has occurred
**When** the candidate sends their next message
**Then** the FSM remains in `CANDIDATE_ASKING` state

**Given** the recruiter notification DM fails
**When** the Telegram send errors
**Then** the failure is logged at Pino error level
**And** the candidate still receives the acknowledgement message

### Story 2.4: Admin Knowledge Base Upload via Telegram

As an admin,
I want to send a CSV or PDF file to the bot on Telegram to update the job knowledge base,
So that I can keep job listings current without needing server access.

**Acceptance Criteria:**

**Given** any user sends a document file to the bot
**When** the sender's `chat_id` does NOT match any ID in `ADMIN_TELEGRAM_CHAT_IDS`
**Then** the file is silently ignored

**Given** an authorized admin sends a CSV file to the bot
**When** the file is received and parsed
**Then** the bot validates the schema, seeds pgvector, and replies "Knowledge base updated — {n} jobs indexed"

**Given** an authorized admin sends a PDF file
**When** the file is received
**Then** the bot extracts text, chunks it, embeds it into pgvector, and replies with a success confirmation

**Given** an admin uploads a CSV with missing or invalid columns
**When** validation fails
**Then** the bot replies to the admin with a clear error message listing the missing fields

**Given** a knowledge base re-index is triggered by an admin upload
**When** active candidate sessions exist
**Then** those sessions continue without interruption

---

## Epic 3: Candidate Application & Data Collection — Stories

Candidates can confirm intent to apply, provide UU PDP consent, submit personal data through conversation, and upload KTP, Pas photo, and CV — all within Telegram. Files are stored securely, scoped by candidate.

### Story 3.1: UU PDP Consent Prompt & Recording

As a candidate,
I want to be clearly informed about what data will be collected and why before providing any personal information,
So that I can give informed consent in compliance with UU PDP.

**Acceptance Criteria:**

**Given** a candidate confirms intent to apply
**When** the FSM transitions to the consent step
**Then** the bot sends a bilingual consent message listing: name, age, education, phone number, location, KTP, Pas photo, CV — and the purpose (recruitment screening only)

**Given** the consent message is shown
**When** the candidate taps [Saya Setuju / I Agree]
**Then** `consent_recorded_at` ISO 8601 timestamp is saved in Mastra session state
**And** the FSM advances to `DATA_COLLECTION`

**Given** the consent message is shown
**When** the candidate taps [Saya Tolak / I Decline]
**Then** no personal data is collected
**And** the FSM returns to `CANDIDATE_ASKING`

### Story 3.2: Application Confirmation & Conversational Data Collection

As a candidate,
I want to confirm the job I'm applying for and provide my personal details through natural conversation,
So that applying feels like chatting, not filling out a form.

**Acceptance Criteria:**

**Given** a candidate expresses intent to apply ("Saya mau daftar" / "I want to apply")
**When** the FSM processes the message
**Then** the bot asks the candidate to confirm the specific job they want to apply for

**Given** consent has been recorded and the FSM is in `DATA_COLLECTION`
**When** the bot begins collecting data
**Then** it collects fields sequentially one per message: full name → age → education level → phone number → location

**Given** the bot asks for age
**When** the candidate provides a non-numeric response
**Then** the bot re-prompts with a clear validation error in the candidate's language

**Given** all 5 fields are collected
**When** the bot displays the data for review
**Then** the candidate can confirm or request a correction before proceeding to file uploads

### Story 3.3: File Upload Handling — KTP, Pas Photo & CV

As a candidate,
I want to upload my identity documents directly in Telegram,
So that I can complete my full application without leaving the app.

**Acceptance Criteria:**

**Given** the FSM is at the file upload step
**When** a candidate sends a file
**Then** the bot validates file type (image for KTP/photo, PDF/image/doc for CV) and size (≤20MB)

**Given** a valid KTP file is received
**When** the bot downloads it from Telegram
**Then** it is saved to `uploads/<chat_id>/ktp.<ext>`
**And** the bot confirms receipt in the candidate's language within ≤5 seconds

**Given** a valid Pas photo is received
**When** downloaded
**Then** saved to `uploads/<chat_id>/photo.<ext>` with confirmation

**Given** a valid CV is received
**When** downloaded
**Then** saved to `uploads/<chat_id>/cv.<ext>` with confirmation

**Given** a file exceeding 20MB is sent
**When** the bot attempts to process it
**Then** the bot informs the candidate of the size limit and asks for re-upload

**Given** all 3 files are uploaded
**When** the bot confirms the last file
**Then** the FSM transitions to `SCORING`

---

## Epic 4: Candidate Screening & Outcome Routing — Stories

The scoring engine evaluates candidates against job requirements and routes them to the correct outcome: advancement with next steps, polite rejection with re-entry offer, or post-test link delivery.

### Story 4.1: Candidate Match Scoring Engine

As the system,
I want to calculate a weighted match score comparing candidate data against job requirements,
So that qualification decisions are objective, consistent, and fully automated.

**Acceptance Criteria:**

**Given** a candidate (age: 24, education: SMA, no SIM required) applying for a matching job
**When** `scoring-tool.ts` is called
**Then** the score is ≥50% with the correct weighted breakdown (age 30%, education 40%, SIM 30%)

**Given** a candidate without SIM C applying for a job requiring SIM C
**When** the scoring engine runs
**Then** the SIM component scores 0%
**And** the total score reflects this reduction

**Given** a job with no SIM/license requirement
**When** the scoring engine runs
**Then** the SIM weight (30%) is redistributed: age becomes 45%, education becomes 55%

**Given** the same candidate and job data are passed twice
**When** the scoring tool is called both times
**Then** both results are identical (deterministic)

### Story 4.2: Pass Routing & Post-Test Delivery

As a candidate who qualifies,
I want to receive a congratulations message and my next steps immediately,
So that I can continue the application process without delay.

**Acceptance Criteria:**

**Given** a candidate scores ≥50%
**When** the FSM transitions to `OUTCOME → PASS`
**Then** the bot sends a congratulations message in the candidate's language

**Given** a candidate has passed
**When** the bot sends the next-steps message
**Then** it includes the post-test link from the job's `post_test` field
**And** the recruiter's contact info (`recruiter_name`, `recruitment_number`)

### Story 4.3: Rejection Flow & Re-Entry

As a candidate who doesn't qualify,
I want a clear, respectful rejection with an offer to explore other jobs,
So that I understand why and can continue looking.

**Acceptance Criteria:**

**Given** a candidate scores <50%
**When** the FSM transitions to `OUTCOME → FAIL`
**Then** the bot sends a polite rejection in the candidate's language explaining the unmet requirement

**Given** the rejection message is sent
**When** the bot follows up
**Then** it offers [Lihat lowongan lain / See other jobs] and a decline option

**Given** the candidate taps [See other jobs]
**When** the FSM transitions
**Then** state returns to `CANDIDATE_ASKING` with language preference preserved

**Given** the candidate declines to browse more jobs
**When** they select the decline option
**Then** the bot sends a farewell message and the session ends gracefully

---

## Epic 5: Candidate Tracking & Recruiter Operations — Stories

All candidate records land in Google Sheets in real time — partial save on data entry, qualified on pass, rejected on fail. Recruiters have full pipeline visibility and can manually update records after interviews.

### Story 5.1: Google Sheets Adapter & Async Write Queue

As a recruiter,
I want all candidate records to appear in Google Sheets automatically,
So that I have a live pipeline view without touching the bot.

**Acceptance Criteria:**

**Given** valid Google service account credentials in `.env`
**When** `sheets-tool.ts` initializes
**Then** it authenticates via service account with least-privilege access (write to candidate sheet only)

**Given** a Sheets write operation is triggered
**When** the Google Sheets API is available
**Then** the write completes without blocking the candidate's conversation

**Given** the Google Sheets API returns an error
**When** the first write attempt fails
**Then** the operation is retried up to 3 times with 5-second backoff

**Given** all 3 retries fail
**When** the write is abandoned
**Then** a Pino error log is written with `chat_id`
**And** the recruiter receives a Telegram notification via `notify-tool.ts`

### Story 5.2: Partial Save on Data Collection Start

As a recruiter,
I want a candidate record created in Sheets as soon as they start providing data,
So that no contact information is lost even if the candidate drops off mid-application.

**Acceptance Criteria:**

**Given** a candidate completes the first data field (name) in `DATA_COLLECTION`
**When** the FSM processes the step
**Then** a partial row is written to Sheets with: chat_id, name, timestamp, status: "partial"

**Given** additional fields are collected (age, education, phone, location)
**When** each field is submitted
**Then** the existing Sheets row is updated (upsert by `chat_id`) — no duplicate rows

**Given** a candidate drops off after partial data collection
**When** a recruiter views the sheet
**Then** the partial row is visible with whatever data was collected

### Story 5.3: Qualified & Rejected Status Updates

As a recruiter,
I want the candidate's Sheets record to reflect their screening outcome immediately after scoring,
So that I can instantly see who passed and who was rejected.

**Acceptance Criteria:**

**Given** a candidate passes screening
**When** the FSM transitions to `OUTCOME → PASS`
**Then** the Sheets row is updated: status → "qualified", all fields populated, file paths for KTP/photo/CV recorded

**Given** a candidate fails screening
**When** the FSM transitions to `OUTCOME → FAIL`
**Then** the Sheets row is updated: status → "rejected", `fail_reason` populated

**Given** a row is updated to "qualified"
**When** a recruiter opens the sheet
**Then** the file paths (ktp_path, photo_path, cv_path) are visible and correctly reference `uploads/<chat_id>/` files

### Story 5.4: Final Status Column & Recruiter Update Workflow

As a recruiter,
I want a dedicated final status column in Sheets that I can update manually after completing an interview,
So that I have a complete record from application through to the final hiring decision.

**Acceptance Criteria:**

**Given** the spreadsheet is initialized
**When** the schema is set up
**Then** it includes columns: chat_id, name, age, education, phone, location, score, status, fail_reason, ktp_path, photo_path, cv_path, final_status, interview_notes, updated_at

**Given** the bot writes to a candidate's row
**When** the update runs
**Then** `final_status` and `interview_notes` columns are never written by the bot (recruiter-only fields)

**Given** a recruiter manually updates `final_status` after an interview
**When** the bot subsequently processes any write for that candidate
**Then** the recruiter's manual entry in `final_status` is preserved
