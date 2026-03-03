'use client'

'use client'

export default function ImageUploadField({
  label,
  preview,
  placeholder = 'Sin imagen',
  buttonLabel = 'Cargar imagen',
  description,
  statusText,
  onSelect,
  onCancel,
  onRemove,
  onUndoRemove,
  catalogMode = false,
  actionText,
  inputRef = null,
}) {
  const hasPreview = Boolean(preview)

  if (catalogMode) {
    return (
      <div className="flex items-center gap-3">
        <div className="h-16 w-16 overflow-hidden rounded-2xl border border-border/25 bg-surface/40">
          {hasPreview ? (
            <img src={preview} alt={label ? `${label} existente` : 'Vista previa'} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[11px] text-muted">{placeholder}</div>
          )}
        </div>
        <div className="flex flex-col items-start gap-1">
          <label className="text-[12px] font-semibold text-accent underline-offset-2 cursor-pointer hover:text-accent/80">
            {buttonLabel}
            <input type="file" accept="image/*" className="sr-only" onChange={onSelect} ref={inputRef} />
          </label>
          {statusText ? <span className="text-[10px] text-muted">{statusText}</span> : null}
          {description ? <span className="text-[10px] text-muted">{description}</span> : null}
          {actionText ? <span className="text-[11px] font-semibold text-accent">{actionText}</span> : null}
        </div>
        {onCancel ? (
          <button type="button" className="text-[11px] text-muted underline-offset-2 hover:text-text" onClick={onCancel}>
            Cancelar
          </button>
        ) : null}
        {onRemove ? (
          <button type="button" className="text-[11px] text-rose-500 underline-offset-2 hover:text-rose-600" onClick={onRemove}>
            Quitar
          </button>
        ) : null}
        {onUndoRemove ? (
          <button type="button" className="text-[11px] text-accent underline-offset-2 hover:text-accent/80" onClick={onUndoRemove}>
            Deshacer
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-1 text-center">
      {label ? <div className="text-[11px] font-semibold text-text uppercase tracking-wide">{label}</div> : null}
      <div className="relative h-20 w-full max-w-[180px] overflow-hidden rounded-3xl border border-dashed border-border/60 bg-surface/60">
        {hasPreview ? (
          <img src={preview} alt={label ? `${label} existente` : 'Vista previa'} className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-[11px] text-muted">
            <span>{placeholder}</span>
          </div>
        )}
      </div>
      <label className="inline-flex cursor-pointer items-center justify-center rounded-2xl bg-white/80 px-3 py-1.5 text-[12px] font-semibold text-accent ring-1 ring-border/25 transition hover:bg-white">
        {buttonLabel}
        <input type="file" accept="image/*" className="sr-only" onChange={onSelect} ref={inputRef} />
      </label>
      {description ? <p className="text-[10px] text-muted">{description}</p> : null}
      <div className="flex flex-wrap justify-center gap-2">
        {onCancel ? (
          <button type="button" className="text-[11px] text-muted underline-offset-2 hover:text-text" onClick={onCancel}>
            Cancelar selección
          </button>
        ) : null}
        {onRemove ? (
          <button type="button" className="text-[11px] text-rose-500 underline-offset-2 hover:text-rose-600" onClick={onRemove}>
            Quitar
          </button>
        ) : null}
        {onUndoRemove ? (
          <button type="button" className="text-[11px] text-accent underline-offset-2 hover:text-accent/80" onClick={onUndoRemove}>
            Deshacer
          </button>
        ) : null}
      </div>
      {statusText ? <p className="text-[10px] text-muted">{statusText}</p> : null}
      {actionText ? <p className="text-[10px] font-semibold text-accent">{actionText}</p> : null}
    </div>
  )
}
