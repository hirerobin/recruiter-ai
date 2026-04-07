-- Interview bookings table
-- Tracks scheduled interview slots to prevent double-booking
CREATE TABLE IF NOT EXISTS interview_bookings (
  id          SERIAL      PRIMARY KEY,
  chat_id     TEXT        NOT NULL,
  candidate_name TEXT,
  applied_job TEXT,
  slot_date   DATE        NOT NULL,
  slot_time   TIME        NOT NULL,
  booked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(slot_date, slot_time)  -- one booking per slot
);

CREATE INDEX IF NOT EXISTS idx_interview_bookings_date ON interview_bookings (slot_date);
CREATE INDEX IF NOT EXISTS idx_interview_bookings_chat ON interview_bookings (chat_id);
