/**
 * Interview schedule configuration.
 * Edit this file to change available days/hours.
 * The bot generates time slots based on these settings.
 */

export interface ScheduleConfig {
  /** Days of the week (0=Sunday, 1=Monday, ..., 6=Saturday) */
  availableDays: number[]
  /** Start hour (24h format) */
  startHour: number
  /** End hour (24h format, exclusive — last slot starts at endHour - slotDurationMinutes) */
  endHour: number
  /** Duration of each interview slot in minutes */
  slotDurationMinutes: number
  /** Timezone for display and calculation */
  timezone: string
  /** How many business days ahead to show slots */
  daysAhead: number
}

export const scheduleConfig: ScheduleConfig = {
  availableDays: [1, 2, 3, 4, 5], // Monday to Friday
  startHour: 9,                     // 9:00 AM
  endHour: 15,                      // last slot at 14:00 (3 PM exclusive)
  slotDurationMinutes: 60,          // 1-hour slots
  timezone: 'Asia/Jakarta',         // WIB
  daysAhead: 5,                     // show next 5 business days
}
