import { logger } from './logger'
import { initDb } from './mastra/index'
import { startBot } from './bot/index'

logger.info({ msg: 'recruiter-ai starting', env: process.env.NODE_ENV ?? 'development' })

await initDb()
logger.info({ msg: 'database ready' })

await startBot()
