'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

// Theme is two-state: 'night' (the existing dark editorial palette)
// or 'day' (the new warm cream + bronze palette).
//
// Resolution rules:
//   1. localStorage 'theme' if set ('day' or 'night')
//   2. otherwise, OS preference via prefers-color-scheme
//   3. fallback 'night' (the brand's primary expression)
//
// The active theme is reflected as a class on <html> ('theme-day' or
// 'theme-night') so every consumer of the CSS-variable palette switches
// in lockstep with no React render needed downstream.

export type Theme = 'day' | 'night'

interface ThemeContextValue {
  theme: Theme
  setTheme: (next: Theme) => void
  toggle: () => void
  /** True until the provider has read localStorage / OS pref on mount. */
  isHydrating: boolean
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const STORAGE_KEY = 'theclub:theme'

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used inside <ThemeProvider>')
  }
  return ctx
}

interface ThemeProviderProps {
  children: ReactNode
  /** Theme the inline boot script already applied to <html>. Lets the
   *  React-side state match what's painted on first render so the toggle
   *  doesn't briefly disagree with the screen. */
  initialTheme?: Theme
}

export function ThemeProvider({ children, initialTheme = 'night' }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(initialTheme)
  const [isHydrating, setIsHydrating] = useState(true)

  // Read persisted / OS preference once on mount, in case the inline
  // boot script didn't run (it should, but belt + braces).
  useEffect(() => {
    const stored = readStoredTheme()
    const resolved = stored ?? readSystemPreference() ?? 'night'
    applyTheme(resolved)
    setThemeState(resolved)
    setIsHydrating(false)
  }, [])

  // Listen for OS-level changes — only honour them if the user hasn't
  // expressed a preference (i.e. nothing in localStorage). Once they
  // hit the toggle, their choice wins until they clear it.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    function onChange(e: MediaQueryListEvent) {
      const stored = readStoredTheme()
      if (stored) return
      const next: Theme = e.matches ? 'day' : 'night'
      applyTheme(next)
      setThemeState(next)
    }
    // Safari < 14 used addListener; modern browsers use addEventListener.
    if (mq.addEventListener) {
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    }
    mq.addListener(onChange)
    return () => mq.removeListener(onChange)
  }, [])

  const setTheme = useCallback((next: Theme) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* private mode / quota — fine, theme just won't persist */
    }
    flashThemingWindow()
    applyTheme(next)
    setThemeState(next)
  }, [])

  const toggle = useCallback(() => {
    setTheme(theme === 'night' ? 'day' : 'night')
  }, [theme, setTheme])

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, toggle, isHydrating }),
    [theme, setTheme, toggle, isHydrating],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// ─── helpers (also used by the boot script via string interpolation) ──

function readStoredTheme(): Theme | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === 'day' || raw === 'night') return raw
  } catch {
    /* localStorage blocked — fine */
  }
  return null
}

function readSystemPreference(): Theme | null {
  if (typeof window === 'undefined' || !window.matchMedia) return null
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'day' : 'night'
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  const html = document.documentElement
  html.classList.remove('theme-day', 'theme-night')
  html.classList.add(theme === 'day' ? 'theme-day' : 'theme-night')
  html.dataset.theme = theme
}

// Brief window during which colour/background transitions fade across
// every element. The CSS rule `html.is-theming, html.is-theming *` in
// globals.css picks this up. Outside this window the rule is absent so
// component-level transitions (hover borders, modal opens, scroll
// reveals, etc.) keep their own timing without being clobbered.
let themingTimer: ReturnType<typeof setTimeout> | null = null
function flashThemingWindow() {
  if (typeof document === 'undefined') return
  const html = document.documentElement
  html.classList.add('is-theming')
  if (themingTimer) clearTimeout(themingTimer)
  themingTimer = setTimeout(() => {
    html.classList.remove('is-theming')
    themingTimer = null
  }, 320)
}

// ─── No-flash boot script ────────────────────────────────────────────
//
// Returned as a string so it can be injected directly into the document
// <head> via a <script dangerouslySetInnerHTML> tag in the root layout.
// Runs synchronously BEFORE React hydrates, so the user never sees a
// flash of the wrong palette.

export const THEME_BOOT_SCRIPT = `
(function () {
  try {
    var key = ${JSON.stringify(STORAGE_KEY)};
    var stored = null;
    try { stored = window.localStorage.getItem(key); } catch (_) {}
    var theme = (stored === 'day' || stored === 'night')
      ? stored
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'day' : 'night');
    var html = document.documentElement;
    html.classList.remove('theme-day', 'theme-night');
    html.classList.add(theme === 'day' ? 'theme-day' : 'theme-night');
    html.dataset.theme = theme;
  } catch (_) {
    document.documentElement.classList.add('theme-night');
    document.documentElement.dataset.theme = 'night';
  }
})();
`
