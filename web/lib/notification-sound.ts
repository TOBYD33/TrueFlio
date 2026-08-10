'use client'
// lib/notification-sound.ts
// Short notification chime, synthesized with the Web Audio API rather than
// an external MP3 — no licensed/on-brand audio asset was supplied for this
// feature (flagged explicitly in the build ticket), and grabbing a generic
// royalty-free file off the internet would be exactly the "improvised,
// generic-sounding" outcome the ticket asked to avoid. This is a soft,
// two-note ascending chime (Electric Violet-ish "bright but gentle" feel),
// well under a second, that a design/audio pass can swap for a produced
// asset later by replacing playNotificationChime()'s body.
//
// Respects browser autoplay restrictions: only ever attempts to play after
// the user has interacted with the page at least once this session. Always
// fails silently.
//
// BUG FIX: the AudioContext used to be created lazily, inside
// playNotificationChime() itself — which only ever runs from the async
// Supabase Realtime callback, never from inside the user gesture's own call
// stack. Some browsers (notably Safari, and increasingly Chrome) only
// reliably unlock a NEW AudioContext when it's created/resumed synchronously
// within a real user-gesture handler; creating it later from an unrelated
// async callback can leave it stuck suspended with no error thrown, which
// is exactly "no sound, nothing crashes" — indistinguishable from working
// as designed. Fix: create and resume the shared context eagerly, inside
// the interaction listener itself, so it's actually unlocked by the time a
// notification needs to play it.

let interacted = false

export function markUserInteracted() {
  interacted = true
}

export function hasUserInteracted() {
  return interacted
}

let sharedContext: AudioContext | null = null

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctx = window.AudioContext || (window as any).webkitAudioContext
  if (!Ctx) return null
  if (!sharedContext) sharedContext = new Ctx()
  return sharedContext
}

if (typeof window !== 'undefined') {
  const onFirstInteraction = () => {
    interacted = true
    const ctx = ensureContext()
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {})
    window.removeEventListener('pointerdown', onFirstInteraction)
    window.removeEventListener('keydown', onFirstInteraction)
  }
  window.addEventListener('pointerdown', onFirstInteraction, { once: true })
  window.addEventListener('keydown', onFirstInteraction, { once: true })
}

export function playNotificationChime() {
  if (!interacted) return
  try {
    const ctx = ensureContext()
    if (!ctx) return
    // Best-effort re-resume — a context can drift back to suspended (e.g.
    // after the tab was backgrounded for a while) even after the initial
    // gesture-time unlock.
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})

    const now = ctx.currentTime
    const notes: [number, number][] = [
      [880, now],        // A5
      [1318.5, now + 0.09], // E6
    ]

    for (const [freq, start] of notes) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.16, start + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.24)
    }
  } catch {
    // Never let a sound failure break the notification flow.
  }
}
