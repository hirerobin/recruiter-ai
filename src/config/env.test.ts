import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { z } from 'zod'

// Re-export the schema so we can test it in isolation without side effects
const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, 'TELEGRAM_BOT_TOKEN is required'),
  TELEGRAM_WEBHOOK_URL: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
  TELEGRAM_WEBHOOK_SECRET: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  ADMIN_TELEGRAM_CHAT_IDS: z.string().min(1, 'ADMIN_TELEGRAM_CHAT_IDS is required'),
  RECRUITER_TELEGRAM_CHAT_ID: z.string().min(1, 'RECRUITER_TELEGRAM_CHAT_ID is required'),
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().min(1, 'GOOGLE_SERVICE_ACCOUNT_EMAIL is required'),
  GOOGLE_PRIVATE_KEY: z.string().min(1, 'GOOGLE_PRIVATE_KEY is required'),
  GOOGLE_SHEETS_SPREADSHEET_ID: z.string().min(1, 'GOOGLE_SHEETS_SPREADSHEET_ID is required'),
  GOOGLE_SHEETS_SHEET_NAME: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  NODE_ENV: z.preprocess(
    (v) => (v === 'test' ? 'development' : v),
    z.enum(['development', 'production']).default('development')
  ),
})

const validEnv = {
  TELEGRAM_BOT_TOKEN: '123456:ABC-DEF',
  TELEGRAM_WEBHOOK_URL: undefined,
  TELEGRAM_WEBHOOK_SECRET: undefined,
  ADMIN_TELEGRAM_CHAT_IDS: '123456789',
  RECRUITER_TELEGRAM_CHAT_ID: '987654321',
  OPENAI_API_KEY: 'sk-test-key',
  DATABASE_URL: 'postgresql://recruiter:pass@localhost:5432/recruiter_ai',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: 'bot@test.iam.gserviceaccount.com',
  GOOGLE_PRIVATE_KEY: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
  GOOGLE_SHEETS_SPREADSHEET_ID: '1test_spreadsheet_id',
  NODE_ENV: 'development' as const,
}

describe('env schema', () => {
  test('parses valid env successfully', () => {
    const result = envSchema.safeParse(validEnv)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.NODE_ENV).toBe('development')
      expect(result.data.TELEGRAM_BOT_TOKEN).toBe('123456:ABC-DEF')
    }
  })

  test('defaults NODE_ENV to development when not provided', () => {
    const { NODE_ENV: _, ...withoutNodeEnv } = validEnv
    const result = envSchema.safeParse(withoutNodeEnv)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.NODE_ENV).toBe('development')
    }
  })

  test('fails when TELEGRAM_BOT_TOKEN is missing', () => {
    const { TELEGRAM_BOT_TOKEN: _, ...without } = validEnv
    const result = envSchema.safeParse(without)
    expect(result.success).toBe(false)
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0])
      expect(fields).toContain('TELEGRAM_BOT_TOKEN')
    }
  })

  test('fails when OPENAI_API_KEY is missing', () => {
    const { OPENAI_API_KEY: _, ...without } = validEnv
    const result = envSchema.safeParse(without)
    expect(result.success).toBe(false)
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0])
      expect(fields).toContain('OPENAI_API_KEY')
    }
  })

  test('fails when DATABASE_URL is missing', () => {
    const { DATABASE_URL: _, ...without } = validEnv
    const result = envSchema.safeParse(without)
    expect(result.success).toBe(false)
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0])
      expect(fields).toContain('DATABASE_URL')
    }
  })

  test('rejects invalid NODE_ENV value', () => {
    const result = envSchema.safeParse({ ...validEnv, NODE_ENV: 'staging' })
    expect(result.success).toBe(false)
  })

  test('TELEGRAM_WEBHOOK_URL is optional', () => {
    const result = envSchema.safeParse({ ...validEnv, TELEGRAM_WEBHOOK_URL: undefined })
    expect(result.success).toBe(true)
  })

  test('empty string TELEGRAM_WEBHOOK_URL treated as unset', () => {
    const result = envSchema.safeParse({ ...validEnv, TELEGRAM_WEBHOOK_URL: '' })
    expect(result.success).toBe(true)
  })

  test('validates TELEGRAM_WEBHOOK_URL format when provided', () => {
    const result = envSchema.safeParse({ ...validEnv, TELEGRAM_WEBHOOK_URL: 'not-a-url' })
    expect(result.success).toBe(false)
  })

  test('NODE_ENV "test" is coerced to "development"', () => {
    const result = envSchema.safeParse({ ...validEnv, NODE_ENV: 'test' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.NODE_ENV).toBe('development')
    }
  })
})
