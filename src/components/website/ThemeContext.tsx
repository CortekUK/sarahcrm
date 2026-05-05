'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

type ThemeMode = 'evening' | 'day'

/**
 * Palette tiers — each section declares whether it's "light", "warm", or "dark".
 * Both modes maintain alternation; evening mode uses two dark tones instead of light/dark.
 */
export const themeColors = {
  day: {
    light: {
      bg: '#FAFAF7',
      text: '#1A1714',
      textSecondary: '#2C2825',
      textMuted: '#6B6560',
      textDim: '#A09A93',
      border: '#E5E0D8',
      imageBorder: '#FAFAF7',
      overlay: 'rgba(26,23,20,0.4)',
      ctaOutlineText: 'rgba(26,23,20,0.6)',
      ctaOutlineBorder: 'rgba(26,23,20,0.15)',
    },
    warm: {
      bg: '#F3F0EA',
      text: '#1A1714',
      textMuted: '#6B6560',
      textDim: '#A09A93',
      border: '#E5E0D8',
    },
    dark: {
      bg: '#1C1917',
      text: '#FFFFFF',
      textMuted: 'rgba(255,255,255,0.6)',
      textDim: 'rgba(255,255,255,0.35)',
      border: 'rgba(255,255,255,0.1)',
      overlay: 'rgba(28,25,23,0.75)',
      overlayHeavy: '#1C1917',
    },
    accent: {
      bg: '#1C1917',
      text: '#FFFFFF',
      textMuted: 'rgba(255,255,255,0.5)',
      border: 'rgba(255,255,255,0.1)',
    },
  },
  evening: {
    light: {
      bg: '#1C1917',
      text: '#F5F5F0',
      textSecondary: 'rgba(255,255,255,0.8)',
      textMuted: 'rgba(255,255,255,0.55)',
      textDim: 'rgba(255,255,255,0.3)',
      border: 'rgba(255,255,255,0.08)',
      imageBorder: '#1C1917',
      overlay: 'rgba(28,25,23,0.5)',
      ctaOutlineText: 'rgba(255,255,255,0.6)',
      ctaOutlineBorder: 'rgba(255,255,255,0.15)',
    },
    warm: {
      bg: '#252220',
      text: '#F5F5F0',
      textMuted: 'rgba(255,255,255,0.55)',
      textDim: 'rgba(255,255,255,0.3)',
      border: 'rgba(255,255,255,0.08)',
    },
    dark: {
      bg: '#131110',
      text: '#FFFFFF',
      textMuted: 'rgba(255,255,255,0.5)',
      textDim: 'rgba(255,255,255,0.25)',
      border: 'rgba(255,255,255,0.06)',
      overlay: 'rgba(19,17,16,0.75)',
      overlayHeavy: '#131110',
    },
    accent: {
      bg: '#0D0C0A',
      text: '#FFFFFF',
      textMuted: 'rgba(255,255,255,0.45)',
      border: 'rgba(255,255,255,0.06)',
    },
  },
} as const

const ThemeContext = createContext<{
  mode: ThemeMode
  toggle: () => void
}>({
  mode: 'evening',
  toggle: () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('evening')
  const toggle = () => setMode((m) => (m === 'evening' ? 'day' : 'evening'))

  return (
    <ThemeContext.Provider value={{ mode, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
