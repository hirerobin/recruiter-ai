import { Mastra } from '@mastra/core'
import { PgVector, PostgresStore } from '@mastra/pg'
import { env } from '../config/env'
import { runMigrations } from '../db/client'
import { recruiterAgent } from './agents/recruiter-agent'

const store = new PostgresStore({
  id: 'recruiter-ai-store',
  connectionString: env.DATABASE_URL,
})

export const pgVector = new PgVector({
  id: 'recruiter-ai-vector',
  connectionString: env.DATABASE_URL,
})

export const mastra = new Mastra({
  storage: store,
  vectors: { pgVector },
  agents: { recruiterAgent },
  logger: false,
})

export async function initDb(): Promise<void> {
  await runMigrations()
  await store.init()
}
