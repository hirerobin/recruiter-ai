/**
 * FSM dispatcher — routes incoming messages to the correct step handler
 * based on ctx.session.fsmState.
 *
 * Handles: CONFIRMATION, CONSENT, DATA_COLLECTION, FILE_UPLOAD, SCORING → PASS/FAIL
 *
 * Note: Mastra tools (scoringTool, filesTool, sheetsTool) expose pure logic
 * via their execute callbacks. For direct calls from the bot layer we import
 * the underlying service functions instead of going through the tool framework.
 */
import { InlineKeyboard } from 'grammy'
import { FsmState, DATA_COLLECTION_FIELDS, type FileUploads } from '../../types/candidate'
import type { BotContext } from '../middleware/session'
import {
  buildConsentMessage, getFieldPrompt, validateField, applyField,
  nextField, buildDataReview, getFilePrompt, nextFileStep,
  buildPassMessage, buildFailMessage, buildFarewellMessage, buildAgeError,
  type FileStep,
} from '../../mastra/workflows/screening-workflow'
import { scoreCandidate } from '../../mastra/tools/scoring-tool'
import { lookupJobRequirements } from '../../mastra/tools/job-lookup'
import { downloadAndSaveFile } from '../../mastra/tools/files-tool'
import { uploadToDrive } from '../../mastra/tools/drive-upload'
import { writeToSheets } from '../../mastra/tools/sheets-tool'
import { sendRecruiterNotification } from '../../mastra/tools/notify-tool'
import { sendInterviewScheduler } from './interview'
import { setPendingInterview } from './calendly-webhook'
import { env } from '../../config/env'
import { logger } from '../../logger'

const lang = (ctx: BotContext) => ctx.session.language ?? 'id'
const chatId = (ctx: BotContext) => String(ctx.chat!.id)

// ─── Consent keyboard ─────────────────────────────────────────────────────────

const consentKeyboard = new InlineKeyboard()
  .text('✅ Saya Setuju / I Agree', 'consent:agree')
  .row()
  .text('❌ Saya Tolak / I Decline', 'consent:decline')

// ─── Rejection keyboard ───────────────────────────────────────────────────────

const rejectionKeyboard = (language: 'id' | 'en') =>
  new InlineKeyboard()
    .text(language === 'id' ? '🔍 Lihat lowongan lain' : '🔍 See other jobs', 'rejection:browse')
    .row()
    .text(language === 'id' ? '👋 Tidak, terima kasih' : '👋 No thanks', 'rejection:exit')

// ─── Trigger consent ──────────────────────────────────────────────────────────

export async function triggerConfirmation(ctx: BotContext, appliedJob: string): Promise<void> {
  ctx.session.fsmState = FsmState.CONSENT
  ctx.session.appliedJob = appliedJob
  await ctx.reply(buildConsentMessage(lang(ctx)), {
    parse_mode: 'Markdown',
    reply_markup: consentKeyboard,
  })
}

// ─── Consent callbacks ────────────────────────────────────────────────────────

export async function handleConsentAgree(ctx: BotContext): Promise<void> {
  ctx.session.consentRecordedAt = new Date().toISOString()
  ctx.session.fsmState = FsmState.DATA_COLLECTION
  ctx.session.currentField = DATA_COLLECTION_FIELDS[0]
  // Reset application data from any previous attempt
  ctx.session.candidateData = {}
  ctx.session.files = {}
  await ctx.answerCallbackQuery()
  const l = lang(ctx)
  const intro = l === 'id'
    ? '✅ Terima kasih. Mari kita mulai.\n\n'
    : '✅ Thank you. Let\'s begin.\n\n'
  await ctx.reply(intro + getFieldPrompt(DATA_COLLECTION_FIELDS[0], l), { parse_mode: 'Markdown' })
}

export async function handleConsentDecline(ctx: BotContext): Promise<void> {
  ctx.session.fsmState = FsmState.CANDIDATE_ASKING
  ctx.session.appliedJob = null
  ctx.session.consentRecordedAt = null
  await ctx.answerCallbackQuery()
  const l = lang(ctx)
  await ctx.reply(
    l === 'id'
      ? '❌ Proses lamaran dibatalkan. Anda bisa kembali bertanya tentang lowongan kapan saja.'
      : '❌ Application cancelled. You can continue asking about jobs anytime.'
  )
}

// ─── Data collection ──────────────────────────────────────────────────────────

