-- The only existing UPDATE policy on organizations was owner-only, but the
-- documented Two-Layer Permission spec says Admin "can do everything Owner
-- can except cancel/change subscription, delete the org, demote the owner,
-- or access billing settings" — editing the business name/logo/type is
-- none of those, so Admins should be able to save changes on
-- /settings/business too. Under the owner-only policy, a non-owner admin
-- editing that page got a silent false-positive "success" (Supabase
-- reports 0-rows-matched as success, not an error, when RLS excludes the
-- row) while nothing was actually saved — this is very likely the "editing
-- business name doesn't save" bug being reported.
drop policy if exists "Org owners update their org" on organizations;

create policy "Org owners and admins update their org"
  on organizations for update using (
    owner_id = auth.uid()
    or id in (
      select org_id from org_members
      where user_id = auth.uid() and role = 'admin' and removed_at is null
    )
  );
