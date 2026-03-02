'use client'

export default function Tag({ theme = 'Secondary', click, children, styled = '' }) {
  const base =
    'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-semibold shadow-sm transition outline-none focus-visible:ring-2 focus-visible:ring-accent/30 active:scale-[0.98]'

  const themes = {
    Primary: 'border-accent/50 bg-accent text-black hover:opacity-90',
    Secondary: 'border-border/30 bg-surface/70 text-text hover:bg-surface',
    Transparent: 'border-transparent bg-transparent text-muted hover:bg-surface/50',
    Success: 'border-emerald-500/25 bg-emerald-500/12 text-emerald-700 hover:bg-emerald-500/18 dark:text-emerald-300',
  }

  return (
    <button type="button" className={`${base} ${themes[theme] || themes.Secondary} ${styled}`} onClick={click}>
      {children}
    </button>
  )
}