export async function handleDataCollection(ctx: BotContext): Promise<void> {
  const text = ctx.message?.text?.trim()
  if (!text) return

  const l = lang(ctx)
  const id = chatId(ctx)
  const field = ctx.session.currentField

  if (!field) {
    await ctx.reply(buildDataReview(ctx.session.candidateData, l), { parse_mode: 'Markdown' })
    return
  }

  const { valid } = validateField(field, text)
  if (!valid) {
    await ctx.reply(field === 'age' ? buildAgeError(l) : `⚠️ Mohon isi dengan benar.`)
    return
  }

  ctx.session.candidateData = applyField(ctx.session.candidateData, field, text)

  // Fire-and-forget Sheets partial save
  writeToSheets({
    chat_id: id,
    [field]: field === 'age' ? String(ctx.session.candidateData.age) : text.trim(),
    status: 'partial',
  }).catch((err) => logger.error({ chat_id: id, event: 'sheets_partial_save_error', err }))

  const next = nextField(field)
  ctx.session.currentField = next

  if (!next) {
    await ctx.reply(buildDataReview(ctx.session.candidateData, l), { parse_mode: 'Markdown' })
  } else {
    await ctx.reply(getFieldPrompt(next, l), { parse_mode: 'Markdown' })
  }
}

// ─── Data review reply ────────────────────────────────────────────────────────

export async function handleDataReviewReply(ctx: BotContext): Promise<void> {
  const text = ctx.message?.text?.trim().toLowerCase() ?? ''
  const l = lang(ctx)
  const YES = ['ya', 'yes', 'y', 'iya', 'ok', 'benar', 'correct']
  const NO = ['tidak', 'no', 'n', 'koreksi', 'correction', 'salah', 'wrong']

  if (YES.includes(text)) {
    ctx.session.fsmState = FsmState.FILE_UPLOAD
    await ctx.reply(getFilePrompt('ktp', l), { parse_mode: 'Markdown' })
  } else if (NO.includes(text)) {
    ctx.session.currentField = DATA_COLLECTION_FIELDS[0]
    ctx.session.candidateData = {}
    await ctx.reply(getFieldPrompt(DATA_COLLECTION_FIELDS[0], l), { parse_mode: 'Markdown' })
  } else {
    await ctx.reply(
      l === 'id'
        ? 'Ketik *ya* untuk lanjut atau *tidak* untuk koreksi.'
        : 'Type *yes* to continue or *no* to correct.',
      { parse_mode: 'Markdown' }
    )
  }
}

// ─── File upload ──────────────────────────────────────────────────────────────

function currentFileStep(files: FileUploads): FileStep | null {
  if (!files.ktpPath) return 'ktp'
  if (!files.photoPath) return 'photo'
  if (!files.cvPath) return 'cv'
  return null
}

