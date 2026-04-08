/**
 * Admin area — password-protected commands accessible via Telegram.
 *
 * Flow:
 *   /admin <password>  → authenticates, shows admin menu
 *   /sync              → re-seed knowledge base from Google Sheets
 *   /stats             → show bot statistics
 *   /logout            → exit admin mode
 */
import { InlineKeyboard } from 'grammy'
import { env } from '../../config/env'
import { logger } from '../../logger'
import type { BotContext } from '../middleware/session'

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function handleAdminLogin(ctx: BotContext): Promise<void> {
  const text = ctx.message?.text ?? ''
  const password = text.replace('/admin', '').trim()

  if (!password) {
    await ctx.reply('Usage: /admin <password>')
    return
  }

  if (password !== env.ADMIN_PASSWORD) {
    logger.warn({ chat_id: String(ctx.chat!.id), event: 'admin_login_failed' })
    await ctx.reply('❌ Wrong password.')
    return
  }

  ctx.session.isAdmin = true
  logger.info({ chat_id: String(ctx.chat!.id), event: 'admin_login_success' })

  const menu = new InlineKeyboard()
    .text('🔄 Sync Jobs', 'admin:sync').row()
    .text('📊 Stats', 'admin:stats').row()
    .text('🚪 Logout', 'admin:logout')

  await ctx.reply(
    '✅ *Admin mode activated*\n\nChoose an action:',
    { parse_mode: 'Markdown', reply_markup: menu }
  )
}

export async function handleAdminLogout(ctx: BotContext): Promise<void> {
  ctx.session.isAdmin = false
  await ctx.answerCallbackQuery()
  await ctx.reply('🚪 Logged out from admin mode.')
}

// ─── Sync Jobs ───────────────────────────────────────────────────────────────

export async function handleAdminSync(ctx: BotContext): Promise<void> {
  if (!ctx.session.isAdmin) return
  await ctx.answerCallbackQuery()
  await ctx.reply('🔄 Syncing jobs from Google Sheets...')

  try {
    // Dynamic import to avoid loading heavy deps at startup
    const { google } = await import('googleapis')
    const { MDocument } = await import('@mastra/rag')
    const { embed } = await import('ai')
    const { openai } = await import('@ai-sdk/openai')
    const { PgVector } = await import('@mastra/pg')
    const { INDEX_NAME, EMBEDDING_DIMENSION } = await import('../../mastra/rag/knowledge')

    const spreadsheetId = env.GOOGLE_JOBS_SPREADSHEET_ID
    const sheetName = env.GOOGLE_JOBS_SHEET_NAME ?? 'List Job'

    if (!spreadsheetId) {
      await ctx.reply('❌ GOOGLE_JOBS_SPREADSHEET_ID not configured.')
      return
    }

    const key = env.GOOGLE_PRIVATE_KEY.split('\\n').join('\n')
    const auth = new google.auth.JWT({
      email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    })
    const sheets = google.sheets({ version: 'v4', auth })
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!A:M` })
    const rows = res.data.values ?? []

    if (rows.length < 2) {
      await ctx.reply('❌ No data rows found in sheet.')
      return
    }

    const jobs = rows.slice(1).filter((r: string[]) => r[0]?.trim())

    const pgVector = new PgVector({ id: 'sync-vector', connectionString: env.DATABASE_URL })
    const indexes = await pgVector.listIndexes()
    if (!indexes.includes(INDEX_NAME)) {
      await pgVector.createIndex({ indexName: INDEX_NAME, dimension: EMBEDDING_DIMENSION, metric: 'cosine' })
    }

    const embeddingModel = openai.embedding('text-embedding-3-small')
    let indexed = 0

    for (const r of jobs) {
      const judul = r[0]?.trim() ?? ''
      const lokasi = r[1]?.trim() ?? ''
      const sim = r[5]?.trim() ?? '-'
      const simText = sim && sim !== '-' ? ` SIM ${sim}.` : ''

      const text = [
        `Posisi: ${judul}`,
        `Lokasi: ${lokasi}`,
        `Perusahaan/Client: ${r[3]?.trim() ?? ''}`,
        `Role: ${r[7]?.trim() ?? ''}`,
        `Deskripsi: ${r[2]?.trim() ?? ''}`,
        `Persyaratan: Usia ${r[4]?.trim() ?? ''} tahun. Pendidikan ${r[6]?.trim() ?? ''}.${simText}`,
        `Gaji: ${r[8]?.trim() ?? ''}`,
        `Benefit: ${r[9]?.trim() ?? ''}`,
        `Post Test: ${r[10]?.trim() || 'Tidak ada'}`,
        `Recruiter: ${r[11]?.trim() ?? ''} (${r[12]?.trim() ?? ''})`,
      ].join('\n')

      const doc = MDocument.fromText(text, { judul_job: judul, lokasi })
      await doc.chunkRecursive({ maxSize: 1000, overlap: 100 })
      const chunks = await doc.chunk()

      for (const chunk of chunks) {
        const { embedding } = await embed({ model: embeddingModel, value: chunk.text })
        await pgVector.upsert({
          indexName: INDEX_NAME,
          vectors: [embedding],
          metadata: [{ ...chunk.metadata, text: chunk.text }],
          deleteFilter: { judul_job: { $eq: judul }, lokasi: { $eq: lokasi } },
        })
      }
      indexed++
    }

    logger.info({ event: 'admin_sync_done', count: indexed })
    await ctx.reply(`✅ Synced *${indexed} jobs* from Google Sheets.`, { parse_mode: 'Markdown' })
  } catch (err) {
    logger.error({ event: 'admin_sync_error', err })
    await ctx.reply(`❌ Sync failed: ${err}`)
  }
}

// ─── Stats ───────────────────────────────────────────────────────────────────

export async function handleAdminStats(ctx: BotContext): Promise<void> {
  if (!ctx.session.isAdmin) return
  await ctx.answerCallbackQuery()

  try {
    const { Pool } = await import('pg')
    const pool = new Pool({ connectionString: env.DATABASE_URL })

    const sessions = await pool.query('SELECT count(*) FROM bot_sessions')
    const bookings = await pool.query('SELECT count(*) FROM interview_bookings')
    const totalSessions = sessions.rows[0]?.count ?? 0
    const totalBookings = bookings.rows[0]?.count ?? 0

    await pool.end()

    const stats = [
      '📊 *Bot Statistics*',
      '',
      `👤 Total sessions: ${totalSessions}`,
      `📅 Interview bookings: ${totalBookings}`,
      `🕐 Uptime: ${formatUptime(process.uptime())}`,
      `💾 Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
    ].join('\n')

    await ctx.reply(stats, { parse_mode: 'Markdown' })
  } catch (err) {
    await ctx.reply(`❌ Error: ${err}`)
  }
}

function formatUptime(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// ─── Admin menu (re-show) ────────────────────────────────────────────────────

export async function handleAdminMenu(ctx: BotContext): Promise<void> {
  if (!ctx.session.isAdmin) {
    await ctx.reply('⚠️ Not in admin mode. Use /admin <password>')
    return
  }

  const menu = new InlineKeyboard()
    .text('🔄 Sync Jobs', 'admin:sync').row()
    .text('📊 Stats', 'admin:stats').row()
    .text('🚪 Logout', 'admin:logout')

  await ctx.reply('*Admin Menu*', { parse_mode: 'Markdown', reply_markup: menu })
}
