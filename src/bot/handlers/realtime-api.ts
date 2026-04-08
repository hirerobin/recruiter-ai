/**
 * API endpoints for the AI voice interview Mini App.
 *
 * POST /api/realtime/session  — Create ephemeral OpenAI Realtime token
 * POST /api/realtime/complete — Save interview transcript + generate summary
 * GET  /interview              — Serve the Mini App HTML
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { google } from 'googleapis'
import { env } from '../../config/env'
import { writeToSheets } from '../../mastra/tools/sheets-tool'
import { uploadToDrive } from '../../mastra/tools/drive-upload'
import { logger } from '../../logger'
import { bot } from '../index'

const INTERVIEW_HTML = readFileSync(join(import.meta.dir, '..', '..', 'web', 'interview.html'), 'utf8')

// ─── Fetch interview questions from Google Sheets ────────────────────────────

interface InterviewQuestion {
  category: string
  question: string
  purpose: string
  expectedAnswer: string
  redFlag: string
  position: string // "Semua", "Rider", "Driver", "Rider/Driver", etc.
}

async function fetchInterviewQuestions(): Promise<InterviewQuestion[]> {
  const spreadsheetId = env.GOOGLE_JOBS_SPREADSHEET_ID
  if (!spreadsheetId) return []

  try {
    const key = env.GOOGLE_PRIVATE_KEY.split('\\n').join('\n')
    const auth = new google.auth.JWT({
      email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    })
    const sheets = google.sheets({ version: 'v4', auth })
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'AI Interview Question!A2:G100', // skip header
    })

    return (res.data.values ?? [])
      .filter((r: string[]) => r[2]?.trim()) // must have a question
      .map((r: string[]): InterviewQuestion => ({
        category: r[1]?.trim() ?? '',
        question: r[2]?.trim() ?? '',
        purpose: r[3]?.trim() ?? '',
        expectedAnswer: r[4]?.trim() ?? '',
        redFlag: r[5]?.trim() ?? '',
        position: r[6]?.trim() ?? 'Semua',
      }))
  } catch (err) {
    logger.error({ event: 'fetch_interview_questions_error', err })
    return []
  }
}

// ─── Fetch candidate FAQ answers from Google Sheets ──────────────────────────

interface CandidateFAQ {
  question: string
  answer: string
  notes: string
}

async function fetchCandidateFAQ(): Promise<CandidateFAQ[]> {
  const spreadsheetId = env.GOOGLE_JOBS_SPREADSHEET_ID
  if (!spreadsheetId) return []

  try {
    const key = env.GOOGLE_PRIVATE_KEY.split('\\n').join('\n')
    const auth = new google.auth.JWT({
      email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    })
    const sheets = google.sheets({ version: 'v4', auth })
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'AI Interview Candidate Answer!A2:D100',
    })

    return (res.data.values ?? [])
      .filter((r: string[]) => r[1]?.trim())
      .map((r: string[]): CandidateFAQ => ({
        question: r[1]?.trim() ?? '',
        answer: r[2]?.trim() ?? '',
        notes: r[3]?.trim() ?? '',
      }))
  } catch (err) {
    logger.error({ event: 'fetch_candidate_faq_error', err })
    return []
  }
}

/** Filter questions relevant to the job position */
function filterQuestionsForJob(questions: InterviewQuestion[], job: string): InterviewQuestion[] {
  const jobLower = job.toLowerCase()
  const isRider = jobLower.includes('kurir') || jobLower.includes('rider')
  const isDriver = jobLower.includes('driver')

  return questions.filter((q) => {
    const pos = q.position.toLowerCase()
    if (pos === 'semua') return true
    if (isRider && (pos.includes('rider') || pos === 'semua')) return true
    if (isDriver && (pos.includes('driver') || pos === 'semua')) return true
    if (!isRider && !isDriver && pos === 'semua') return true
    return false
  })
}

// ─── AI interviewer instructions ─────────────────────────────────────────────

