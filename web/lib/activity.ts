// lib/activity.ts
// Client-side helper for the Inactivity Re-Engagement / Daily Brief
// activity tracker. Call this from meaningful actions (viewing an invoice,
// saving a client, logging a transaction) — never from a plain page-load
// effect, since "loaded a page" isn't activity per the feature spec.
// Fire-and-forget: never blocks or fails the caller's own action.

export function touchActivity(): void {
  fetch('/api/activity/touch', { method: 'POST' }).catch(() => {})
}
