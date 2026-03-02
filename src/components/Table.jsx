export default function Table({ variant = 'default', minWidth, style, className = '', children, ...props }) {
  const variants = {
    default:
      'w-full text-[13px] text-left text-muted rounded-md overflow-hidden bg-surface/30 backdrop-blur shadow-2xl shadow-black/20 ',
    bare: 'w-full text-left text-[13px]',
  }

  const resolvedStyle = {
    ...style,
    ...(minWidth !== undefined
      ? { minWidth: typeof minWidth === 'number' ? `${minWidth}px` : minWidth }
      : null),
  }

  return (
    <table className={`${variants[variant] || variants.default} ${className}`} style={resolvedStyle} {...props}>
      {children}
    </table>
  )
}

export function THead({ sticky = true, className = '', children, ...props }) {
  const base =
    'text-[11px] font-semibold uppercase tracking-wide text-thead-muted bg-thead-bg/70 backdrop-blur'
  const stickyStyles = sticky ? 'sticky top-0 z-10' : ''

  return (
    <thead className={`${stickyStyles} ${base} ${className}`} {...props}>
      {children}
    </thead>
  )
}
