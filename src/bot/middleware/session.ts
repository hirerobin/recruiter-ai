import { Context, session, type SessionFlavor } from 'grammy'
import type { StorageAdapter } from 'grammy'
import type { FsmState, CandidateData, FileUploads, DataCollectionField } from '../../types/candidate'

export interface JobListing {
  title: string
  location: string
}

export interface SessionData {
  language: 'id' | 'en' | null
  fsmState: FsmState | null
  appliedJob: string | null
  consentRecordedAt: string | null
  currentField: DataCollectionField | null
  candidateData: CandidateData
  files: FileUploads
  isAdmin: boolean
  lastShownJobs: JobListing[]  // Tracks jobs shown in last agent response (for "daftar N")
  pendingApplyJob: JobListing | null  // Job the candidate is currently viewing detail for
  // Dynamic data collection (from SPX Question sheet)
  currentQuestionIndex: number                          // 0-based index into data needs list
  answers: Record<string, string>                       // question_number → answer
  // Idle detection
  lastActivityAt: string | null                         // ISO timestamp of last user message
  idlePromptSentAt: string | null                       // When the idle "still there?" prompt was sent
  // Dev mode: unique Sheets key per application attempt (chatId_timestamp)
  devSheetsId: string | null
}

export type BotContext = Context & SessionFlavor<SessionData>

export function createSessionMiddleware(storage?: StorageAdapter<SessionData>) {
  return session<SessionData, BotContext>({
    initial: (): SessionData => ({
      language: null,
      fsmState: null,
      appliedJob: null,
      consentRecordedAt: null,
      currentField: null,
      candidateData: {},
      files: {},
      isAdmin: false,
      lastShownJobs: [],
      currentQuestionIndex: 0,
      answers: {},
      lastActivityAt: null,
      idlePromptSentAt: null,
      devSheetsId: null,
      pendingApplyJob: null,
    }),
    ...(storage ? { storage } : {}),
  })
}
