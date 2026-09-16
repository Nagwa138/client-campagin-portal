-- Adds reported performance metrics to the campaigns table.
-- These columns are populated from the historical CSVs by the import script.
-- Newly-created campaigns (via the send flow) will have NULL values here;
-- the UI should treat NULL as "—" rather than 0 to avoid implying zero performance.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS reported_sent      integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reported_delivered integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reported_bounced   integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reported_opens     integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reported_clicks    integer DEFAULT NULL;
