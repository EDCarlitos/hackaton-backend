// Polilínea codificada de Google (la misma que guarda el backend) y lugares de Cancún para elegir rápido.

/** Decodifica un "Encoded Polyline" a [{ lat, lng }]. */
export function decodificarPolilinea(texto = '') {
  const puntos = []
  let i = 0
  let lat = 0
  let lng = 0
  const leer = () => {
    let resultado = 0
    let shift = 0
    let b
    do {
      b = texto.charCodeAt(i++) - 63
      resultado |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    return resultado & 1 ? ~(resultado >> 1) : resultado >> 1
  }
  while (i < texto.length) {
    lat += leer()
    lng += leer()
    puntos.push({ lat: lat / 1e5, lng: lng / 1e5 })
  }
  return puntos
}

/**
 * Lugares frecuentes (aproximados, sin domicilios: RNF-03). Sirven sin llave de Google
 * y coinciden con las rutas de los datos demo del backend.
 */
export const LUGARES = [
  { id: 'ucaribe', texto: 'Universidad del Caribe', lat: 21.2004, lng: -86.8226 },
  { id: 'kabah', texto: 'Plaza Cancún 2000 (Av. Kabah)', lat: 21.1762, lng: -86.8492 },
  // Por aquí pasan las rutas a UCaribe desde SM 200, Mercado 28, Las Américas y Tajamar (datos demo).
  { id: 'centro', texto: 'Centro (Av. Tulum)', lat: 21.1716, lng: -86.8228 },
  { id: 'otoch', texto: 'Villas Otoch Paraíso', lat: 21.1826, lng: -86.8678 },
  { id: 'talleres', texto: 'Av. Talleres y Av. Kabah', lat: 21.1801, lng: -86.8592 },
  { id: 'r96', texto: 'Región 96', lat: 21.165, lng: -86.861 },
  { id: 'americas', texto: 'Plaza Las Américas', lat: 21.1472, lng: -86.8236 },
  { id: 'm28', texto: 'Mercado 28', lat: 21.1619, lng: -86.833 },
  { id: 'sm200', texto: 'Supermanzana 200', lat: 21.145, lng: -86.87 },
  { id: 'tajamar', texto: 'Malecón Tajamar', lat: 21.1564, lng: -86.818 },
  { id: 'pjuarez', texto: 'Puerto Juárez', lat: 21.183, lng: -86.8055 },
]

/** Colores de los marcadores del mapa (Google y esquema). */
export const COLORES_MAPA = {
  origen: '#191716',
  destino: '#f15156',
  recogida: '#a8a29e',
  abordaje: '#3c787e',
  lugar: '#a8a29e',
}

export const CENTRO_CANCUN = { lat: 21.1743, lng: -86.8466 }

export const redondear6 = (x) => Math.round(x * 1e6) / 1e6
