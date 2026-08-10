-- Reminder Archive/Restore/Delete/Edit lifecycle.
--
-- archived_at is DELIBERATELY separate from the existing `status` column
-- (which drives whether a reminder actually fires — 'active' | 'fired' |
-- 'dismissed'). Archiving must hide a reminder from the Active view
-- WITHOUT stopping a recurring reminder from firing on schedule — if
-- archiving flipped status away from 'active', bot/src/reminder-service.ts's
-- fireDueReminders() (which only processes status = 'active') would never
-- fire it again, silently ending the whole recurring series instead of
-- just hiding today's occurrence. So:
--   Active view  = status = 'active' and archived_at is null
--   Archive view = archived_at is not null (regardless of status)
--   Restore      = archived_at set back to null
--   Permanently delete = actual row delete (already supported)
-- For a recurring reminder, archived_at is cleared automatically the next
-- time it fires and rolls its due_date forward (see reminder-service.ts),
-- so "archive this occurrence" naturally stops hiding it once a new
-- occurrence begins — no separate cleanup job needed.
--
-- "Stop this recurring reminder" (a distinct action from Archive) sets
-- recurrence = 'once' so the existing fireDueReminders logic naturally
-- lets it fire (or not, if already archived) exactly once more and then
-- terminates via status = 'fired', instead of advancing forever.
alter table reminders add column if not exists archived_at timestamptz;

create index if not exists reminders_archived_idx on reminders (org_id, archived_at);
