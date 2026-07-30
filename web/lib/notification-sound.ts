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
// the user has interacted with the page at least once this session — see
// markUserInteracted()/hasUserInteracted() below. Always fails silently.

let interacted = false

export function markUserInteracted() {
  interacted = true
}

export function hasUserInteracted() {
  return interacted
}

if (typeof window !== 'undefined') {
  const onFirstInteraction = () => {
    interacted = true
    window.removeEventListener('pointerdown', onFirstInteraction)
    window.removeEventListener('keydown', onFirstInteraction)
  }
  window.addEventListener('pointerdown', onFirstInteraction, { once: true })
  window.addEventListener('keydown', onFirstInteraction, { once: true })
}

let sharedContext: AudioContext | null = null

export function playNotificationChime() {
  if (!interacted) return
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext
    if (!Ctx) return
    if (!sharedContext) sharedContext = new Ctx()
    const ctx = sharedContext
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
