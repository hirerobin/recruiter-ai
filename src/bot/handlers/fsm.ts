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
import { FsmState } from '../../types/candidate'
import { loadDataNeeds, validateAnswer, buildPrompt, type DataNeedQuestion } from '../../mastra/tools/data-needs'
import type { BotContext } from '../middleware/session'
import {
  buildConsentMessage,
  buildPassMessage, buildFailMessage, buildFarewellMessage,
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

/** In dev, returns chatId_timestamp so every new application creates a fresh Sheets row */
const getSheetsId = (ctx: BotContext) => ctx.session.devSheetsId ?? chatId(ctx)

// ─── File naming helpers ───────────────────────────────────────────────────────

const SLUG_STOP_WORDS = new Set([
  'upload', 'kirimkan', 'silakan', 'berikan', 'lampirkan', 'sertakan',
  'mohon', 'tolong', 'anda', 'dari', 'yang', 'untuk', 'dengan', 'ini',
  'file', 'dokumen', 'gambar', 'image', 'foto', 'photo', 'send',
])

function questionToSlug(question: string): string {
  const slug = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !SLUG_STOP_WORDS.has(w))
    .join('_')
    .slice(0, 40)
  return slug || 'file'
}

function extFromMime(mime?: string): string {
  if (!mime) return 'bin'
  if (mime.includes('pdf')) return 'pdf'
  if (mime.includes('png')) return 'png'
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('heic')) return 'heic'
  return 'bin'
}

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
  // Reset application data from any previous attempt
  ctx.session.candidateData = {}
  ctx.session.files = {}
  ctx.session.currentQuestionIndex = 0
  ctx.session.answers = {}
  ctx.session.currentField = null
  // Dev: stamp a unique Sheets key so every test run creates a new row
  ctx.session.devSheetsId = env.NODE_ENV !== 'production'
    ? `${chatId(ctx)}_${Date.now()}`
    : null
  await ctx.answerCallbackQuery()

  const questions = await loadDataNeeds()
  if (questions.length === 0) {
    await ctx.reply('⚠️ Tidak ada pertanyaan pendaftaran. Hubungi admin.')
    return
  }

  await ctx.reply('✅ Terima kasih. Mari kita mulai.', { parse_mode: 'HTML' })
  await askQuestion(ctx, questions, 0)
}

async function askQuestion(ctx: BotContext, questions: DataNeedQuestion[], index: number): Promise<void> {
  const q = questions[index]
  if (!q) return

  // If it's an Upload Docs question, switch to FILE_UPLOAD state
  if (q.type === 'Upload Docs') {
    ctx.session.fsmState = FsmState.FILE_UPLOAD
  }

  await ctx.reply(buildPrompt(q, index, questions.length), { parse_mode: 'HTML' })
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

  const id = chatId(ctx)
  const questions = await loadDataNeeds()
  const idx = ctx.session.currentQuestionIndex ?? 0
  const q = questions[idx]

  if (!q) {
    // Out of questions — finish data collection, go to scoring
    await finishDataCollection(ctx, questions)
    return
  }

  // Skip text input for Upload Docs — they're handled by file handler
  if (q.type === 'Upload Docs') {
    await ctx.reply(`⚠️ Pertanyaan ini membutuhkan upload file, bukan teks. Silakan kirim file.`)
    return
  }

  const { valid, error, parsed } = validateAnswer(q, text)
  if (!valid) {
    await ctx.reply(`⚠️ ${error}`)
    return
  }

  // Save answer
  ctx.session.answers[q.questionNumber] = parsed ?? text.trim()

  // Fire-and-forget Sheets partial save
  writeToSheets({
    chat_id: getSheetsId(ctx),
    [q.questionNumber]: parsed ?? text.trim(),
    status: 'partial',
  }).catch((err) => logger.error({ chat_id: id, event: 'sheets_partial_save_error', err }))

  const nextIdx = idx + 1
  ctx.session.currentQuestionIndex = nextIdx

  if (nextIdx >= questions.length) {
    await finishDataCollection(ctx, questions)
    return
  }

  await askQuestion(ctx, questions, nextIdx)
}

