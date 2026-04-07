/**
 * Integration tests — require a running PostgreSQL instance.
 * Start with: docker-compose up -d
 * Run only these: bun test src/db/
 */
import { describe, test, expect, afterAll } from 'bun:test'
import { pool, runMigrations } from './client'

const isDbAvailable = await pool
  .query('SELECT 1')
  .then(() => true)
  .catch(() => false)

describe.if(isDbAvailable)('runMigrations (integration)', () => {
  afterAll(async () => {
    await pool.end()
  })

  test('enables the vector extension', async () => {
    await runMigrations()
    const result = await pool.query(
      "SELECT extname FROM pg_extension WHERE extname = 'vector'"
    )
    expect(result.rows.length).toBe(1)
    expect(result.rows[0].extname).toBe('vector')
  })

  test('runMigrations is idempotent (safe to run twice)', async () => {
    await expect(runMigrations()).resolves.toBeUndefined()
  })
})

describe.if(!isDbAvailable)('runMigrations (skipped — no DB)', () => {
  test('skipped: PostgreSQL not available — start docker-compose', () => {
    console.log('DB integration tests skipped — run: docker-compose up -d')
    expect(true).toBe(true)
  })
})