function buildInstructions(name: string, job: string, lang: string, questions: InterviewQuestion[], faq: CandidateFAQ[]): string {
  if (questions.length > 0) {
    // Group questions by category for structured flow
    const grouped = new Map<string, InterviewQuestion[]>()
    for (const q of questions) {
      const list = grouped.get(q.category) ?? []
      list.push(q)
      grouped.set(q.category, list)
    }

    let questionList = ''
    let num = 1
    for (const [category, qs] of grouped) {
      questionList += `\n  [${category}]\n`
      for (const q of qs) {
        questionList += `  ${num}. ${q.question.replace('{R.Nama}', name || 'kandidat')}\n`
        questionList += `     Tujuan: ${q.purpose}\n`
        questionList += `     Jawaban baik: ${q.expectedAnswer}\n`
        questionList += `     Red flag: ${q.redFlag}\n`
        num++
      }
    }

    // Build FAQ knowledge base for the "any questions?" phase
    let faqSection = ''
    if (faq.length > 0) {
      faqSection = '\n\nDATABASE JAWABAN UNTUK PERTANYAAN KANDIDAT:\n'
      faqSection += '(Gunakan informasi ini untuk menjawab jika kandidat bertanya)\n'
      for (const f of faq) {
        faqSection += `\nQ: ${f.question}\nA: ${f.answer}`
        if (f.notes) faqSection += `\n   Catatan: ${f.notes}`
        faqSection += '\n'
      }
    }

    return `Kamu adalah interviewer AI profesional untuk posisi ${job || 'umum'}.
Kandidat bernama ${name || 'kandidat'}.

ATURAN:
- Lakukan interview dalam Bahasa Indonesia
- Ikuti daftar pertanyaan di bawah secara berurutan per kategori
- Gunakan "Tujuan" untuk memahami apa yang kamu cari dari jawaban kandidat
- Gunakan "Jawaban baik" sebagai benchmark — jika kandidat menjawab sesuai, beri respons positif singkat
- Perhatikan "Red flag" — jika kandidat menunjukkan tanda ini, catat secara mental tapi JANGAN menghakimi atau menolak langsung
- Dengarkan jawaban kandidat dengan baik, berikan respons singkat sebelum pertanyaan berikutnya
- Jaga nada profesional namun ramah — seperti recruiter yang berpengalaman
- Jangan terlalu panjang berbicara — ini interview, bukan kuliah
- Jika kandidat tidak paham pertanyaan, jelaskan ulang dengan bahasa yang lebih sederhana

ALUR INTERVIEW:
1. Tanyakan semua PERTANYAAN INTERVIEW di bawah secara berurutan
2. Setelah SEMUA pertanyaan selesai, tanyakan: "Apakah ada yang ingin kamu tanyakan tentang posisi ini atau tentang perusahaan?"
3. Jika kandidat bertanya, jawab menggunakan DATABASE JAWABAN di bawah. Jika pertanyaannya tidak ada di database, jawab "Itu pertanyaan bagus, nanti recruiter kami akan menjelaskan lebih detail saat interview lanjutan."
4. Kandidat boleh bertanya beberapa kali. Setiap selesai menjawab, tanya lagi "Ada pertanyaan lain?"
5. Jika kandidat bilang tidak ada pertanyaan lagi, ucapkan terima kasih dan tutup interview

PERTANYAAN INTERVIEW:
${questionList}${faqSection}`
  }

  // Fallback: generic questions when sheet is empty
  if (lang === 'id') {
    // Build FAQ for fallback too
    let fallbackFaq = ''
    if (faq.length > 0) {
      fallbackFaq = '\n\nDATABASE JAWABAN:\n'
      for (const f of faq) {
        fallbackFaq += `Q: ${f.question}\nA: ${f.answer}\n`
      }
    }

    return `Kamu adalah interviewer AI profesional untuk posisi ${job || 'umum'}.
Kandidat bernama ${name || 'kandidat'}.

ATURAN:
- Lakukan interview dalam Bahasa Indonesia
- Mulai dengan sapaan hangat dan perkenalan singkat
- Tanyakan pertanyaan berikut secara berurutan:
  1. Ceritakan tentang diri Anda dan pengalaman kerja terakhir
  2. Mengapa Anda tertarik dengan posisi ${job || 'ini'}?
  3. Apa kelebihan utama yang bisa Anda kontribusikan?
  4. Bagaimana Anda menangani tekanan atau situasi sulit di tempat kerja?
  5. Kapan Anda bisa mulai bekerja?
- Dengarkan jawaban kandidat, berikan respons singkat sebelum pertanyaan berikutnya
- Setelah semua pertanyaan dijawab, tanyakan: "Apakah ada yang ingin kamu tanyakan?"
- Jawab pertanyaan kandidat menggunakan DATABASE JAWABAN di bawah jika tersedia
- Jika tidak ada di database, katakan recruiter akan menjelaskan lebih detail nanti
- Setelah kandidat tidak ada pertanyaan lagi, ucapkan terima kasih dan tutup interview
- Jaga nada profesional namun ramah${fallbackFaq}`
  }

  return `You are a professional AI interviewer for the ${job || 'general'} position.
The candidate's name is ${name || 'candidate'}.

RULES:
- Conduct the interview in English
- Start with a warm greeting and brief introduction
- Ask these questions in order:
  1. Tell me about yourself and your most recent work experience
  2. Why are you interested in the ${job || 'this'} position?
  3. What key strengths can you contribute?
  4. How do you handle pressure or difficult situations at work?
  5. When can you start?
- Listen to the candidate's answers, give brief acknowledgment before the next question
- After all questions are answered, ask: "Do you have any questions about the position or company?"
- Answer candidate questions using the FAQ database if available
- If not in database, say the recruiter will explain in more detail later
- After candidate has no more questions, thank them and close the interview
- Keep a professional but friendly tone`
}

