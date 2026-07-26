-- "Cannot coerce the result to a single JSON object" on Save Profile:
-- profiles.update RLS only ever checked auth.uid() = id. But the Cross-
-- Channel Identity Merge feature redirects a merged account's session to
-- edit the PRIMARY profile it was merged into (see (protected)/layout.tsx's
-- effectiveUserId resolution) — so the row actually being updated has a
-- different id than auth.uid(), and the update silently matched zero rows
-- (PostgREST's .select().single() then throws on the empty result).
--
-- Confirmed live: profile 4e7aec58... (owns "Big Daddy Biz", real auth
-- session) has merged_into_id = a8f4fea7..., status = 'merged' — test data
-- from earlier merge-feature validation this session, but it exposed a
-- real, permanent gap: ANY legitimately merged account would hit this
-- same wall trying to edit their own name.
drop policy if exists "Users update own profile" on profiles;

create policy "Users update own profile"
  on profiles for update using (
    auth.uid() = id
    or id = (select merged_into_id from profiles where id = auth.uid())
  );
