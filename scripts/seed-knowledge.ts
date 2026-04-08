/**
 * Seeds the job knowledge base into pgvector.
 *
 * Usage:
 *   bun run scripts/seed-knowledge.ts              # reads from Google Sheets (GOOGLE_JOBS_SPREADSHEET_ID)
 *   bun run scripts/seed-knowledge.ts --csv         # reads from knowledge/jobs.csv (legacy)
 *   bun run scripts/seed-knowledge.ts knowledge/jobs.csv  # reads from specific CSV file
 *
 * Safe to run multiple times — uses deleteFilter to replace existing vectors
 * per job before re-inserting.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { parse } from 'csv-parse/sync'
import { MDocument } from '@mastra/rag'
import { openai } from '@ai-sdk/openai'
import { embed } from 'ai'
import { google } from 'googleapis'
import { PgVector } from '@mastra/pg'
import { env } from '../src/config/env'
import { INDEX_NAME, EMBEDDING_DIMENSION } from '../src/mastra/rag/knowledge'

interface JobRow {
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

// ─── Read from Google Sheets ─────────────────────────────────────────────────

async function readFromSheets(): Promise<JobRow[]> {
  const spreadsheetId = env.GOOGLE_JOBS_SPREADSHEET_ID
  const sheetName = env.GOOGLE_JOBS_SHEET_NAME ?? 'List Job'

  if (!spreadsheetId) {
    console.error('GOOGLE_JOBS_SPREADSHEET_ID not set in .env')
    process.exit(1)
  }

  const key = env.GOOGLE_PRIVATE_KEY.split('\\n').join('\n')
  const auth = new google.auth.JWT({
    email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })

  const sheets = google.sheets({ version: 'v4', auth })
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:M`,
  })

  const rows = res.data.values ?? []
  if (rows.length < 2) {
    console.error('No data rows found in sheet')
    process.exit(1)
  }

  // Skip header row, map columns to JobRow
  // Columns: Judul Job | Lokasi | Deskrpsi | R_client | R_Age | R_SIM | Pendidikan | Role | Gaji | Benefit | (post_test) | R.Nama | R.HP
  return rows.slice(1).filter(r => r[0]?.trim()).map((r): JobRow => ({
    judul_job: r[0]?.trim() ?? '',
    lokasi: r[1]?.trim() ?? '',
    deskripsi: r[2]?.trim() ?? '',
    client: r[3]?.trim() ?? '',
    requirement_age: r[4]?.trim() ?? '',
    requirement_sim: r[5]?.trim() ?? '-',
    requirement_pendidikan: r[6]?.trim() ?? '',
    role: r[7]?.trim() ?? '',
    gaji: r[8]?.trim() ?? '',
    benefit: r[9]?.trim() ?? '',
    post_test: r[10]?.trim() ?? '',
    recruiter_name: r[11]?.trim() ?? '',
    recruiter_number: r[12]?.trim() ?? '',
  }))
}

// ─── Read from CSV (legacy) ──────────────────────────────────────────────────

function readFromCsv(csvPath: string): JobRow[] {
  const csvContent = readFileSync(csvPath, 'utf8')
  const raw: Record<string, string>[] = parse(csvContent, { columns: true, skip_empty_lines: true })
  return raw.map((r): JobRow => ({
    judul_job: r['judul_job'] ?? '',
    lokasi: r['lokasi'] ?? '',
    deskripsi: r['deskripsi'] ?? '',
    client: r['client'] ?? '',
    requirement_age: r['requirement.age'] ?? '',
    requirement_sim: r['requirement.jenis_sim'] ?? '',
    requirement_pendidikan: r['requirement.pendidikan'] ?? '',
    role: r['role'] ?? '',
    gaji: r['benefit'] ?? '',
    benefit: r['benefit'] ?? '',
    post_test: r['post_test'] ?? '',
    recruiter_name: r['recruiter_name'] ?? '',
    recruiter_number: r['recruitment_number'] ?? '',
  }))
}

// ─── Build text for vector embedding ─────────────────────────────────────────

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

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const useCsv = args.includes('--csv') || args.some(a => a.endsWith('.csv'))
  const csvPath = args.find(a => a.endsWith('.csv')) ?? join(import.meta.dir, '..', 'knowledge', 'jobs.csv')

  let jobs: JobRow[]
  if (useCsv) {
    console.log(`Reading jobs from CSV: ${csvPath}`)
    jobs = readFromCsv(csvPath)
  } else {
    console.log(`Reading jobs from Google Sheets: ${env.GOOGLE_JOBS_SPREADSHEET_ID}`)
    jobs = await readFromSheets()
  }

  if (jobs.length === 0) {
    console.error('No jobs found')
    process.exit(1)
  }

  console.log(`Seeding ${jobs.length} job(s)...`)

  const pgVector = new PgVector({ id: 'seed-vector', connectionString: env.DATABASE_URL })
  const indexes = await pgVector.listIndexes()
  if (!indexes.includes(INDEX_NAME)) {
    console.log(`Creating index '${INDEX_NAME}'...`)
    await pgVector.createIndex({ indexName: INDEX_NAME, dimension: EMBEDDING_DIMENSION, metric: 'cosine' })
  }

  const embeddingModel = openai.embedding('text-embedding-3-small')
  let indexed = 0

  for (const row of jobs) {
    const text = buildJobText(row)
    const doc = MDocument.fromText(text, {
      judul_job: row.judul_job,
      lokasi: row.lokasi,
      client: row.client,
      role: row.role,
      recruiter_name: row.recruiter_name,
      recruitment_number: row.recruiter_number,
    })
    await doc.chunkRecursive({ maxSize: 1000, overlap: 100 })
    const chunks = await doc.chunk()

    for (const chunk of chunks) {
      const { embedding } = await embed({ model: embeddingModel, value: chunk.text })
      await pgVector.upsert({
        indexName: INDEX_NAME,
        vectors: [embedding],
        metadata: [{ ...chunk.metadata, text: chunk.text }],
        deleteFilter: { judul_job: { $eq: row.judul_job }, lokasi: { $eq: row.lokasi } },
      })
    }

    indexed++
    console.log(`  [${indexed}/${jobs.length}] ${row.judul_job} — ${row.lokasi}`)
  }

  console.log(`\nDone — ${indexed} job(s) indexed into '${INDEX_NAME}'`)
  process.exit(0)
}

main().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
