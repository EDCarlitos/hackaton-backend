import { CircleAlert, LoaderCircle } from 'lucide-react'

/** Error del API (ApiError) o cualquier Error, en una caja visible. */
export function ErrorBanner({ error, className = '' }) {
  if (!error) return null
  const texto = typeof error === 'string' ? error : error.textoCompleto || error.message
  return (
    <p role="alert" className={`flex items-start gap-2 rounded-xl bg-coral/10 p-3 text-sm text-ink ${className}`}>
      <CircleAlert size={18} className="mt-px shrink-0 text-coral" />
      <span>{texto}</span>
    </p>
  )
}

export function Loading({ texto = 'Cargando…' }) {
  return (
    <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
      <LoaderCircle size={18} className="animate-spin" /> {texto}
    </p>
  )
}

export function Empty({ children }) {
  return <p className="rounded-2xl bg-surface p-5 text-center text-sm text-muted">{children}</p>
}

/** Clases comunes para inputs de formulario. */
export const inputClass = 'mt-2 block h-11 w-full min-w-0 rounded-xl border border-line bg-white px-3 text-sm font-normal outline-none'