// POST /api/realtime/session
export async function handleRealtimeSession(req: Request): Promise<Response> {
  let body: any
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Bad request' }, { status: 400 })
  }

  const { chat_id, job, name, lang } = body

  // Fetch interview questions + candidate FAQ from Google Sheets
  const [allQuestions, faq] = await Promise.all([fetchInterviewQuestions(), fetchCandidateFAQ()])
  const questions = filterQuestionsForJob(allQuestions, job ?? '')
  logger.info({ event: 'realtime_data_loaded', questions: questions.length, faq: faq.length, job })

  const instructions = buildInstructions(name ?? '', job ?? '', lang ?? 'id', questions, faq)

  try {
    const res = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview-2024-12-17',
        voice: 'coral',
        instructions,
        input_audio_transcription: { model: 'whisper-1' },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 700,
        },
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      logger.error({ event: 'realtime_session_error', status: res.status, err })
      return Response.json({ error: 'Failed to create session' }, { status: 500 })
    }

    const session = await res.json()
    logger.info({ event: 'realtime_session_created', chat_id })
    return Response.json(session)
  } catch (err) {
    logger.error({ event: 'realtime_session_error', err })
    return Response.json({ error: 'Internal error' }, { status: 500 })
  }
}

// POST /api/realtime/complete (FormData: chat_id, job, name, duration_seconds, transcript JSON, audio file)
export async function handleRealtimeComplete(req: Request): Promise<Response> {
  let chat_id: string, job: string, name: string, duration_seconds: number
  let transcript: { role: string; text: string }[]
  let audioFile: File | null = null

  try {
    const form = await req.formData()
    chat_id = form.get('chat_id') as string ?? ''
    job = form.get('job') as string ?? ''
    name = form.get('name') as string ?? ''
    duration_seconds = Number(form.get('duration_seconds') ?? 0)
    transcript = JSON.parse(form.get('transcript') as string ?? '[]')
    audioFile = form.get('audio') as File | null
  } catch {
    return Response.json({ error: 'Bad request' }, { status: 400 })
  }

  if (!chat_id || !transcript?.length) {
    return Response.json({ error: 'Missing data' }, { status: 400 })
  }

  const durationMin = Math.ceil(duration_seconds / 60)
  const transcriptText = transcript
    .map((t) => `${t.role === 'user' ? 'Kandidat' : 'AI'}: ${t.text}`)
    .join('\n')

  const summary = `AI Interview (${durationMin} min) — ${transcript.length} exchanges`
  let audioDriveUrl = ''

  logger.info({ event: 'realtime_complete', chat_id, job, duration: durationMin, exchanges: transcript.length, hasAudio: !!audioFile })

  // Save audio to local disk + Google Drive
  if (audioFile) {
    try {
      const dir = join('uploads', chat_id)
      mkdirSync(dir, { recursive: true })
      const localPath = join(dir, 'ai_interview.webm')
      const buffer = Buffer.from(await audioFile.arrayBuffer())
      writeFileSync(localPath, buffer)
      logger.info({ event: 'realtime_audio_saved', chat_id, path: localPath, size: buffer.length })

      // Upload to Google Drive
      const driveResult = await uploadToDrive(chat_id, localPath, 'cv') // reuse 'cv' type for any file
      if (driveResult.success) {
        audioDriveUrl = driveResult.driveUrl ?? ''
        logger.info({ event: 'realtime_audio_drive_uploaded', chat_id, url: audioDriveUrl })
      }
    } catch (err) {
      logger.error({ event: 'realtime_audio_save_error', chat_id, err })
    }
  }

  // Save to Google Sheets
  const notesWithAudio = audioDriveUrl
    ? `${summary}\nRecording: ${audioDriveUrl}\n\n${transcriptText}`
    : `${summary}\n\n${transcriptText}`

  try {
    await writeToSheets({ chat_id, status: 'qualified' }, { aiInterviewNotes: notesWithAudio })
    logger.info({ event: 'realtime_sheets_saved', chat_id })
  } catch (err) {
    logger.error({ event: 'realtime_sheets_error', chat_id, err })
  }

  // Notify candidate on Telegram
  try {
    const msg = `✅ *AI Interview selesai!*\n\n⏱ Durasi: ${durationMin} menit\n💬 ${transcript.length} pertanyaan & jawaban\n\nTerima kasih, ${name || 'kandidat'}! Recruiter akan menghubungi Anda.`
    await bot.api.sendMessage(chat_id, msg, { parse_mode: 'Markdown' })
  } catch (err) {
    logger.error({ event: 'realtime_notify_error', chat_id, err })
  }

  return Response.json({ success: true, summary, audioDriveUrl })
}

// GET /interview — serve Mini App HTML
export function serveInterviewPage(): Response {
  return new Response(INTERVIEW_HTML, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