export async function handleFileUpload(ctx: BotContext): Promise<void> {
  const l = lang(ctx)
  const id = chatId(ctx)
  const fileStep = currentFileStep(ctx.session.files)

  logger.info({ chat_id: id, event: 'file_upload_start', fileStep, files: ctx.session.files })

  if (!fileStep) {
    logger.warn({ chat_id: id, event: 'file_upload_no_step' })
    return
  }

  const doc = ctx.message?.document
  const photo = ctx.message?.photo

  let fileId: string, fileName: string, fileSize: number, mimeType: string | undefined

  if (doc) {
    fileId = doc.file_id
    fileName = doc.file_name ?? `${fileStep}.bin`
    fileSize = doc.file_size ?? 0
    mimeType = doc.mime_type
  } else if (photo?.length) {
    const largest = photo.at(-1)!
    fileId = largest.file_id
    fileName = `${fileStep}.jpg`
    fileSize = largest.file_size ?? 0
    mimeType = 'image/jpeg'
  } else {
    await ctx.reply(getFilePrompt(fileStep, l), { parse_mode: 'Markdown' })
    return
  }

  try {
    logger.info({ chat_id: id, event: 'file_downloading', fileStep, fileId })
    const result = await downloadAndSaveFile({ chatId: id, fileId, fileName, fileSize, mimeType, fileType: fileStep })

    if (!result.success) {
      await ctx.reply(`❌ ${result.error}`)
      return
    }

    logger.info({ chat_id: id, event: 'file_downloaded', fileStep, path: result.path })

    // Set local path immediately so flow continues
    if (fileStep === 'ktp') ctx.session.files.ktpPath = result.path
    else if (fileStep === 'photo') ctx.session.files.photoPath = result.path
    else ctx.session.files.cvPath = result.path

    // Upload to Google Drive (fire-and-forget — don't block the user)
    uploadToDrive(id, result.path, fileStep).catch((err) =>
      logger.error({ chat_id: id, event: 'drive_upload_bg_error', err })
    )

    const confirm = l === 'id' ? `✅ ${fileStep.toUpperCase()} diterima.` : `✅ ${fileStep.toUpperCase()} received.`
    const next = nextFileStep(fileStep)

    if (next) {
      await ctx.reply(confirm + '\n\n' + getFilePrompt(next, l), { parse_mode: 'Markdown' })
    } else {
      await ctx.reply(confirm)
      ctx.session.fsmState = FsmState.SCORING
      await runScoring(ctx)
    }
  } catch (err) {
    logger.error({ chat_id: id, event: 'file_upload_error', fileStep, err })
    await ctx.reply(
      l === 'id'
        ? '⚠️ Gagal memproses file. Silakan coba kirim ulang.'
        : '⚠️ Failed to process file. Please try sending again.'
    )
  }
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

async function runScoring(ctx: BotContext): Promise<void> {
  const id = chatId(ctx)
  const l = lang(ctx)
  const data = ctx.session.candidateData
  logger.info({ chat_id: id, event: 'scoring_start' })

  let passed = false

  try {
    const jobReqs = await lookupJobRequirements(ctx.session.appliedJob ?? '')
    logger.info({ chat_id: id, event: 'scoring_job_reqs', jobReqs })

    const result = scoreCandidate({
      candidateAge: data.age ?? 0,
      candidateEducation: data.education ?? '',
      candidateSimType: '',
      jobAgeRange: jobReqs.jobAgeRange,
      jobEducationMin: jobReqs.jobEducationMin,
      jobSimRequired: jobReqs.jobSimRequired,
    })

    const { score, failReason } = result
    passed = result.passed
    ctx.session.fsmState = passed ? FsmState.PASS : FsmState.FAIL

    writeToSheets({
      chat_id: id,
      name: data.name,
      age: String(data.age ?? ''),
      education: data.education,
      phone: data.phone,
      location: data.location,
      applied_job: ctx.session.appliedJob ?? '',
      score: String(score),
      status: passed ? 'qualified' : 'rejected',
      fail_reason: failReason,
      ktp_path: ctx.session.files.ktpPath,
      photo_path: ctx.session.files.photoPath,
      cv_path: ctx.session.files.cvPath,
    }).catch((err) => logger.error({ chat_id: id, event: 'sheets_final_save_error', err }))

    logger.info({ chat_id: id, event: 'scoring_done', score, passed })

    if (passed) {
      await ctx.reply(buildPassMessage(l, {
        postTest: jobReqs.postTest,
        recruiterName: jobReqs.recruiterName,
        recruiterNumber: jobReqs.recruiterNumber,
      }), { parse_mode: 'Markdown' })
    } else {
      await ctx.reply(buildFailMessage(l, failReason), {
        parse_mode: 'Markdown',
        reply_markup: rejectionKeyboard(l),
      })
    }
  } catch (err) {
    logger.error({ chat_id: id, event: 'scoring_error', err })
    await sendRecruiterNotification({ chatId: id, question: 'Scoring error during screening', language: l })
    const apology = l === 'id'
      ? '⚠️ Terjadi kesalahan teknis. Tim kami telah diberitahu.'
      : '⚠️ A technical error occurred. Our team has been notified.'
    await ctx.reply(apology)
    return
  }

  // ── Interview scheduling (isolated from scoring errors) ────────────────────
  if (passed) {
    const calendlyBase = env.CALENDLY_URL
    if (calendlyBase) {
      const candidateName = data.name ?? ''
      // Pre-fill name in Calendly + register for webhook matching
      const params = new URLSearchParams({
        utm_content: id,
        utm_campaign: ctx.session.appliedJob ?? '',
        name: candidateName,
      })
      const calendlyUrl = `${calendlyBase}?${params}`
      // Store name→chatId mapping so Calendly webhook can match the booking
      if (candidateName) {
        setPendingInterview(candidateName, id, ctx.session.appliedJob ?? '')
      }
      await ctx.reply(
        l === 'id'
          ? `📅 *Jadwalkan interview Anda:*\n\n👉 ${calendlyUrl}\n\nSilakan pilih waktu yang tersedia di link tersebut.`
          : `📅 *Schedule your interview:*\n\n👉 ${calendlyUrl}\n\nPlease pick an available time slot.`,
        { parse_mode: 'Markdown' }
      )
    } else {
      // Fallback: built-in scheduler
      try {
        await sendInterviewScheduler(ctx)
      } catch (err) {
        logger.error({ chat_id: id, event: 'interview_scheduler_error', err })
        await ctx.reply(
          l === 'id'
            ? '📅 Recruiter akan segera menghubungi Anda untuk menjadwalkan interview.'
            : '📅 The recruiter will contact you shortly to schedule the interview.'
        )
      }
    }
    ctx.session.fsmState = FsmState.CANDIDATE_ASKING
  }
}

// ─── Rejection callbacks ──────────────────────────────────────────────────────

export async function handleRejectionBrowse(ctx: BotContext): Promise<void> {
  ctx.session.fsmState = FsmState.CANDIDATE_ASKING
  ctx.session.candidateData = {}
  ctx.session.files = {}
  ctx.session.appliedJob = null
  ctx.session.currentField = null
  await ctx.answerCallbackQuery()
  const l = lang(ctx)
  await ctx.reply(
    l === 'id'
      ? '🔍 Silakan tanyakan lowongan yang Anda minati!'
      : '🔍 Please ask about the job openings you are interested in!'
  )
}

export async function handleRejectionExit(ctx: BotContext): Promise<void> {
  ctx.session.fsmState = FsmState.CANDIDATE_ASKING
  await ctx.answerCallbackQuery()
  await ctx.reply(buildFarewellMessage(lang(ctx)))
}
