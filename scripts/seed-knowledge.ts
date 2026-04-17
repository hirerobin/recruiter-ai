/**
 * Seeds ALL sheets from GOOGLE_JOBS_SPREADSHEET_ID into pgvector (except Sheet5).
 *
 * Usage:
 *   bun run scripts/seed-knowledge.ts              # reads all sheets from Google Sheets
 *   bun run scripts/seed-knowledge.ts --csv         # reads from knowledge/jobs.csv (legacy)
 *   bun run scripts/seed-knowledge.ts knowledge/jobs.csv  # reads from specific CSV file
 *
 * Safe to run multiple times — uses deleteFilter to replace existing vectors per entry.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { parse } from 'csv-parse/sync'
import { MDocument } from '@mastra/rag'
import { openai } from '@ai-sdk/openai'
import { embed } from 'ai'
import { google } from 'googleapis'
import type { sheets_v4 } from 'googleapis'
import { PgVector } from '@mastra/pg'
import { env } from '../src/config/env'
import { INDEX_NAME, EMBEDDING_DIMENSION } from '../src/mastra/rag/knowledge'

const SKIP_SHEETS = ['Sheet5']
const JOB_LIST_SHEET = 'List Job'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SeedDocument {
  sheet_name: string
  id_key: string
  text: string
  metadata: Record<string, string>
}

interface JobRow {
  sheet_name: string
  judul_job: string
  lokasi: string
  deskripsi: string
  client: string
  requirement_age: string
  requirement_sim: string
  requirement_pendidikan: string
  role: string
  gaji: string
  benefit: string
  post_test: string
  recruiter_name: string
  recruiter_number: string
}

// ─── Google Sheets auth ───────────────────────────────────────────────────────

function createSheetsClient(): sheets_v4.Sheets {
  const key = env.GOOGLE_PRIVATE_KEY.split('\\n').join('\n')
  const auth = new google.auth.JWT({
    email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
  return google.sheets({ version: 'v4', auth })
}

// ─── List sheets ──────────────────────────────────────────────────────────────

async function listSheetNames(spreadsheetId: string): Promise<string[]> {
  const sheets = createSheetsClient()
  const res = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' })
  return (res.data.sheets ?? [])
    .map((s) => s.properties?.title ?? '')
    .filter((name) => name && !SKIP_SHEETS.includes(name))
}

// ─── Read raw sheet values ────────────────────────────────────────────────────

async function readSheetValues(spreadsheetId: string, sheetName: string): Promise<string[][]> {
  const sheets = createSheetsClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!A:Z`,
  })
  return (res.data.values ?? []) as string[][]
}

// ─── "List Job" — typed mapper ────────────────────────────────────────────────

function mapJobRow(r: string[], sheetName: string): JobRow {
  return {
    sheet_name: sheetName,
    judul_job: r[0]?.trim() ?? '',
    lokasi: r[1]?.trim() ?? '',
    deskripsi: r[2]?.trim() ?? '',
    client: r[3]?.trim() ?? '',
    requirement_age: r[4]?.trim() ?? '',
    requirement_sim: r[5]?.trim() || '-',
    requirement_pendidikan: r[6]?.trim() ?? '',
    role: r[7]?.trim() ?? '',
    gaji: r[8]?.trim() ?? '',
    benefit: r[9]?.trim() ?? '',
    post_test: r[10]?.trim() ?? '',
    recruiter_name: r[11]?.trim() ?? '',
    recruiter_number: r[12]?.trim() ?? '',
  }
}

function buildJobText(row: JobRow): string {
  const simText = row.requirement_sim && row.requirement_sim !== '-' ? ` SIM ${row.requirement_sim}.` : ''
  return [
    `Posisi: ${row.judul_job}`,
    `Lokasi: ${row.lokasi}`,
    `Perusahaan/Client: ${row.client}`,
    `Role: ${row.role}`,
    `Deskripsi: ${row.deskripsi}`,
    `Persyaratan: Usia ${row.requirement_age} tahun. Pendidikan ${row.requirement_pendidikan}.${simText}`,
    `Gaji: ${row.gaji}`,
    `Benefit: ${row.benefit}`,
    `Post Test: ${row.post_test || 'Tidak ada'}`,
    `Recruiter: ${row.recruiter_name} (${row.recruiter_number})`,
  ].join('\n')
}

async function readJobListSheet(spreadsheetId: string, sheetName: string): Promise<SeedDocument[]> {
  const rows = await readSheetValues(spreadsheetId, sheetName)
  if (rows.length < 2) return []

  return rows
    .slice(1)
    .filter((r) => r[0]?.trim())
    .map((r): SeedDocument => {
      const row = mapJobRow(r, sheetName)
      return {
        sheet_name: sheetName,
        id_key: `${row.judul_job}::${row.lokasi}`,
        text: buildJobText(row),
        metadata: {
          sheet_name: sheetName,
          judul_job: row.judul_job,
          lokasi: row.lokasi,
          client: row.client,
          role: row.role,
          recruiter_name: row.recruiter_name,
          recruitment_number: row.recruiter_number,
        },
      }
    })
}

// ─── Generic sheets — header-based mapper ─────────────────────────────────────

async function readGenericSheet(spreadsheetId: string, sheetName: string): Promise<SeedDocument[]> {
  const rows = await readSheetValues(spreadsheetId, sheetName)
  if (rows.length < 2) {
    console.log(`  Skipping '${sheetName}' — empty or no data rows`)
    return []
  }

  const headers = rows[0].map((h) => h?.trim() ?? '')
  if (headers.every((h) => !h)) {
    console.log(`  Skipping '${sheetName}' — no headers`)
    return []
  }

  return rows
    .slice(1)
    .filter((r) => r.some((cell) => cell?.trim()))
    .map((r, i): SeedDocument => {
      const pairs = headers
        .map((h, idx) => ({ h, v: r[idx]?.trim() ?? '' }))
        .filter(({ h, v }) => h && v)

      const text = [`Sheet: ${sheetName}`, ...pairs.map(({ h, v }) => `${h}: ${v}`)].join('\n')

      const metadata: Record<string, string> = { sheet_name: sheetName }
      pairs.forEach(({ h, v }) => { metadata[h.toLowerCase().replace(/\s+/g, '_')] = v })

      const firstVal = r[0]?.trim() ?? String(i + 1)
      return {
        sheet_name: sheetName,
        id_key: `${sheetName}::${firstVal}::${i}`,
        text,
        metadata,
      }
    })
}

// ─── Read from CSV (legacy) ──────────────────────────────────────────────────

function readFromCsv(csvPath: string): SeedDocument[] {
  const csvContent = readFileSync(csvPath, 'utf8')
  const raw: Record<string, string>[] = parse(csvContent, { columns: true, skip_empty_lines: true })
  return raw.map((r, i): SeedDocument => {
    const row = mapJobRow(Object.values(r), 'csv')
    return {
      sheet_name: 'csv',
      id_key: `${row.judul_job}::${row.lokasi}`,
      text: buildJobText(row),
      metadata: {
        sheet_name: 'csv',
        judul_job: row.judul_job,
        lokasi: row.lokasi,
        client: row.client,
        role: row.role,
        recruiter_name: row.recruiter_name,
        recruitment_number: row.recruiter_number,
      },
    }
  })
}

// ─── Read all sheets ──────────────────────────────────────────────────────────

async function readAllSheets(): Promise<SeedDocument[]> {
  const spreadsheetId = env.GOOGLE_JOBS_SPREADSHEET_ID
  if (!spreadsheetId) {
    console.error('GOOGLE_JOBS_SPREADSHEET_ID not set in .env')
    process.exit(1)
  }

  const sheetNames = await listSheetNames(spreadsheetId)
  console.log(`Found ${sheetNames.length} sheet(s) to seed: ${sheetNames.join(', ')}\n`)

  const all: SeedDocument[] = []
  for (const name of sheetNames) {
    const docs = name === JOB_LIST_SHEET
      ? await readJobListSheet(spreadsheetId, name)
      : await readGenericSheet(spreadsheetId, name)
    console.log(`  '${name}' → ${docs.length} document(s)`)
    all.push(...docs)
  }
  return all
}

// ─── Embed & upsert ───────────────────────────────────────────────────────────

async function upsertDocument(
  pgVector: PgVector,
  embeddingModel: ReturnType<typeof openai.embedding>,
  doc: SeedDocument,
): Promise<number> {
  const mdoc = MDocument.fromText(doc.text, doc.metadata)
  await mdoc.chunkRecursive({ maxSize: 1000, overlap: 100 })
  const chunks = await mdoc.chunk()

  for (const chunk of chunks) {
    const { embedding } = await embed({ model: embeddingModel, value: chunk.text })
    await pgVector.upsert({
      indexName: INDEX_NAME,
      vectors: [embedding],
      metadata: [{ ...chunk.metadata, text: chunk.text }],
      deleteFilter: {
        sheet_name: { $eq: doc.sheet_name },
        id_key: { $eq: doc.id_key },
      },
    })
  }
  return chunks.length
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const useCsv = args.includes('--csv') || args.some((a) => a.endsWith('.csv'))
  const csvPath = args.find((a) => a.endsWith('.csv')) ?? join(import.meta.dir, '..', 'knowledge', 'jobs.csv')

  let docs: SeedDocument[]
  if (useCsv) {
    console.log(`Reading from CSV: ${csvPath}`)
    docs = readFromCsv(csvPath)
  } else {
    console.log(`Spreadsheet: ${env.GOOGLE_JOBS_SPREADSHEET_ID}`)
    docs = await readAllSheets()
  }

  if (docs.length === 0) {
    console.error('No documents found')
    process.exit(1)
  }

  console.log(`\nSeeding ${docs.length} total document(s) into '${INDEX_NAME}'...\n`)

  const pgVector = new PgVector({ id: 'seed-vector', connectionString: env.DATABASE_URL })
  const indexes = await pgVector.listIndexes()
  if (!indexes.includes(INDEX_NAME)) {
    console.log(`Creating index '${INDEX_NAME}'...`)
    await pgVector.createIndex({ indexName: INDEX_NAME, dimension: EMBEDDING_DIMENSION, metric: 'cosine' })
  }

  const embeddingModel = openai.embedding('text-embedding-3-small')
  let indexed = 0

  for (const doc of docs) {
    const chunks = await upsertDocument(pgVector, embeddingModel, doc)
    indexed++
    console.log(`  [${indexed}/${docs.length}] [${doc.sheet_name}] ${doc.id_key} (${chunks} chunk(s))`)
  }

  console.log(`\nDone — ${indexed} document(s) indexed from ${[...new Set(docs.map((d) => d.sheet_name))].length} sheet(s)`)
  process.exit(0)
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
