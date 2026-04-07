/**
 * Uploads candidate files (KTP, photo, CV) to Google Drive.
 * Files are organized into per-candidate subfolders: FOLDER_ID/<chatId>/
 *
 * Uses OAuth2 refresh token (personal account) since service accounts
 * no longer have storage quota for Drive uploads.
 */
import { google } from 'googleapis'
import { createReadStream } from 'fs'
import { basename } from 'path'
import { env } from '../../config/env'
import { logger } from '../../logger'

function getAuth() {
  const oauth2 = new google.auth.OAuth2(
    env.GOOGLE_OAUTH_CLIENT_ID,
    env.GOOGLE_OAUTH_CLIENT_SECRET
  )
  oauth2.setCredentials({ refresh_token: env.GOOGLE_DRIVE_REFRESH_TOKEN })
  return oauth2
}

async function findOrCreateFolder(
  drive: ReturnType<typeof google.drive>,
  parentId: string,
  folderName: string
): Promise<string> {
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
  })
  if (res.data.files?.length) {
    return res.data.files[0]!.id!
  }

  const folder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  })
  return folder.data.id!
}

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

export interface DriveUploadResult {
  success: boolean
  driveUrl?: string
  error?: string
}

export async function uploadToDrive(
  chatId: string,
  localPath: string,
  fileType: 'ktp' | 'photo' | 'cv'
): Promise<DriveUploadResult> {
  const folderId = env.GOOGLE_DRIVE_FOLDER_ID
  if (!folderId || !env.GOOGLE_DRIVE_REFRESH_TOKEN) {
    logger.debug({ chat_id: chatId, event: 'drive_skipped', reason: 'Drive not configured' })
    return { success: false, error: 'Drive not configured' }
  }

  try {
    const auth = getAuth()
    const drive = google.drive({ version: 'v3', auth })

    const candidateFolderId = await findOrCreateFolder(drive, folderId, chatId)

    const fileName = basename(localPath)
    const ext = ('.' + fileName.split('.').pop()!).toLowerCase()
    const mimeType = MIME_MAP[ext] ?? 'application/octet-stream'

    const res = await drive.files.create({
      requestBody: {
        name: `${fileType}_${fileName}`,
        parents: [candidateFolderId],
      },
      media: {
        mimeType,
        body: createReadStream(localPath),
      },
      fields: 'id, webViewLink',
    })

    const driveUrl = res.data.webViewLink ?? `https://drive.google.com/file/d/${res.data.id}/view`
    logger.info({ chat_id: chatId, event: 'drive_uploaded', fileType, driveUrl })
    return { success: true, driveUrl }
  } catch (err) {
    logger.error({ chat_id: chatId, event: 'drive_upload_error', fileType, err })
    return { success: false, error: String(err) }
  }
}
