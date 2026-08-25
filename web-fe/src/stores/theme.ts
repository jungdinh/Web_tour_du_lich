import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark'

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)
        ? 'dark'
        : 'light',
      setTheme: (theme: Theme) => {
        if (typeof document !== 'undefined') {
          document.documentElement.setAttribute('data-theme', theme)
        }
        set({ theme })
      },
      toggleTheme: () => {
        const nextTheme = get().theme === 'light' ? 'dark' : 'light'
        if (typeof document !== 'undefined') {
          document.documentElement.setAttribute('data-theme', nextTheme)
        }
        set({ theme: nextTheme })
      },
    }),
    {
      name: 'tourai-theme-storage',
      onRehydrateStorage: () => (state) => {
        if (state && typeof document !== 'undefined') {
          document.documentElement.setAttribute('data-theme', state.theme)
        }
      },
    }
  )
)
