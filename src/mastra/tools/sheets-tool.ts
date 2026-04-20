import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { google } from 'googleapis'
import { env } from '../../config/env'
import { logger } from '../../logger'
import { loadDataNeeds } from './data-needs'
import type { PartialSheetsRow } from '../../types/sheets'

// Core tracking columns (always present)
const CORE_COLUMNS = [
  'chat_id', 'applied_job', 'status', 'score', 'fail_reason',
  'final_status', 'interview_date', 'interview_score', 'ai_interview_notes', 'interview_score_detail', 'updated_at',
]

function parsePemKey(raw: string): string {
  return raw.includes('\n') ? raw : raw.split('\\n').join('\n')
}

function getAuth() {
  return new google.auth.JWT({
    email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: parsePemKey(env.GOOGLE_PRIVATE_KEY),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

const sheetName = env.GOOGLE_SHEETS_SHEET_NAME ?? 'Candidates'
const spreadsheetId = env.GOOGLE_SHEETS_SPREADSHEET_ID

let cachedColumns: string[] | null = null
let cachedHeaders: string[] | null = null

/**
 * Build full column list: CORE + all Data_Needs question_numbers.
 * Cached per process.
 */
async function getColumns(): Promise<{ keys: string[]; headers: string[] }> {
  if (cachedColumns && cachedHeaders) return { keys: cachedColumns, headers: cachedHeaders }

  const dataNeeds = await loadDataNeeds()
  const dnKeys = dataNeeds.map((q) => q.questionNumber)
  // Headers: human-readable question text for Data_Needs columns
  const dnHeaders = dataNeeds.map((q) => q.question)

  cachedColumns = [...CORE_COLUMNS, ...dnKeys]
  cachedHeaders = [...CORE_COLUMNS, ...dnHeaders]
  return { keys: cachedColumns, headers: cachedHeaders }
}

function colLetter(index: number): string {
  // 0-based index → A, B, ..., Z, AA, AB, ...
  let n = index
  let s = ''
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  }
  return s
}

async function ensureHeader(sheets: ReturnType<typeof google.sheets>, headers: string[]): Promise<void> {
  const lastCol = colLetter(headers.length - 1)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:${lastCol}1`,
  })
  if (!res.data.values?.length || res.data.values[0]!.length < headers.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    })
  }
}

async function findRowByChatId(
  sheets: ReturnType<typeof google.sheets>,
  chatId: string
): Promise<number | null> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:A`,
  })
  const idx = (res.data.values ?? []).findIndex((r) => r[0] === chatId)
  return idx === -1 ? null : idx + 1
}

async function upsertRow(row: Record<string, string | undefined>, retries = 3): Promise<void> {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const { keys, headers } = await getColumns()
  const lastCol = colLetter(keys.length - 1)

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await ensureHeader(sheets, headers)
      const chatId = row.chat_id ?? ''
      if (!chatId) {
        logger.warn({ event: 'sheets_write_no_chatid' })
        return
      }

      const existingRowNum = await findRowByChatId(sheets, chatId)

      if (existingRowNum) {
        const existing = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${sheetName}!A${existingRowNum}:${lastCol}${existingRowNum}`,
        })
        const currentValues = existing.data.values?.[0] ?? []

        // Merge: only overwrite columns with non-empty new values
        const mergedData = keys.map((col, i) => {
          const newVal = row[col]
          if (newVal !== undefined && newVal !== '') return newVal
          return currentValues[i] ?? ''
        })

        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${sheetName}!A${existingRowNum}`,
          valueInputOption: 'RAW',
          requestBody: { values: [mergedData] },
        })
      } else {
        const rowData = keys.map((col) => row[col] ?? '')
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${sheetName}!A1`,
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: [rowData] },
        })
      }
      return
    } catch (err) {
      logger.warn({ chat_id: row.chat_id, event: 'sheets_write_retry', attempt, err })
      if (attempt === retries) throw err
      await new Promise((r) => setTimeout(r, 5000 * attempt))
    }
  }
}

export interface ExtraColumns {
  interviewDate?: string
  aiInterviewNotes?: string
  interviewScore?: string
  interviewScoreDetail?: string
}

/** Direct service call — fire-and-forget safe */
export async function writeToSheets(row: PartialSheetsRow, extra?: ExtraColumns): Promise<void> {
  if (!env.GOOGLE_PRIVATE_KEY.startsWith('-----BEGIN')) {
    logger.debug({ chat_id: row.chat_id, event: 'sheets_skipped', reason: 'no valid credentials' })
    return
  }

  // Merge extra columns into the row (new dynamic schema handles them)
  const merged: Record<string, string | undefined> = {
    ...row,
    updated_at: new Date().toISOString(),
  }
  if (extra?.interviewDate) merged.interview_date = extra.interviewDate
  if (extra?.aiInterviewNotes) merged.ai_interview_notes = extra.aiInterviewNotes
  if (extra?.interviewScore) merged.interview_score = extra.interviewScore
  if (extra?.interviewScoreDetail) merged.interview_score_detail = extra.interviewScoreDetail

  await upsertRow(merged)
}

export const sheetsTool = createTool({
  id: 'sheets-tool',
  description: 'Write or update a candidate record in Google Sheets (fire-and-forget).',
  inputSchema: z.object({
    chat_id: z.string(),
    applied_job: z.string().optional(),
    score: z.string().optional(),
    status: z.enum(['partial', 'qualified', 'rejected']).optional(),
    fail_reason: z.string().optional(),
  }).passthrough(),
  execute: async (inputData) => {
    const row = inputData as unknown as PartialSheetsRow
    writeToSheets(row).catch((err) =>
      logger.error({ chat_id: row.chat_id, event: 'sheets_write_failed', err })
    )
    return { success: true }
  },
})
