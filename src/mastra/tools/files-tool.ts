import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { mkdirSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { env } from '../../config/env'
import { logger } from '../../logger'

const MAX_BYTES = 20 * 1024 * 1024

const ALLOWED_TYPES = {
  ktp: ['image/jpeg', 'image/png', 'image/jpg'],
  photo: ['image/jpeg', 'image/png', 'image/jpg'],
  cv: ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
}

export interface FileInput {
  chatId: string
  fileId: string
  fileName: string
  fileSize: number
  mimeType?: string
  fileType: 'ktp' | 'photo' | 'cv'
}

export type FileResult =
  | { success: true; path: string }
  | { success: false; error: string }

export async function downloadAndSaveFile(input: FileInput): Promise<FileResult> {
  const { chatId, fileId, fileName, fileSize, mimeType, fileType } = input

  if (fileSize > MAX_BYTES) {
    return { success: false, error: `File terlalu besar (${Math.round(fileSize / 1024 / 1024)}MB). Maksimal 20MB.` }
  }

  const mime = mimeType ?? ''
  const allowed = ALLOWED_TYPES[fileType]
  if (allowed.length > 0 && mime && !allowed.includes(mime)) {
    return { success: false, error: `Format file tidak valid untuk ${fileType}. Kirim gambar atau PDF.` }
  }

  try {
    const infoRes = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`
    )
    const info = await infoRes.json() as { ok: boolean; result?: { file_path: string } }
    if (!info.ok || !info.result?.file_path) {
      return { success: false, error: 'Gagal mendapatkan info file dari Telegram.' }
    }

    const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${info.result.file_path}`
    const res = await fetch(fileUrl)
    if (!res.ok) return { success: false, error: `Gagal mengunduh file: ${res.status}` }

    const dir = join('uploads', chatId)
    mkdirSync(dir, { recursive: true })
    const localPath = join(dir, fileName)
    writeFileSync(localPath, Buffer.from(await res.arrayBuffer()))

    logger.info({ chat_id: chatId, event: 'file_saved', file_type: fileType, path: localPath })
    return { success: true, path: localPath }
  } catch (err) {
    logger.error({ chat_id: chatId, event: 'file_save_error', err })
    return { success: false, error: String(err) }
  }
}

export const filesTool = createTool({
  id: 'files-tool',
  description: 'Download and store a candidate file (ktp, photo, or cv) from Telegram.',
  inputSchema: z.object({
    chatId: z.string(),
    fileId: z.string(),
    fileName: z.string(),
    fileSize: z.number(),
    mimeType: z.string().optional(),
    fileType: z.enum(['ktp', 'photo', 'cv']),
  }),
  execute: async ({ context }) => {
    const result = await downloadAndSaveFile(context)
    if (!result.success) return { success: false, error: result.error }
    return { success: true, data: { path: result.path } }
  },
})
