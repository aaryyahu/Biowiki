import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Primary teal/green palette
        bio: {
          50:  '#e8faf4',
          100: '#c3f0df',
          200: '#8ee3c4',
          300: '#52cfa3',
          400: '#1D9E75', // primary
          500: '#158a63',
          600: '#0f6e50',
          700: '#0a5240',
          800: '#073830',
          900: '#041f1b',
        },
        // Neutral dark palette
        dark: {
          50:  '#f0f0ee',
          100: '#d4d3cf',
          200: '#b0afa9',
          300: '#8a8982',
          400: '#66655e',
          500: '#45443e',
          600: '#2e2d28',
          700: '#1e1d19',
          800: '#131210',
          900: '#0a0909',
        },
        // Accent amber for warnings/highlights
        amber: {
          400: '#f59e0b',
          500: '#d97706',
        },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
        display: ['var(--font-geist-sans)', 'ui-sans-serif'],
      },
      backgroundImage: {
        'grid-pattern': `
          linear-gradient(rgba(29,158,117,0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(29,158,117,0.04) 1px, transparent 1px)
        `,
      },
      backgroundSize: {
        'grid': '32px 32px',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out forwards',
        'slide-up': 'slideUp 0.5s ease-out forwards',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '16px',
      },
    },
  },
  plugins: [],
}

export default config
