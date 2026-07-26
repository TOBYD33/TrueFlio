-- Lets a Super Admin elevate an active impersonation session to write
-- access (per the documented Two-Layer Permission spec: "Super Admin
-- impersonation defaults to read-only but can be elevated to write access
-- with an additional confirmation"). Until now impersonation_sessions.
-- is_write_enabled was written but never actually READ anywhere — nothing
-- granted a real write path, so even a super admin impersonating a user
-- got silently blocked by RLS (owner_id/org_members checks don't match
-- the ADMIN's real auth.uid(), only the impersonated target's).
--
-- has_write_impersonation() ties the bypass to a genuine active,
-- write-enabled session row for the CURRENT caller, scoped to the exact
-- org being impersonated — never a blanket "super admins can write
-- anywhere" grant.
create or replace function has_write_impersonation(p_org_id uuid)
returns boolean as $$
  select exists (
    select 1 from impersonation_sessions
    where admin_id = auth.uid()
      and target_org_id = p_org_id
      and is_active = true
      and is_write_enabled = true
  );
$$ language sql security definer stable;

drop policy if exists "Org owners and admins update their org" on organizations;
create policy "Org owners, admins, and write-enabled impersonation update their org"
  on organizations for update using (
    owner_id = auth.uid()
    or id in (
      select org_id from org_members
      where user_id = auth.uid() and role = 'admin' and removed_at is null
    )
    or has_write_impersonation(id)
  );
