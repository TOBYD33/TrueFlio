import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })

export const metadata: Metadata = {
  title: 'TrueFlow — Financial Dashboard',
  description: 'Your true financial flow.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    // iOS Safari ignores the web manifest for install metadata — these
    // meta tags are what actually drive "Add to Home Screen" there.
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'TrueFlow',
  },
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#6C63FF',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  )
}
