/**
 * Chip de estado. `tono`: 'coral' (en marcha o pendiente), 'teal' (confirmado / listo)
 * o 'gris' (cerrado). Usa `tonoEstado(estado)` de lib/format para elegirlo.
 */
export function StatusChip({ children, tono = 'coral' }) {
  return <span className={`status-chip ${tono === 'coral' ? '' : `status-chip--${tono}`}`}>{children}</span>
}
