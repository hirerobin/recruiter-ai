export interface SheetsRow {
  chat_id: string
  name: string
  age: string
  education: string
  phone: string
  location: string
  applied_job: string
  score: string
  status: 'partial' | 'qualified' | 'rejected'
  fail_reason: string
  ktp_path: string
  photo_path: string
  cv_path: string
  // final_status and interview_notes are recruiter-only — never written by bot
  updated_at: string
}

export type PartialSheetsRow = Partial<SheetsRow> & { chat_id: string }
