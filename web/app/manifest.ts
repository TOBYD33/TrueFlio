// app/manifest.ts
// Next.js file convention — generates /manifest.webmanifest automatically.
// start_url points to /home, the actual logged-in landing page (root "/"
// just redirects there — see app/page.tsx) rather than "/", so an install
// from a logged-out state lands somewhere that immediately prompts login
// instead of bouncing through an extra redirect every launch.

import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TrueFlow',
    short_name: 'TrueFlow',
    description: 'Your true financial flow — AI-powered expense tracking and client CRM.',
    start_url: '/home',
    display: 'standalone',
    background_color: '#0A0A0F',
    theme_color: '#6C63FF',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
