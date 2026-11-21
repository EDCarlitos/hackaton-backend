// Opciones de "hora rápida" para buscar (pasajero) y para salir (conductor).

const MIN = 60_000

function mananaA(hora, minuto = 0) {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(hora, minuto, 0, 0)
  return d
}

/** Redondea hacia arriba a múltiplos de 5 min (las horas "redondas" se leen mejor). */
function redondear5(fecha) {
  const d = new Date(fecha)
  d.setSeconds(0, 0)
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5)
  return d
}

/** Opciones para buscar un viaje (pasajero). */
export const HORAS_BUSQUEDA = [
  { id: 'cualquiera', texto: 'Cualquier hora', calcular: () => null }, // todos los próximos (/viajes/proximos)
  { id: 'ahora', texto: 'Ahora', calcular: () => new Date() },
  { id: 'en1h', texto: 'En 1 h', calcular: () => redondear5(Date.now() + 60 * MIN) },
  { id: 'manana7', texto: 'Mañana 7:00', calcular: () => mananaA(7) },
]

/** Opciones para la salida de un viaje (conductor). */
export const HORAS_SALIDA = [
  { id: 'en15', texto: 'En 15 min', calcular: () => redondear5(Date.now() + 15 * MIN) },
  { id: 'en30', texto: 'En 30 min', calcular: () => redondear5(Date.now() + 30 * MIN) },
  { id: 'manana7', texto: 'Mañana 7:00', calcular: () => mananaA(7) },
]

/** Fecha que representa la elección `{ id, otra }` (otra = valor de datetime-local). */
export function resolverHora(opciones, valor) {
  if (valor.id === 'otra') return valor.otra ? new Date(valor.otra) : null
  return (opciones.find((o) => o.id === valor.id) || opciones[0]).calcular()
}

/** Orden de "Conductores disponibles": el que sale antes, o el que pasa más cerca de tu recogida. */
export const ORDENES = ['Más pronto', 'Más cercano']
