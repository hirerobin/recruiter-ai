import { Pool } from 'pg'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { env } from '../config/env'
import { logger } from '../logger'

export const pool = new Pool({ connectionString: env.DATABASE_URL })

export async function runMigrations(): Promise<void> {
  const migrationsDir = join(import.meta.dir, 'migrations')

  // Read all .sql files sorted alphabetically (001_, 002_, ...)
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b))

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8')
    await pool.query(sql)
    logger.info({ event: 'migration_applied', file })
  }
}
