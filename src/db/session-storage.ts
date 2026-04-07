import type { StorageAdapter } from 'grammy'
import { pool } from './client'
import type { SessionData } from '../bot/middleware/session'

export class PostgresSessionStorage implements StorageAdapter<SessionData> {
  async read(key: string): Promise<SessionData | undefined> {
    const result = await pool.query<{ data: SessionData }>(
      'SELECT data FROM bot_sessions WHERE key = $1',
      [key]
    )
    return result.rows[0]?.data
  }

  async write(key: string, value: SessionData): Promise<void> {
    await pool.query(
      `INSERT INTO bot_sessions (key, data, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET data = $2::jsonb, updated_at = NOW()`,
      [key, JSON.stringify(value)]
    )
  }

  async delete(key: string): Promise<void> {
    await pool.query('DELETE FROM bot_sessions WHERE key = $1', [key])
  }
}
