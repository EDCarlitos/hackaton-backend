import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'

/**
 * Ubicación en vivo del conductor de un viaje (GET /viajes/:id/ubicacion) con polling.
 * La ven el conductor y los pasajeros confirmados; solo pide datos con la pestaña visible.
 * Devuelve { ubicacion, compartiendo, ventana, error }.
 */
export function useUbicacionConductor(viajeId, { activo = true, intervaloMs = 5000 } = {}) {
  const [estado, setEstado] = useState({ ubicacion: null, compartiendo: false, ventana: null, error: null })

  useEffect(() => {
    if (!activo || !viajeId) return undefined
    let vivo = true
    const traer = () =>
      api
        .get(`/viajes/${viajeId}/ubicacion`)
        .then((r) => vivo && setEstado({ ...r, error: null }))
        .catch((error) => vivo && setEstado((e) => ({ ...e, error })))
    traer()
    const id = setInterval(() => document.visibilityState === 'visible' && traer(), intervaloMs)
    return () => {
      vivo = false
      clearInterval(id)
    }
  }, [viajeId, activo, intervaloMs])

  return estado
}

const CADA_MS = 10_000 // como máximo una actualización cada 10 s…
const O_SI_SE_MOVIO_M = 30 // …salvo que se haya movido más de 30 m
const LATIDO_MS = 15_000 // si está quieto, reenvía la última posición para que no se vea "vieja"
// Errores del API que significan "ya no se puede compartir" (los demás, como sin conexión, se reintentan).
const DEFINITIVOS = new Set(['FUERA_DE_HORARIO', 'VIAJE_NO_ACTIVO', 'NO_ES_CONDUCTOR', 'VIAJE_NO_ENCONTRADO'])

function metrosEntre(a, b) {
  const k = Math.cos((a.lat * Math.PI) / 180)
  return Math.hypot((b.lng - a.lng) * 111_320 * k, (b.lat - a.lat) * 110_540)
}

/**
 * El conductor comparte su ubicación mientras tenga la app abierta (RNF-03: nada en segundo plano).
 * Usa watchPosition y manda la posición a lo más cada 10 s (o antes si se movió > 30 m); si está
 * quieto (semáforo), reenvía la última cada 15 s. Solo se detiene si se niega el permiso, si el API
 * dice que ya no se puede, al tocar "Dejar de compartir" o al salir de la pantalla (y entonces se borra).
 */
export function useCompartirUbicacion(viajeId) {
  const [compartiendo, setCompartiendo] = useState(false)
  const [ultimaEnviada, setUltimaEnviada] = useState(null)
  const [error, setError] = useState(null)
  const vigilancia = useRef(null)
  const latido = useRef(null)
  const ultima = useRef(null) // última posición enviada: { lat, lng, precision, t }

  const soltarGps = () => {
    if (vigilancia.current !== null) navigator.geolocation.clearWatch(vigilancia.current)
    clearInterval(latido.current)
    vigilancia.current = null
    latido.current = null
    ultima.current = null
  }

  const enviar = useCallback(
    async (p) => {
      ultima.current = { ...p, t: Date.now() }
      try {
        await api.put(`/viajes/${viajeId}/ubicacion`, { lat: p.lat, lng: p.lng, precision_m: p.precision })
        setUltimaEnviada(new Date())
        setError(null)
      } catch (err) {
        setError(err.textoCompleto || err.message)
        if (DEFINITIVOS.has(err.codigo)) {
          soltarGps()
          setCompartiendo(false)
        }
      }
    },
    [viajeId],
  )

  const detener = useCallback(() => {
    const estaba = vigilancia.current !== null
    soltarGps()
    setCompartiendo(false)
    if (estaba) api.delete(`/viajes/${viajeId}/ubicacion`).catch(() => {})
  }, [viajeId])

  const iniciar = useCallback(() => {
    setError(null)
    if (!navigator.geolocation) return setError('Tu navegador no da la ubicación.')
    soltarGps()
    vigilancia.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const p = { lat: coords.latitude, lng: coords.longitude, precision: coords.accuracy }
        const previa = ultima.current
        if (previa && Date.now() - previa.t < CADA_MS && metrosEntre(previa, p) < O_SI_SE_MOVIO_M) return
        enviar(p)
      },
      (e) => {
        if (e.code === e.PERMISSION_DENIED) {
          soltarGps()
          setCompartiendo(false)
          setError('Sin permiso de ubicación. Actívalo en el navegador para compartirla.')
        } else {
          setError('Señal de GPS débil; seguimos intentando.') // sin cortar: puede volver sola
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000 }, // sin timeout: quieto no es un error
    )
    latido.current = setInterval(() => {
      const u = ultima.current
      if (u && Date.now() - u.t >= LATIDO_MS) enviar(u)
    }, 5000)
    setCompartiendo(true)
  }, [enviar])

  // Al salir de la pantalla se deja de compartir (y se borra la última posición).
  useEffect(() => detener, [detener])

  return { compartiendo, ultimaEnviada, error, iniciar, detener }
}

/** Fecha actual que se refresca cada `ms` (para textos tipo "hace 8 s" sin leer el reloj en el render). */
export function useAhora(ms = 1000) {
  const [ahora, setAhora] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), ms)
    return () => clearInterval(id)
  }, [ms])
  return ahora
}

/** "hace 8 s" / "hace 3 min". */
export function haceTexto(fecha, ahora) {
  const seg = Math.max(0, Math.round((ahora - new Date(fecha)) / 1000))
  return seg < 60 ? `hace ${seg} s` : `hace ${Math.round(seg / 60)} min`
}
