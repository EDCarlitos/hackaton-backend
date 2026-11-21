// Carga perezosa de Google Maps JavaScript API (solo si hay llave de navegador).
// La ruta NO se pide a Google desde aquí: llega ya calculada del backend (RF-07, RNF-06).

export const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''

let promesa = null

export function cargarGoogleMaps() {
  if (!GOOGLE_MAPS_KEY) return Promise.reject(new Error('Sin VITE_GOOGLE_MAPS_API_KEY'))
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps)
  if (!promesa) {
    promesa = new Promise((resolve, reject) => {
      const callback = '__rutacaribeMapsListo'
      window[callback] = () => resolve(window.google.maps)
      const script = document.createElement('script')
      script.src =
        'https://maps.googleapis.com/maps/api/js' +
        `?key=${encodeURIComponent(GOOGLE_MAPS_KEY)}&language=es&region=MX&loading=async&callback=${callback}`
      script.async = true
      script.onerror = () => {
        promesa = null
        reject(new Error('No se pudo cargar Google Maps'))
      }
      document.head.appendChild(script)
    })
  }
  return promesa
}

// Zona de Cancún donde se buscan direcciones (el autocompletado no sugiere nada fuera).
const CANCUN = { south: 21.02, west: -86.97, north: 21.27, east: -86.74 }

let places = null

/** Librería "places" (API nueva: AutocompleteSuggestion). Requiere Places API (New) en la llave. */
function cargarPlaces() {
  if (!places) {
    places = cargarGoogleMaps()
      .then((maps) => maps.importLibrary('places'))
      .catch((err) => {
        places = null
        throw err
      })
  }
  return places
}

/** Token de sesión: Google cobra por sesión (sugerencias + el lugar elegido), no por tecla. */
export async function nuevaSesionPlaces() {
  const { AutocompleteSessionToken } = await cargarPlaces()
  return new AutocompleteSessionToken()
}

// Tipos de Google que son una dirección con número (posible domicilio).
const TIPOS_DOMICILIO = new Set(['street_address', 'premise', 'subpremise'])

/**
 * Sugerencias de direcciones y lugares en Cancún para `texto`.
 * Devuelve [{ id, principal, secundario, domicilio, prediccion }].
 */
export async function sugerirLugares(texto, sesion) {
  const { AutocompleteSuggestion } = await cargarPlaces()
  const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input: texto,
    sessionToken: sesion,
    language: 'es',
    region: 'mx',
    includedRegionCodes: ['mx'],
    locationRestriction: CANCUN,
  })
  return suggestions
    .map((s) => s.placePrediction)
    .filter(Boolean)
    .map((p) => ({
      id: p.placeId,
      principal: p.mainText?.text || p.text.text,
      secundario: p.secondaryText?.text || '',
      domicilio: (p.types || []).some((t) => TIPOS_DOMICILIO.has(t)),
      prediccion: p,
    }))
}

/** Coordenadas del lugar sugerido (cierra la sesión de autocompletado). */
export async function ubicarSugerencia(sugerencia) {
  const lugar = sugerencia.prediccion.toPlace()
  await lugar.fetchFields({ fields: ['location'] })
  return { lat: lugar.location.lat(), lng: lugar.location.lng() }
}
