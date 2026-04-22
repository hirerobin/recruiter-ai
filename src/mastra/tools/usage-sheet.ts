/**
 * Writes per-session AI usage data to a dedicated "Usage" sheet tab
 * in the same Google Spreadsheet as the Candidates sheet.
 * The sheet is auto-created with headers on first write.
 */
import { google } from 'googleapis'
import { env } from '../../config/env'
import { logger } from '../../logger'
import type { SessionSnapshot } from './usage-tracker'

const USAGE_SHEET_NAME = 'Usage'

const COLUMNS = [
  'timestamp',
  'chat_id',
  'applied_job',
  'session_duration_min',
  'total_input_tokens',
  'total_output_tokens',
  'total_cost_usd',
  'gpt4o_input_tokens',
  'gpt4o_output_tokens',
  'gpt4o_calls',
  'gpt4o_cost_usd',
  'gpt4o_mini_input_tokens',
  'gpt4o_mini_output_tokens',
  'gpt4o_mini_calls',
  'gpt4o_mini_cost_usd',
  'embedding_input_tokens',
  'embedding_calls',
  'embedding_cost_usd',
  'notes',
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

async function ensureUsageSheet(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
): Promise<void> {
  // Check if the sheet tab exists
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' })
  const exists = meta.data.sheets?.some((s) => s.properties?.title === USAGE_SHEET_NAME)

  if (!exists) {
    // Create the sheet tab
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: USAGE_SHEET_NAME } } }],
      },
    })
    logger.info({ event: 'usage_sheet_created' })
  }

  // Ensure header row
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${USAGE_SHEET_NAME}!A1:A1`,
  })
  if (!res.data.values?.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${USAGE_SHEET_NAME}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [COLUMNS] },
    })
  }
}

export async function writeUsageToSheet(
  chatId: string,
  appliedJob: string,
  snapshot: SessionSnapshot,
): Promise<void> {
  const spreadsheetId = env.GOOGLE_SHEETS_SPREADSHEET_ID
  if (!spreadsheetId || !env.GOOGLE_PRIVATE_KEY.startsWith('-----BEGIN')) {
    logger.debug({ event: 'usage_sheet_skipped', reason: 'no credentials' })
    return
  }

  try {
    const auth = getAuth()
    const sheets = google.sheets({ version: 'v4', auth })
    await ensureUsageSheet(sheets, spreadsheetId)

    const gpt4o      = snapshot.models['gpt-4o']
    const gpt4oMini  = snapshot.models['gpt-4o-mini']
    const embedding  = snapshot.models['text-embedding-3-small']

    const row = [
      new Date().toISOString(),
      chatId,
      appliedJob,
      String(snapshot.durationMin),
      String(snapshot.totalInputTokens),
      String(snapshot.totalOutputTokens),
      snapshot.totalCostUsd.toFixed(6),
      String(gpt4o?.inputTokens  ?? 0),
      String(gpt4o?.outputTokens ?? 0),
      String(gpt4o?.calls        ?? 0),
      (gpt4o?.costUsd ?? 0).toFixed(6),
      String(gpt4oMini?.inputTokens  ?? 0),
      String(gpt4oMini?.outputTokens ?? 0),
      String(gpt4oMini?.calls        ?? 0),
      (gpt4oMini?.costUsd ?? 0).toFixed(6),
      String(embedding?.inputTokens ?? 0),
      String(embedding?.calls       ?? 0),
      (embedding?.costUsd ?? 0).toFixed(6),
      snapshot.summary,
    ]

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${USAGE_SHEET_NAME}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    })

    logger.info({ event: 'usage_sheet_written', chat_id: chatId, cost: snapshot.totalCostUsd.toFixed(4) })
  } catch (err) {
    logger.error({ event: 'usage_sheet_error', chat_id: chatId, err })
  }
}
