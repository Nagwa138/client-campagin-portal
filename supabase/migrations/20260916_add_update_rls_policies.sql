-- RLS UPDATE policies for campaign_sends and campaigns.
--
-- Without these, Postgres silently returns 0 rows affected on any UPDATE
-- (no error, no exception) — RLS treats a missing policy as "deny all"
-- for that operation, which is indistinguishable at the application layer
-- from an UPDATE that matched zero rows legitimately.
--
-- The USING clause is checked against the existing row (can the caller see
-- and modify this row?). The WITH CHECK clause is checked against the new
-- values being written (is the caller allowed to write this state?).
-- Both must pass for the update to proceed.

create policy "sends_update_owner_only" on campaign_sends
  for update using (brand_id = auth_brand_id() and auth_role() = 'owner')
  with check (brand_id = auth_brand_id() and auth_role() = 'owner');

create policy "campaigns_update_owner_only" on campaigns
  for update using (brand_id = auth_brand_id() and auth_role() = 'owner')
  with check (brand_id = auth_brand_id() and auth_role() = 'owner');
