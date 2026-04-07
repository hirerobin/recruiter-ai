/**
 * Integration tests — require a running PostgreSQL instance.
 * Start with: docker-compose up -d
 */
import { describe, test, expect, afterAll, beforeAll } from 'bun:test'
import { pool, runMigrations } from './client'
import { PostgresSessionStorage } from './session-storage'

const isDbAvailable = await pool
  .query('SELECT 1')
  .then(() => true)
  .catch(() => false)

describe.if(isDbAvailable)('PostgresSessionStorage (integration)', () => {
  const storage = new PostgresSessionStorage()
  const key = `test:${Date.now()}`

  beforeAll(async () => {
    await runMigrations()
  })

  afterAll(async () => {
    await pool.query('DELETE FROM bot_sessions WHERE key = $1', [key])
    await pool.end()
  })

  test('read returns undefined for unknown key', async () => {
    const result = await storage.read('nonexistent-key')
    expect(result).toBeUndefined()
  })

  test('write and read round-trip', async () => {
    await storage.write(key, { language: 'id' })
    const result = await storage.read(key)
    expect(result).toEqual({ language: 'id' })
  })

  test('write is idempotent (upsert)', async () => {
    await storage.write(key, { language: 'en' })
    const result = await storage.read(key)
    expect(result?.language).toBe('en')
  })

  test('delete removes the key', async () => {
    await storage.delete(key)
    const result = await storage.read(key)
    expect(result).toBeUndefined()
  })
})

describe.if(!isDbAvailable)('PostgresSessionStorage (skipped — no DB)', () => {
  test('skipped: PostgreSQL not available — start docker-compose', () => {
    console.log('DB integration tests skipped — run: docker-compose up -d')
    expect(true).toBe(true)
  })
})
