/** Chip de estado. `activo` (coral) para estados vigentes; gris para cerrados. */
export function StatusChip({ children, activo = true }) {
  return <span className={`status-chip ${activo ? '' : 'status-chip--off'}`}>{children}</span>
}
