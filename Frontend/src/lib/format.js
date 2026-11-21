// Formato de datos del API para la interfaz (en español, hora local del navegador).

const hora = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })
const diaCorto = new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })

export const formatHora = (iso) => hora.format(new Date(iso))

/** "Hoy", "Mañana", "Ayer" o "sáb, 21 nov". */
export function formatDia(iso) {
  const fecha = new Date(iso)
  const hoy = new Date()
  const dias = Math.round((inicioDelDia(fecha) - inicioDelDia(hoy)) / 86_400_000)
  if (dias === 0) return 'Hoy'
  if (dias === 1) return 'Mañana'
  if (dias === -1) return 'Ayer'
  return diaCorto.format(fecha)
}

const inicioDelDia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

export const formatDiaHora = (iso) => `${formatDia(iso)} · ${formatHora(iso)}`

/** Rango salida–llegada estimada con la duración de la ruta. */
export function formatRangoHora(iso, duracionMin) {
  if (!duracionMin) return formatHora(iso)
  const llegada = new Date(new Date(iso).getTime() + duracionMin * 60_000)
  return `${formatHora(iso)} – ${formatHora(llegada)}`
}

export const formatMetros = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`)

export const formatCosto = (c) => (c === null || c === undefined ? 'Sin costo indicado' : `$${Number(c).toFixed(0)} de referencia`)

/** Versión corta para tarjetas: "$18" o "Sin costo". */
export const formatCostoCorto = (c) => (c === null || c === undefined ? 'Sin costo' : `$${Number(c).toFixed(0)}`)

export const formatRuta = (origen, destino) => `${origen?.texto || 'Origen'} → ${destino?.texto || 'Destino'}`

export const ESTADO_VIAJE = {
  abierto: 'Abierto',
  lleno: 'Lleno',
  en_curso: 'En curso',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
}

export const ESTADO_RESERVA = {
  solicitada: 'Solicitud enviada',
  confirmada: 'Confirmada',
  rechazada: 'Rechazada',
  cancelada: 'Cancelada',
  completada: 'Completada',
  expirada: 'Expirada',
}

/** Tono del chip de estado: los activos van en coral, los cerrados en gris. */
export const esEstadoActivo = (estado) => ['abierto', 'lleno', 'en_curso', 'solicitada', 'confirmada'].includes(estado)

/** Valor para <input type="datetime-local"> en hora local. */
export function aInputFechaHora(fecha) {
  const d = new Date(fecha)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "2026-11-21T07:30" (hora local) → ISO con zona, como lo pide el API. */
export const deInputFechaHora = (valor) => new Date(valor).toISOString()

/** HH:MM local de una fecha. */
export const aHoraHHMM = (fecha) => aInputFechaHora(fecha).slice(11, 16)

export function saludo(fecha = new Date()) {
  const h = fecha.getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}
