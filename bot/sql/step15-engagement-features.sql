-- Schema for Feature 1 (Inactivity Re-Engagement) and Feature 2 (Daily
-- Brief). See bot/src/engagement-service.ts / bot/src/daily-brief-service.ts
-- for how these are used.

-- Activity tracking — updated by ANY meaningful action (WhatsApp message,
-- in-app chat message, or a meaningful web dashboard action), not just login.
alter table profiles add column if not exists last_active_at timestamptz default now();

-- Re-engagement cycle state. reengagement_stage: 0 = not currently in a
-- nudge cycle (user is active or hasn't lapsed yet), 1 = 24h nudge sent,
-- 2 = 3d nudge sent, 3 = 7d nudge sent, 4+ = N monthly nudges sent since.
-- reengagement_stage_at = when that stage's nudge fired, used to compute
-- the next threshold. Resets to 0 the moment the user becomes active again.
alter table profiles add column if not exists reengagement_stage int not null default 0;
alter table profiles add column if not exists reengagement_stage_at timestamptz;

-- Daily Brief: last local calendar date (YYYY-MM-DD string, per the user's
-- own timezone via lib/timezone's dateStrInTimezone) it was sent — prevents
-- double-send if the hourly check job runs more than once inside their
-- local send window.
alter table profiles add column if not exists last_daily_brief_date text;

-- Notification preferences — two INDEPENDENT toggles, both default enabled.
-- Neither affects real transactional notifications (reminders firing,
-- invoice confirmations, etc.), which always send regardless.
alter table profiles add column if not exists reengagement_enabled boolean not null default true;
alter table profiles add column if not exists daily_brief_enabled boolean not null default true;

-- In-app Tello chat: supports a proactive (AI-initiated, no preceding user
-- message) row and an unread indicator for it. read_at stays null until
-- the user opens the chat bubble; is_proactive distinguishes a nudge from
-- an ordinary assistant reply (which is always already "read" since the
-- user is actively chatting when it arrives).
alter table whatsapp_conversations add column if not exists is_proactive boolean not null default false;
alter table whatsapp_conversations add column if not exists read_at timestamptz;
