-- Adds a cursor column to campaign_sends so the poll-events route can resume
-- pagination from where it left off, rather than re-deriving a position from
-- message_events.event_at (which is unreliable when events arrive out of order).
ALTER TABLE campaign_sends
  ADD COLUMN IF NOT EXISTS last_event_cursor TEXT DEFAULT NULL;
