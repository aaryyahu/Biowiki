import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import '@/styles/globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-geist-sans',
})

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
      className={`${inter.variable} dark`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-[var(--color-bg)] font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
