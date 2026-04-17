/**
 * Loads bot response templates from Google Sheets "Bot Responses" tab.
 * Cached for 5 minutes to avoid hitting Sheets API on every message.
 */
import { google } from 'googleapis'
import { env } from '../../config/env'
import { logger } from '../../logger'

export interface BotResponse {
  category: string
  keywords: string[]
  response: string
  notes: string
}

let cache: { data: BotResponse[]; expires: number } = { data: [], expires: 0 }

function getAuth() {
  const key = env.GOOGLE_PRIVATE_KEY.split('\\n').join('\n')
  return new google.auth.JWT({
    email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
}

export async function loadBotResponses(): Promise<BotResponse[]> {
  if (Date.now() < cache.expires && cache.data.length) return cache.data

  const spreadsheetId = env.GOOGLE_JOBS_SPREADSHEET_ID
  if (!spreadsheetId) return []

  try {
    const sheets = google.sheets({ version: 'v4', auth: getAuth() })
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Bot Responses!A2:D100',
    })

    const data = (res.data.values ?? [])
      .filter((r: string[]) => r[0]?.trim() && r[2]?.trim())
      .map((r: string[]): BotResponse => ({
        category: r[0]?.trim() ?? '',
        keywords: (r[1] ?? '').split(',').map((k: string) => k.trim().toLowerCase()).filter(Boolean),
        response: r[2]?.trim() ?? '',
        notes: r[3]?.trim() ?? '',
      }))

    cache = { data, expires: Date.now() + 5 * 60 * 1000 }
    logger.info({ event: 'bot_responses_loaded', count: data.length })
    return data
  } catch (err) {
    logger.error({ event: 'bot_responses_load_error', err })
    return cache.data // return stale cache on error
  }
}

/**
 * Match user message against bot response templates.
 * Returns the matched response or null.
 */
export function matchResponse(message: string, responses: BotResponse[]): BotResponse | null {
  const lower = message.toLowerCase().trim()

  for (const r of responses) {
    for (const kw of r.keywords) {
      if (lower === kw || lower.includes(kw)) {
        return r
      }
    }
  }
  return null
}
