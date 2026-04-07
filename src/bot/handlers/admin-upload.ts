import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { parse } from 'csv-parse/sync'
import { MDocument } from '@mastra/rag'
import { openai } from '@ai-sdk/openai'
import { embed } from 'ai'
import { env } from '../../config/env'
import { logger } from '../../logger'
import type { BotContext } from '../middleware/session'
import { INDEX_NAME, EMBEDDING_DIMENSION, EMBEDDING_MODEL } from '../../mastra/rag/knowledge'
import { PgVector } from '@mastra/pg'

const REQUIRED_COLUMNS = [
  'judul_job', 'lokasi', 'deskripsi', 'client',
  'requirement.age', 'requirement.jenis_sim', 'requirement.pendidikan',
  'role', 'benefit', 'post_test', 'recruiter_name', 'recruitment_number',
]

const adminIds = env.ADMIN_TELEGRAM_CHAT_IDS.split(',').map((id) => id.trim())

function isAdmin(chatId: string): boolean {
  return adminIds.includes(chatId)
}

function buildJobText(row: Record<string, string>): string {
  const simText = row['requirement.jenis_sim'] ? ` SIM ${row['requirement.jenis_sim']}.` : ''
  return [
    `Posisi: ${row.judul_job}`,
    `Lokasi: ${row.lokasi}`,
    `Perusahaan/Client: ${row.client}`,
    `Role: ${row.role}`,
    `Deskripsi: ${row.deskripsi}`,
    `Persyaratan: Usia ${row['requirement.age']} tahun. Pendidikan ${row['requirement.pendidikan']}.${simText}`,
    `Benefit/Gaji: ${row.benefit}`,
    `Post Test: ${row.post_test || 'Tidak ada'}`,
    `Recruiter: ${row.recruiter_name} (${row.recruitment_number})`,
  ].join('\n')
}

async function indexCsvContent(csvContent: string): Promise<number> {
  const rows: Record<string, string>[] = parse(csvContent, { columns: true, skip_empty_lines: true })
  if (rows.length === 0) throw new Error('CSV has no data rows')

  const headers = Object.keys(rows[0])
  const missing = REQUIRED_COLUMNS.filter((col) => !headers.includes(col))
  if (missing.length > 0) throw new Error(`Missing columns: ${missing.join(', ')}`)

  const pgVector = new PgVector({ id: 'admin-upload-vector', connectionString: env.DATABASE_URL })
  const indexes = await pgVector.listIndexes()
  if (!indexes.includes(INDEX_NAME)) {
    await pgVector.createIndex({ indexName: INDEX_NAME, dimension: EMBEDDING_DIMENSION, metric: 'cosine' })
  }

  for (const row of rows) {
    const text = buildJobText(row)
    const doc = MDocument.fromText(text, {
      judul_job: row.judul_job,
      lokasi: row.lokasi,
      client: row.client,
      role: row.role,
      recruiter_name: row.recruiter_name,
      recruitment_number: row.recruitment_number,
    })
    await doc.chunkRecursive({ maxSize: 1000, overlap: 100 })
    const chunks = await doc.chunk()
    for (const chunk of chunks) {
      const { embedding } = await embed({ model: EMBEDDING_MODEL, value: chunk.text })
      await pgVector.upsert({
        indexName: INDEX_NAME,
        vectors: [embedding],
        metadata: [{ ...chunk.metadata, text: chunk.text }],
        deleteFilter: { judul_job: { $eq: row.judul_job }, lokasi: { $eq: row.lokasi } },
      })
    }
  }
  return rows.length
}

async function indexPdfContent(fileBuffer: Buffer): Promise<number> {
  // Extract text from PDF — use basic text extraction
  const text = fileBuffer.toString('utf8').replace(/[^\x20-\x7E\n]/g, ' ').trim()
  if (!text) throw new Error('Could not extract text from PDF')

  const pgVector = new PgVector({ id: 'admin-upload-vector', connectionString: env.DATABASE_URL })
  const indexes = await pgVector.listIndexes()
  if (!indexes.includes(INDEX_NAME)) {
    await pgVector.createIndex({ indexName: INDEX_NAME, dimension: EMBEDDING_DIMENSION, metric: 'cosine' })
  }

  const doc = MDocument.fromText(text, { source: 'admin-pdf-upload' })
  await doc.chunkRecursive({ maxSize: 1000, overlap: 100 })
  const chunks = await doc.chunk()

  for (const chunk of chunks) {
    const { embedding } = await embed({ model: EMBEDDING_MODEL, value: chunk.text })
    await pgVector.upsert({
      indexName: INDEX_NAME,
      vectors: [embedding],
      metadata: [{ ...chunk.metadata, text: chunk.text }],
    })
  }
  return chunks.length
}

export async function handleAdminUpload(ctx: BotContext): Promise<void> {
  const chatId = String(ctx.chat!.id)

  // Silently ignore non-admin uploads
  if (!isAdmin(chatId)) return

  const doc = ctx.message?.document
  if (!doc) return

  const fileName = doc.file_name ?? ''
  const isCsv = fileName.endsWith('.csv')
  const isPdf = fileName.endsWith('.pdf')

  if (!isCsv && !isPdf) {
    await ctx.reply('⚠️ Format tidak didukung. Kirim file CSV atau PDF.')
    return
  }

  await ctx.reply('⏳ Memproses file, mohon tunggu...')
  logger.info({ chat_id: chatId, event: 'admin_upload_start', file_name: fileName })

  try {
    const file = await ctx.api.getFile(doc.file_id)
    const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`
    const res = await fetch(fileUrl)
    if (!res.ok) throw new Error(`Failed to download file: ${res.status}`)
    const buffer = Buffer.from(await res.arrayBuffer())

    let count: number
    if (isCsv) {
      count = await indexCsvContent(buffer.toString('utf8'))
      await ctx.reply(`✅ Knowledge base diperbarui — ${count} pekerjaan diindeks.`)
    } else {
      count = await indexPdfContent(buffer)
      await ctx.reply(`✅ PDF diindeks — ${count} chunk disimpan ke knowledge base.`)
    }

    logger.info({ chat_id: chatId, event: 'admin_upload_done', file_name: fileName, count })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error({ chat_id: chatId, event: 'admin_upload_error', err })
    await ctx.reply(`❌ Gagal memproses file: ${msg}`)
  }
}
