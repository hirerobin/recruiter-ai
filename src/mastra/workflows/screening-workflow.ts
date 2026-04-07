/**
 * Candidate screening FSM implemented as a Mastra workflow.
 *
 * States:
 *   CANDIDATE_ASKING → CONFIRMATION → CONSENT → DATA_COLLECTION
 *   → FILE_UPLOAD → SCORING → PASS | FAIL
 *
 * Each step returns a { reply, nextState } and the bot sends the reply
 * and persists the new state in the grammy session.
 */
import { FsmState, DATA_COLLECTION_FIELDS, type DataCollectionField, type CandidateData } from '../../types/candidate'

export interface StepResult {
  reply: string
  nextState: FsmState
}

// ─── Consent ───────────────────────────────────────────────────────────────

const CONSENT_TEXT: Record<string, string> = {
  id: `📋 *Persetujuan Data Pribadi (UU PDP)*\n\nUntuk melanjutkan proses lamaran, kami perlu mengumpulkan:\n• Nama lengkap\n• Usia\n• Pendidikan terakhir\n• Nomor telepon\n• Lokasi / domisili\n• Foto KTP\n• Pas foto\n• CV / Daftar Riwayat Hidup\n\n_Tujuan: hanya untuk proses seleksi rekrutmen. Data tidak akan dibagikan ke pihak ketiga._\n\nApakah Anda menyetujui?`,
  en: `📋 *Personal Data Consent (UU PDP)*\n\nTo proceed with your application, we need to collect:\n• Full name\n• Age\n• Education level\n• Phone number\n• Location / domicile\n• KTP photo (ID card)\n• Passport photo\n• CV / Resume\n\n_Purpose: recruitment screening only. Data will not be shared with third parties._\n\nDo you consent?`,
}

export function buildConsentMessage(language: 'id' | 'en'): string {
  return CONSENT_TEXT[language]
}

// ─── Data Collection ────────────────────────────────────────────────────────

const FIELD_PROMPTS: Record<DataCollectionField, Record<string, string>> = {
  name: {
    id: '👤 Siapa nama lengkap Anda?',
    en: '👤 What is your full name?',
  },
  age: {
    id: '🎂 Berapa usia Anda? (angka)',
    en: '🎂 How old are you? (number)',
  },
  education: {
    id: '🎓 Apa pendidikan terakhir Anda? (SD/SMP/SMA/SMK/D1/D2/D3/S1/S2/S3)',
    en: '🎓 What is your highest education level? (SD/SMP/SMA/SMK/D1/D2/D3/S1/S2/S3)',
  },
  phone: {
    id: '📱 Nomor telepon Anda? (cth: 08123456789)',
    en: '📱 Your phone number? (e.g. 08123456789)',
  },
  location: {
    id: '📍 Anda tinggal di kota/daerah mana?',
    en: '📍 What city / area do you live in?',
  },
}

const AGE_ERROR: Record<string, string> = {
  id: '⚠️ Mohon masukkan usia dalam angka, contoh: 25',
  en: '⚠️ Please enter your age as a number, e.g. 25',
}

export function getFieldPrompt(field: DataCollectionField, language: 'id' | 'en'): string {
  return FIELD_PROMPTS[field][language]
}

export function validateField(field: DataCollectionField, value: string): { valid: boolean; parsed?: unknown; errorKey?: string } {
  if (field === 'age') {
    const n = parseInt(value, 10)
    if (isNaN(n) || n < 14 || n > 99) return { valid: false, errorKey: 'age' }
    return { valid: true, parsed: n }
  }
  if (!value.trim()) return { valid: false, errorKey: field }
  return { valid: true, parsed: value.trim() }
}

export function applyField(data: CandidateData, field: DataCollectionField, value: string): CandidateData {
  if (field === 'age') return { ...data, age: parseInt(value, 10) }
  return { ...data, [field]: value.trim() }
}

export function nextField(current: DataCollectionField | null): DataCollectionField | null {
  if (!current) return DATA_COLLECTION_FIELDS[0]
  const idx = DATA_COLLECTION_FIELDS.indexOf(current)
  return DATA_COLLECTION_FIELDS[idx + 1] ?? null
}

