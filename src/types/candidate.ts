export enum FsmState {
  GREETING = 'GREETING',
  LANGUAGE_SELECT = 'LANGUAGE_SELECT',
  CANDIDATE_ASKING = 'CANDIDATE_ASKING',
  CONFIRMATION = 'CONFIRMATION',
  CONSENT = 'CONSENT',
  DATA_COLLECTION = 'DATA_COLLECTION',
  FILE_UPLOAD = 'FILE_UPLOAD',
  SCORING = 'SCORING',
  PASS = 'PASS',
  FAIL = 'FAIL',
  ESCALATED = 'ESCALATED',
}

export type DataCollectionField = 'name' | 'age' | 'education' | 'phone' | 'location'

export const DATA_COLLECTION_FIELDS: DataCollectionField[] = [
  'name', 'age', 'education', 'phone', 'location',
]

export interface CandidateData {
  name?: string
  age?: number
  education?: string
  phone?: string
  location?: string
}

export interface FileUploads {
  ktpPath?: string
  photoPath?: string
  cvPath?: string
}

export interface ApplicationRecord {
  chatId: string
  language: 'id' | 'en'
  appliedJob?: string
  consentRecordedAt?: string
  data: CandidateData
  files: FileUploads
  score?: number
  failReason?: string
  fsmState: FsmState
  currentField?: DataCollectionField
}
