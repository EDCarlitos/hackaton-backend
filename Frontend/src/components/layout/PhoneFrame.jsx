/** Contenedor con forma de teléfono que envuelve cada pantalla. */
export function PhoneFrame({ children, className = '' }) {
  return <main className={`phone ${className}`}>{children}</main>
}
