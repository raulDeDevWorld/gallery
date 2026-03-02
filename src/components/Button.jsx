'use client'

export default function Button({ theme = 'Primary', styled = '', click, children, type, disabled = false }) {
  const buttonType = type || 'button'
  const isDisabled = Boolean(disabled) || theme === 'Disable'

  const base =
    'inline-flex items-center justify-center gap-2 font-semibold transition outline-none focus-visible:ring-2 focus-visible:ring-accent/35 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60'

  const full = 'w-full px-4 py-2.5 rounded-xl text-[14px] shadow-sm ring-1 ring-border/25'
  const mini = 'h-10 w-10 rounded-xl text-[16px] shadow-sm ring-1 ring-border/25'

  const variants = {
    Primary: `bg-[#00095F] text-white hover:bg-[#00107a]`,
    Secondary: `bg-surface/60 text-text hover:bg-surface`,
    Transparent: `bg-transparent text-text hover:bg-surface/40 ring-1 ring-border/20`,
    Success: `bg-emerald-500/14 text-emerald-700 hover:bg-emerald-500/18 ring-1 ring-emerald-500/25 dark:text-emerald-300`,
    Warning: `bg-amber-500/14 text-amber-700 hover:bg-amber-500/18 ring-1 ring-amber-500/25 dark:text-amber-300`,
    Danger: `bg-red-500/14 text-red-600 hover:bg-red-500/18 ring-1 ring-red-500/25`,
    Disable: `bg-surface-2/50 text-muted ring-1 ring-border/15`,
  }

  if (theme === 'Loading') {
    return (
      <button type={buttonType} className={`${base} ${full} ${variants.Disable} ${styled}`} onClick={click} disabled>
        <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 2a10 10 0 1010 10"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
        <span>En curso...</span>
      </button>
    )
  }

  if (theme === 'PrimaryPrint') {
    return (
      <button type={buttonType} className={`${base} ${full} ${variants.Primary} ${styled}`} onClick={click} disabled={isDisabled}>
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M7 9V3h10v6M7 17h10v4H7v-4ZM7 14h10M6 9h12a2 2 0 012 2v6H4v-6a2 2 0 012-2Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {children}
      </button>
    )
  }

  if (theme === 'SuccessBuy') {
    return (
      <button
        type={buttonType}
        className={`${base} ${full} bg-[#00095F] text-white hover:bg-[#00107a] ring-1 ring-[#00095F]/30 ${styled}`}
        onClick={click}
        disabled={isDisabled}
      >
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full ring-1 ring-white/25">
          <span className="text-[16px] font-bold">$</span>
        </span>
        {children}
      </button>
    )
  }

  if (theme === 'SuccessReceta') {
    return (
      <button
        type={buttonType}
        className={`${base} ${full} bg-emerald-500/18 text-text hover:bg-emerald-500/22 ring-1 ring-emerald-500/25 ${styled}`}
        onClick={click}
        disabled={isDisabled}
      >
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M12.727 5.455H3.636V3.636h9.091v1.819ZM16.364 13.104V20H0V0h16.364v3.26l4.922 4.922-4.922 4.922ZM1.818 18.182h12.727V5.818H1.818v12.364Z"
            fill="currentColor"
          />
        </svg>
        {children}
      </button>
    )
  }

  if (theme === 'MiniPrimary' || theme === 'MiniPrimaryComprar' || theme === 'MiniPrimaryInfo') {
    const isWide = theme === 'MiniPrimaryComprar' || theme === 'MiniPrimaryInfo'
    const size = isWide ? full : mini

    const icon = theme === 'MiniPrimaryInfo' ? (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 22a10 10 0 110-20 10 10 0 010 20Z"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path d="M12 10v7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M12 7h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      ) : null

    return (
      <button
        type={buttonType}
        className={`${base} ${size} bg-accent text-black hover:opacity-90 ring-1 ring-accent/25 ${styled}`}
        onClick={click}
        disabled={isDisabled}
      >
        {icon}
        {children}
      </button>
    )
  }

  if (theme === 'MiniSecondary') {
    return (
      <button type={buttonType} className={`${base} ${mini} bg-surface/60 text-text hover:bg-surface ${styled}`} onClick={click} disabled={isDisabled}>
        {children}
      </button>
    )
  }

  if (theme === 'MiniSuccess') {
    return (
      <button
        type={buttonType}
        className={`${base} ${mini} bg-emerald-500/18 text-emerald-700 hover:bg-emerald-500/22 ring-1 ring-emerald-500/25 dark:text-emerald-300 ${styled}`}
        onClick={click}
        disabled={isDisabled}
      >
        {children}
      </button>
    )
  }

  if (theme === 'MiniSuccessRecetar') {
    return (
      <button
        type={buttonType}
        className={`${base} ${full} bg-emerald-500/18 text-text hover:bg-emerald-500/22 ring-1 ring-emerald-500/25 ${styled}`}
        onClick={click}
        disabled={isDisabled}
      >
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M12.727 5.455H3.636V3.636h9.091v1.819ZM16.364 13.104V20H0V0h16.364v3.26l4.922 4.922-4.922 4.922ZM1.818 18.182h12.727V5.818H1.818v12.364Z"
            fill="currentColor"
          />
        </svg>
        {children}
      </button>
    )
  }

  const fallbackVariant = variants[theme] || variants.Primary
  const ring = theme === 'Transparent' ? '' : ''

  return (
    <button type={buttonType} className={`${base} ${full} ${fallbackVariant} ${ring} ${styled}`} onClick={click} disabled={isDisabled}>
      {children}
    </button>
  )
}
