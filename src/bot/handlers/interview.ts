/**
 * Interview scheduling handler.
 * Shows available time slots as inline keyboard buttons.
 * Books a slot in PostgreSQL and notifies the recruiter.
 */
import { InlineKeyboard } from 'grammy'
import { Pool } from 'pg'
import { env } from '../../config/env'
import { scheduleConfig } from '../../config/schedule'
import { sendRecruiterNotification } from '../../mastra/tools/notify-tool'
import { logger } from '../../logger'
import type { BotContext } from '../middleware/session'

const pool = new Pool({ connectionString: env.DATABASE_URL })

// ─── Slot generation ─────────────────────────────────────────────────────────

interface Slot {
  date: string   // YYYY-MM-DD
  time: string   // HH:MM
  label: string  // "Senin, 7 Apr 09:00"
}

const DAY_NAMES_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
const MONTH_NAMES_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des']

function generateSlots(): Slot[] {
  const { availableDays, startHour, endHour, slotDurationMinutes, daysAhead } = scheduleConfig
  const slots: Slot[] = []

  // Start from tomorrow
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)

  let daysFound = 0
  const cursor = new Date(tomorrow)

  while (daysFound < daysAhead) {
    if (availableDays.includes(cursor.getDay())) {
      const dateStr = cursor.toISOString().split('T')[0]!
      const dayName = DAY_NAMES_ID[cursor.getDay()]
      const monthName = MONTH_NAMES_ID[cursor.getMonth()]

      for (let hour = startHour; hour < endHour; hour++) {
        for (let min = 0; min < 60; min += slotDurationMinutes) {
          const timeStr = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`
          slots.push({
            date: dateStr!,
            time: timeStr,
            label: `${dayName}, ${cursor.getDate()} ${monthName} ${timeStr}`,
          })
        }
      }
      daysFound++
    }
    cursor.setDate(cursor.getDate() + 1)
  }

  return slots
}

async function getBookedSlots(dates: string[]): Promise<Set<string>> {
  if (!dates.length) return new Set()
  const result = await pool.query(
    `SELECT slot_date::text || '|' || slot_time::text AS key FROM interview_bookings WHERE slot_date = ANY($1)`,
    [dates]
  )
  return new Set(result.rows.map((r: { key: string }) => r.key))
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function sendInterviewScheduler(ctx: BotContext): Promise<void> {
  const l = ctx.session.language ?? 'id'
  const allSlots = generateSlots()
  const dates = [...new Set(allSlots.map((s) => s.date))]
  const booked = await getBookedSlots(dates)

  const available = allSlots.filter((s) => !booked.has(`${s.date}|${s.time}:00`))

  if (!available.length) {
    await ctx.reply(
      l === 'id'
        ? '⚠️ Tidak ada jadwal interview tersedia saat ini. Recruiter akan menghubungi Anda untuk penjadwalan.'
        : '⚠️ No interview slots available right now. The recruiter will contact you to schedule.'
    )
    return
  }

  const intro = l === 'id'
    ? '📅 *Pilih jadwal interview Anda:*\n_(Waktu WIB)_'
    : '📅 *Choose your interview slot:*\n_(Jakarta time)_'

  // Group slots by date, show max 3 days to keep keyboard manageable
  const keyboard = new InlineKeyboard()
  let currentDate = ''
  let slotsShown = 0

  for (const slot of available) {
    if (slotsShown >= 18) break // max 18 buttons (3 days × 6 slots)

    if (slot.date !== currentDate) {
      currentDate = slot.date
    }
    keyboard.text(slot.label, `interview:${slot.date}|${slot.time}`).row()
    slotsShown++
  }

  await ctx.reply(intro, { parse_mode: 'Markdown', reply_markup: keyboard })
}

export async function handleInterviewBooking(ctx: BotContext): Promise<void> {
  const data = ctx.callbackQuery?.data
  if (!data) return

  const match = data.replace('interview:', '')
  const [date, time] = match.split('|')
  if (!date || !time) return

  const chatId = String(ctx.chat!.id)
  const l = ctx.session.language ?? 'id'
  const name = ctx.session.candidateData?.name ?? 'Unknown'
  const job = ctx.session.appliedJob ?? ''

  await ctx.answerCallbackQuery()

  try {
    await pool.query(
      `INSERT INTO interview_bookings (chat_id, candidate_name, applied_job, slot_date, slot_time)
       VALUES ($1, $2, $3, $4, $5)`,
      [chatId, name, job, date, time]
    )
  } catch (err: any) {
    // Unique constraint violation = slot taken
    if (err.code === '23505') {
      await ctx.reply(
        l === 'id'
          ? '⚠️ Maaf, jadwal ini sudah diambil. Silakan pilih jadwal lain.'
          : '⚠️ Sorry, this slot was just taken. Please choose another.'
      )
      await sendInterviewScheduler(ctx)
      return
    }
    throw err
  }

  // Find day label for confirmation
  const slotDate = new Date(date + 'T00:00:00')
  const dayName = DAY_NAMES_ID[slotDate.getDay()]
  const monthName = MONTH_NAMES_ID[slotDate.getMonth()]
  const label = `${dayName}, ${slotDate.getDate()} ${monthName} ${time} WIB`

  const confirm = l === 'id'
    ? `✅ *Interview dijadwalkan!*\n\n📅 ${label}\n👤 ${name}\n💼 ${job}\n\nRecruiter akan menghubungi Anda. Sampai jumpa! 🎉`
    : `✅ *Interview scheduled!*\n\n📅 ${label}\n👤 ${name}\n💼 ${job}\n\nThe recruiter will contact you. See you! 🎉`

  await ctx.reply(confirm, { parse_mode: 'Markdown' })

  // Notify recruiter
  const recruiterMsg = `📅 Interview booked!\n\nCandidate: ${name} (${chatId})\nJob: ${job}\nSlot: ${label}`
  await sendRecruiterNotification({ chatId, question: recruiterMsg, language: l }).catch(() => {})

  logger.info({ chat_id: chatId, event: 'interview_booked', date, time, job })
}
