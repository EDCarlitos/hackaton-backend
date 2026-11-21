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
