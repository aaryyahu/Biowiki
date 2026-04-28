import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import '@/styles/globals.css'

export const metadata: Metadata = {
  title: {
    default: 'BioWiki — AI-powered biohacking knowledge base',
    template: '%s · BioWiki',
  },
  description:
    'Evidence-based articles on nootropics, longevity protocols, and biohacking — generated from peer-reviewed research by Claude AI.',
  keywords: ['biohacking', 'nootropics', 'longevity', 'supplements', 'cognitive enhancement'],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: process.env.NEXT_PUBLIC_APP_URL,
    siteName: 'BioWiki',
  },
  robots: { index: true, follow: true },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} dark`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-[var(--color-bg)] font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