export function buildDataReview(data: CandidateData, language: 'id' | 'en'): string {
  const lines = [
    language === 'id' ? '📝 *Ringkasan data Anda:*' : '📝 *Your data summary:*',
    `• ${language === 'id' ? 'Nama' : 'Name'}: ${data.name ?? '-'}`,
    `• ${language === 'id' ? 'Usia' : 'Age'}: ${data.age ?? '-'}`,
    `• ${language === 'id' ? 'Pendidikan' : 'Education'}: ${data.education ?? '-'}`,
    `• ${language === 'id' ? 'Telepon' : 'Phone'}: ${data.phone ?? '-'}`,
    `• ${language === 'id' ? 'Lokasi' : 'Location'}: ${data.location ?? '-'}`,
    '',
    language === 'id'
      ? 'Apakah data sudah benar? Ketik *ya* untuk lanjut atau *tidak* untuk koreksi.'
      : 'Is this correct? Type *yes* to continue or *no* to correct.',
  ]
  return lines.join('\n')
}

// ─── File Upload ─────────────────────────────────────────────────────────────

export type FileStep = 'ktp' | 'photo' | 'cv'
export const FILE_STEPS: FileStep[] = ['ktp', 'photo', 'cv']

const FILE_PROMPTS: Record<FileStep, Record<string, string>> = {
  ktp: {
    id: '🪪 Kirimkan foto *KTP* Anda (gambar JPG/PNG, maks 20MB):',
    en: '🪪 Please send your *ID card (KTP)* photo (JPG/PNG image, max 20MB):',
  },
  photo: {
    id: '🤳 Kirimkan *pas foto* Anda (gambar JPG/PNG, maks 20MB):',
    en: '🤳 Please send your *passport photo* (JPG/PNG image, max 20MB):',
  },
  cv: {
    id: '📄 Kirimkan *CV* Anda (PDF, Word, atau gambar, maks 20MB):',
    en: '📄 Please send your *CV/Resume* (PDF, Word, or image, max 20MB):',
  },
}

export function getFilePrompt(step: FileStep, language: 'id' | 'en'): string {
  return FILE_PROMPTS[step][language]
}

export function nextFileStep(current: FileStep | null): FileStep | null {
  if (!current) return FILE_STEPS[0]
  const idx = FILE_STEPS.indexOf(current)
  return FILE_STEPS[idx + 1] ?? null
}

// ─── Outcome messages ─────────────────────────────────────────────────────────

export function buildPassMessage(
  language: 'id' | 'en',
  opts: { postTest?: string; recruiterName?: string; recruiterNumber?: string }
): string {
  const { postTest, recruiterName, recruiterNumber } = opts
  if (language === 'id') {
    return [
      '🎉 *Selamat! Anda memenuhi kualifikasi!*',
      '',
      'Langkah selanjutnya:',
      postTest ? `📝 Post Test: ${postTest}` : '',
      recruiterName ? `👤 Recruiter: ${recruiterName}` : '',
      recruiterNumber ? `📞 Kontak: ${recruiterNumber}` : '',
    ].filter(Boolean).join('\n')
  }
  return [
    '🎉 *Congratulations! You qualify!*',
    '',
    'Next steps:',
    postTest ? `📝 Post Test: ${postTest}` : '',
    recruiterName ? `👤 Recruiter: ${recruiterName}` : '',
    recruiterNumber ? `📞 Contact: ${recruiterNumber}` : '',
  ].filter(Boolean).join('\n')
}

export function buildFailMessage(language: 'id' | 'en', failReason?: string): string {
  if (language === 'id') {
    return [
      '😔 *Maaf, Anda belum memenuhi kualifikasi untuk posisi ini.*',
      failReason ? `\nAlasan: ${failReason}` : '',
      '',
      'Jangan menyerah! Apakah Anda ingin melihat lowongan lain yang mungkin lebih sesuai?',
    ].join('\n')
  }
  return [
    '😔 *Sorry, you do not meet the qualifications for this position.*',
    failReason ? `\nReason: ${failReason}` : '',
    '',
    "Don't give up! Would you like to see other job openings that may be a better fit?",
  ].join('\n')
}

export function buildFarewellMessage(language: 'id' | 'en'): string {
  return language === 'id'
    ? '👋 Terima kasih sudah mencoba. Semoga sukses! Ketik /start kapan saja untuk memulai kembali.'
    : '👋 Thank you for trying. Good luck! Type /start anytime to start again.'
}

export function buildAgeError(language: 'id' | 'en'): string {
  return AGE_ERROR[language]
}
