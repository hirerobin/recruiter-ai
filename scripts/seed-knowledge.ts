/**
 * Seeds the job knowledge base into pgvector.
 *
 * Usage:
 *   bun run scripts/seed-knowledge.ts
 *   bun run scripts/seed-knowledge.ts knowledge/jobs.csv   # custom path
 *
 * Safe to run multiple times — uses deleteFilter to replace existing vectors
 * per job before re-inserting, so active sessions are never interrupted.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { parse } from 'csv-parse/sync'
import { MDocument } from '@mastra/rag'
import { openai } from '@ai-sdk/openai'
import { embed } from 'ai'
import { PgVector } from '@mastra/pg'
import { env } from '../src/config/env'
import { INDEX_NAME, EMBEDDING_DIMENSION } from '../src/mastra/rag/knowledge'

const CSV_PATH = process.argv[2] ?? join(import.meta.dir, '..', 'knowledge', 'jobs.csv')

const REQUIRED_COLUMNS = [
  'judul_job', 'lokasi', 'deskripsi', 'client',
  'requirement.age', 'requirement.jenis_sim', 'requirement.pendidikan',
  'role', 'benefit', 'post_test', 'recruiter_name', 'recruitment_number',
]

interface JobRow {
  judul_job: string
  lokasi: string
  deskripsi: string
  client: string
  'requirement.age': string
  'requirement.jenis_sim': string
  'requirement.pendidikan': string
  role: string
  benefit: string
  post_test: string
  recruiter_name: string
  recruitment_number: string
}

function buildJobText(row: JobRow): string {
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

async function main() {
  const csvContent = readFileSync(CSV_PATH, 'utf8')
  const rows: JobRow[] = parse(csvContent, { columns: true, skip_empty_lines: true })

  if (rows.length === 0) {
    console.error('No rows found in CSV')
    process.exit(1)
  }

  // Validate columns
  const headers = Object.keys(rows[0])
  const missing = REQUIRED_COLUMNS.filter((col) => !headers.includes(col))
  if (missing.length > 0) {
    console.error(`Missing required columns: ${missing.join(', ')}`)
    process.exit(1)
  }

  console.log(`Seeding ${rows.length} job(s) from ${CSV_PATH}`)

  const pgVector = new PgVector({ id: 'seed-vector', connectionString: env.DATABASE_URL })

  // Ensure index exists (idempotent)
  const indexes = await pgVector.listIndexes()
  if (!indexes.includes(INDEX_NAME)) {
    console.log(`Creating index '${INDEX_NAME}'...`)
    await pgVector.createIndex({ indexName: INDEX_NAME, dimension: EMBEDDING_DIMENSION, metric: 'cosine' })
  }

  const embeddingModel = openai.embedding('text-embedding-3-small')
  let indexed = 0

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
      const { embedding } = await embed({ model: embeddingModel, value: chunk.text })
      await pgVector.upsert({
        indexName: INDEX_NAME,
        vectors: [embedding],
        metadata: [{ ...chunk.metadata, text: chunk.text }],
        deleteFilter: { judul_job: { $eq: row.judul_job }, lokasi: { $eq: row.lokasi } },
      })
    }

    indexed++
    console.log(`  [${indexed}/${rows.length}] ${row.judul_job} — ${row.lokasi}`)
  }

  console.log(`\nDone — ${indexed} job(s) indexed into '${INDEX_NAME}'`)
  process.exit(0)
}

main().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
