'use client'

import { useUser } from '@/context'

function ThemeButton({ active, onClick, children, tone }) {
  const activeClass = active
    ? 'bg-accent text-black'
    : tone === 'sidebar'
      ? 'bg-transparent text-sidebar-text hover:bg-sidebar-bg'
      : 'bg-transparent text-text hover:bg-surface-2'

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'px-3 py-1.5 text-[12px] rounded-md transition-colors',
        activeClass,
      ].join(' ')}
    >
      {children}
    </button>
  )
}

export default function ThemeToggle({ className = '', tone = 'app' }) {
  const { theme, setTheme } = useUser()

  return (
    <div
      className={[
        'inline-flex items-center gap-1 rounded-lg border p-1',
        tone === 'sidebar'
          ? 'border-sidebar-border bg-sidebar-surface text-sidebar-text'
          : 'border-border bg-surface text-text',
        className,
      ].join(' ')}
    >
      <ThemeButton tone={tone} active={theme === 'light'} onClick={() => setTheme('light')}>Light</ThemeButton>
      <ThemeButton tone={tone} active={theme === 'neutral'} onClick={() => setTheme('neutral')}>Neutral</ThemeButton>
      <ThemeButton tone={tone} active={theme === 'dark'} onClick={() => setTheme('dark')}>Dark</ThemeButton>
      <span className={['ml-1 px-2 text-[11px] select-none', tone === 'sidebar' ? 'text-sidebar-muted' : 'text-muted'].join(' ')}>({theme})</span>
    </div>
  )
}