async function finishDataCollection(ctx: BotContext, questions: DataNeedQuestion[]): Promise<void> {
  // All questions done — trigger scoring
  ctx.session.fsmState = FsmState.SCORING
  await ctx.reply('✅ Semua data terkumpul. Memproses penilaian...', { parse_mode: 'HTML' })
  await runScoring(ctx)
}

// ─── Data review reply ────────────────────────────────────────────────────────

// handleDataReviewReply removed — review step no longer needed with dynamic collection.

// ─── File upload ──────────────────────────────────────────────────────────────

export async function handleFileUpload(ctx: BotContext): Promise<void> {
  const id = chatId(ctx)

  const questions = await loadDataNeeds()
  const idx = ctx.session.currentQuestionIndex ?? 0
  const q = questions[idx]

  if (!q) {
    logger.warn({ chat_id: id, event: 'file_upload_no_question', idx })
    return
  }

  if (q.type !== 'Upload Docs') {
    await ctx.reply(`⚠️ Pertanyaan ini butuh teks, bukan file. Silakan ketik jawaban Anda.`)
    return
  }

  const doc = ctx.message?.document
  const photo = ctx.message?.photo
  const fileSlug = questionToSlug(q.question)

  let fileId: string, fileName: string, fileSize: number, mimeType: string | undefined

  if (doc) {
    fileId = doc.file_id
    const origExt = doc.file_name?.split('.').pop() ?? extFromMime(doc.mime_type)
    fileName = `${fileSlug}.${origExt}`
    fileSize = doc.file_size ?? 0
    mimeType = doc.mime_type
  } else if (photo?.length) {
    const largest = photo.at(-1)!
    fileId = largest.file_id
    fileName = `${fileSlug}.jpg`
    fileSize = largest.file_size ?? 0
    mimeType = 'image/jpeg'
  } else {
    await ctx.reply(buildPrompt(q, idx, questions.length), { parse_mode: 'HTML' })
    return
  }

  try {
    logger.info({ chat_id: id, event: 'file_downloading', question: q.questionNumber, fileId })
    const result = await downloadAndSaveFile({ chatId: id, fileId, fileName, fileSize, mimeType, fileType: 'cv' })

    if (!result.success) {
      await ctx.reply(`❌ ${result.error}`)
      return
    }

    // Upload to Drive
    let filePath = result.path
    try {
      const driveResult = await uploadToDrive(id, result.path, 'cv')
      if (driveResult.success && driveResult.driveUrl) filePath = driveResult.driveUrl
    } catch (err) {
      logger.error({ chat_id: id, event: 'drive_upload_error', err })
    }

    // Save answer as file URL
    ctx.session.answers[q.questionNumber] = filePath
    writeToSheets({ chat_id: getSheetsId(ctx), [q.questionNumber]: filePath, status: 'partial' })
      .catch((err) => logger.error({ chat_id: id, event: 'sheets_partial_save_error', err }))

    await ctx.reply(`✅ File diterima.`)

    const nextIdx = idx + 1
    ctx.session.currentQuestionIndex = nextIdx

    if (nextIdx >= questions.length) {
      ctx.session.fsmState = FsmState.SCORING
      await ctx.reply('✅ Semua data terkumpul. Memproses penilaian...', { parse_mode: 'HTML' })
      await runScoring(ctx)
      return
    }

    // Next question — switch state if needed
    const nextQ = questions[nextIdx]!
    ctx.session.fsmState = nextQ.type === 'Upload Docs' ? FsmState.FILE_UPLOAD : FsmState.DATA_COLLECTION
    await askQuestion(ctx, questions, nextIdx)
  } catch (err) {
    logger.error({ chat_id: id, event: 'file_upload_error', err })
    await ctx.reply('⚠️ Gagal memproses file. Silakan coba kirim ulang.')
  }
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

/** Extract a specific field from dynamic answers by matching question keyword */
async function extractAnswer(ctx: BotContext, keyword: string): Promise<string> {
  const questions = await loadDataNeeds()
  const match = questions.find((q) => q.question.toLowerCase().includes(keyword.toLowerCase()))
  if (!match) return ''
  return ctx.session.answers?.[match.questionNumber] ?? ''
}

async function runScoring(ctx: BotContext): Promise<void> {
  const id = chatId(ctx)
  const l = lang(ctx)
  const answers = ctx.session.answers ?? {}
  logger.info({ chat_id: id, event: 'scoring_start', answer_count: Object.keys(answers).length })

  let passed = false

  try {
    const jobReqs = await lookupJobRequirements(ctx.session.appliedJob ?? '')
    logger.info({ chat_id: id, event: 'scoring_job_reqs', jobReqs })

    // Extract age/education from dynamic answers
    const nameAnswer = await extractAnswer(ctx, 'nama lengkap')
    const ageRaw = await extractAnswer(ctx, 'usia') || await extractAnswer(ctx, 'umur') || await extractAnswer(ctx, 'tanggal lahir')
    const educationAnswer = await extractAnswer(ctx, 'pendidika') || await extractAnswer(ctx, 'pendidikan')
    const phoneAnswer = await extractAnswer(ctx, 'nomor hp') || await extractAnswer(ctx, 'nomor telepon') || await extractAnswer(ctx, 'whatsapp')
    const locationAnswer = await extractAnswer(ctx, 'domisili') || await extractAnswer(ctx, 'alamat') || await extractAnswer(ctx, 'kota')

    // Parse age from date or direct number
    let age = 0
    if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(ageRaw)) {
      const parts = ageRaw.split(/[\/-]/)
      const year = parseInt(parts[2]!, 10)
      const fullYear = year < 100 ? 1900 + year : year
      age = new Date().getFullYear() - fullYear
    } else {
      age = parseInt(ageRaw, 10) || 0
    }

    const result = scoreCandidate({
      candidateAge: age,
      candidateEducation: educationAnswer,
      candidateSimType: '',
      jobAgeRange: jobReqs.jobAgeRange,
      jobEducationMin: jobReqs.jobEducationMin,
      jobSimRequired: jobReqs.jobSimRequired,
    })

    const { score, failReason } = result
    passed = result.passed
    ctx.session.fsmState = passed ? FsmState.PASS : FsmState.FAIL

    writeToSheets({
      chat_id: getSheetsId(ctx),
      name: nameAnswer,
      age: String(age),
      education: educationAnswer,
      phone: phoneAnswer,
      location: locationAnswer,
      applied_job: ctx.session.appliedJob ?? '',
      score: String(score),
      status: passed ? 'qualified' : 'rejected',
      fail_reason: failReason,
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

  const candidateName = await extractAnswer(ctx, 'nama lengkap')

  // ── AI Voice Interview (Mini App) ───────────────────────────────────────────
  if (passed && env.PUBLIC_URL) {
    const interviewParams = new URLSearchParams({
      chat_id: getSheetsId(ctx),
      job: ctx.session.appliedJob ?? '',
      name: candidateName,
      lang: l,
    })
    const interviewUrl = `${env.PUBLIC_URL}/interview?${interviewParams}`

    const aiInterviewKb = new InlineKeyboard()
      .webApp(
        l === 'id' ? '🎙 Mulai AI Interview' : '🎙 Start AI Interview',
        interviewUrl
      )

    await ctx.reply(
      l === 'id'
        ? '🎙 *Langkah berikutnya: AI Interview*\n\nSebelum interview dengan recruiter, silakan lakukan interview singkat dengan AI kami (5-10 menit).\n\n📌 *Tips sebelum mulai:*\n• Cari tempat yang tenang dan minim kebisingan\n• Pastikan sinyal internet stabil\n• Gunakan headset/earphone jika ada\n• Berbicara dengan jelas dan tidak terburu-buru\n\nSiap? Tekan tombol di bawah untuk memulai. 👇'
        : '🎙 *Next step: AI Interview*\n\nBefore the recruiter interview, please complete a short AI interview (5-10 minutes).\n\n📌 *Tips before starting:*\n• Find a quiet place with minimal background noise\n• Make sure your internet connection is stable\n• Use a headset/earphone if available\n• Speak clearly and at a steady pace\n\nReady? Tap the button below to begin. 👇',
      { parse_mode: 'Markdown', reply_markup: aiInterviewKb }
    )
  }

  // ── Calendly scheduling ────────────────────────────────────────────────────
  if (passed) {
    const calendlyBase = env.CALENDLY_URL
    if (calendlyBase) {
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
