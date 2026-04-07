import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { google } from 'googleapis'
import { env } from '../../config/env'
import { logger } from '../../logger'
import type { PartialSheetsRow } from '../../types/sheets'

const SHEET_COLUMNS = [
  'chat_id', 'name', 'age', 'education', 'phone', 'location',
  'applied_job', 'score', 'status', 'fail_reason',
  'ktp_path', 'photo_path', 'cv_path', 'updated_at',
]

const HEADER_ROW = [...SHEET_COLUMNS, 'final_status', 'interview_notes']

function parsePemKey(raw: string): string {
  // Bun reads .env literally — \n stays as two chars (backslash + n).
  // Split on that literal sequence and rejoin with real newlines.
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

async function ensureHeader(sheets: ReturnType<typeof google.sheets>): Promise<void> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:Z1`,
  })
  if (!res.data.values?.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADER_ROW] },
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

async function upsertRow(row: PartialSheetsRow, retries = 3): Promise<void> {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await ensureHeader(sheets)
      const rowData = SHEET_COLUMNS.map((col) =>
        (row as Record<string, string | undefined>)[col] ?? ''
      )
      const existingRow = await findRowByChatId(sheets, row.chat_id)
      if (existingRow) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${sheetName}!A${existingRow}`,
          valueInputOption: 'RAW',
          requestBody: { values: [rowData] },
        })
      } else {
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

/** Direct service call — fire-and-forget safe */
export async function writeToSheets(row: PartialSheetsRow, interviewNotes?: string): Promise<void> {
  // Skip if Google credentials are placeholder/unconfigured
  if (!env.GOOGLE_PRIVATE_KEY.startsWith('-----BEGIN')) {
    logger.debug({ chat_id: row.chat_id, event: 'sheets_skipped', reason: 'no valid credentials' })
    return
  }
  await upsertRow({ ...row, updated_at: new Date().toISOString() })

  // Write interview_notes to column P (16th, after final_status) if provided
  if (interviewNotes) {
    const auth = getAuth()
    const sheets = google.sheets({ version: 'v4', auth })
    const existingRow = await findRowByChatId(sheets, row.chat_id)
    if (existingRow) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!P${existingRow}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[interviewNotes]] },
      })
    }
  }
}

export const sheetsTool = createTool({
  id: 'sheets-tool',
  description: 'Write or update a candidate record in Google Sheets (fire-and-forget).',
  inputSchema: z.object({
    chat_id: z.string(),
    name: z.string().optional(),
    age: z.string().optional(),
    education: z.string().optional(),
    phone: z.string().optional(),
    location: z.string().optional(),
    applied_job: z.string().optional(),
    score: z.string().optional(),
    status: z.enum(['partial', 'qualified', 'rejected']).optional(),
    fail_reason: z.string().optional(),
    ktp_path: z.string().optional(),
    photo_path: z.string().optional(),
    cv_path: z.string().optional(),
  }),
  execute: async ({ context }) => {
    writeToSheets(context as PartialSheetsRow).catch((err) =>
      logger.error({ chat_id: context.chat_id, event: 'sheets_write_failed', err })
    )
    return { success: true }
  },
})
