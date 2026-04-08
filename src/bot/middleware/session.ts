import { Context, session, SessionFlavor } from 'grammy'
import type { StorageAdapter } from 'grammy'
import type { FsmState, CandidateData, FileUploads, DataCollectionField } from '../../types/candidate'

export interface SessionData {
  language: 'id' | 'en' | null
  fsmState: FsmState | null
  appliedJob: string | null
  consentRecordedAt: string | null
  currentField: DataCollectionField | null
  candidateData: CandidateData
  files: FileUploads
  isAdmin: boolean
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
    }),
    ...(storage ? { storage } : {}),
  })
}
