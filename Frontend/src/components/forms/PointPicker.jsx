import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, LocateFixed, Map as MapIcon, MapPin, Search, X } from 'lucide-react'
import { LUGARES, redondear6 } from '../../lib/geo'
import { GOOGLE_MAPS_KEY, nuevaSesionPlaces, sugerirLugares, ubicarSugerencia } from '../../lib/googleMaps'
import { RouteMap } from '../map/RouteMap'

const R_TIERRA = 6371000
const ESPERA_MS = 300 // debounce del autocompletado (RNF-06)
const MIN_LETRAS = 3

const distanciaM = (a, b) => {
  const k = Math.cos((a.lat * Math.PI) / 180)
  const dx = ((b.lng - a.lng) * Math.PI * R_TIERRA * k) / 180
  const dy = ((b.lat - a.lat) * Math.PI * R_TIERRA) / 180
  return Math.hypot(dx, dy)
}

const normalizar = (s) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

// Texto aproximado para un punto elegido a mano (RNF-03: nunca el domicilio exacto).
function textoAproximado(p) {
  const cercano = LUGARES.map((l) => ({ l, d: distanciaM(p, l) })).sort((a, b) => a.d - b.d)[0]
  return cercano && cercano.d < 600 ? `Cerca de ${cercano.l.texto}` : 'Punto elegido en el mapa'
}

// Con `privado`, una dirección con número se guarda como "Cerca de <colonia>" (RNF-03).
function textoDeSugerencia(s, privado) {
  if (privado && s.domicilio) {
    const zona = s.secundario.split(',')[0]?.trim()
    return zona ? `Cerca de ${zona}` : 'Punto aproximado'
  }
  return [s.principal, s.secundario.split(',')[0]].filter(Boolean).join(', ').slice(0, 200)
}

/**
 * Elegir un punto (RF-05, RF-12): buscando una dirección o lugar (Google Places + lugares
 * frecuentes), con la ubicación actual (una sola vez, sin rastreo) o tocando el mapa.
 * value/onChange: { lat, lng, texto } | null. `privado`: origen/destino del conductor.
 */
export function PointPicker({
  label,
  value,
  onChange,
  placeholder = 'Busca una dirección o lugar',
  opcional = false,
  privado = false,
  autoFocus = false,
}) {
  const [texto, setTexto] = useState(value?.texto || '')
  const [abierto, setAbierto] = useState(false)
  const [sugerencias, setSugerencias] = useState([])
  const [buscando, setBuscando] = useState(false)
  const [consultado, setConsultado] = useState('') // último texto que Google ya respondió
  const [verMapa, setVerMapa] = useState(false)
  const [error, setError] = useState(null)
  const sesion = useRef(null)

  const consulta = normalizar(texto)
  const escribiendo = abierto && consulta !== normalizar(value?.texto || '')
  const frecuentes = LUGARES.filter((l) => !consulta || !escribiendo || normalizar(l.texto).includes(consulta))

  // Autocompletado de Google con debounce. Sin llave (o si falla) quedan los lugares frecuentes.
  useEffect(() => {
    if (!GOOGLE_MAPS_KEY || !escribiendo || consulta.length < MIN_LETRAS) return undefined
    let vigente = true
    const id = setTimeout(async () => {
      setBuscando(true)
      try {
        sesion.current ??= await nuevaSesionPlaces()
        const r = await sugerirLugares(texto, sesion.current)
        if (vigente) setSugerencias(r)
      } catch (err) {
        console.warn('Autocompletado de Places no disponible:', err.message)
        if (vigente) setSugerencias([])
      } finally {
        if (vigente) {
          setBuscando(false)
          setConsultado(texto)
        }
      }
    }, ESPERA_MS)
    return () => {
      vigente = false
      clearTimeout(id)
    }
  }, [texto, consulta, escribiendo])

  const elegir = (punto) => {
    onChange(punto)
    setTexto(punto?.texto || '')
    setAbierto(false)
    setSugerencias([])
    setError(null)
  }

  const elegirSugerencia = async (s) => {
    setBuscando(true)
    try {
      const p = await ubicarSugerencia(s)
      sesion.current = null // la sesión termina al elegir un lugar
      elegir({ lat: redondear6(p.lat), lng: redondear6(p.lng), texto: textoDeSugerencia(s, privado) })
    } catch {
      setError('No se pudo ubicar ese lugar. Intenta con otro o elige en el mapa.')
    } finally {
      setBuscando(false)
    }
  }

  const usarUbicacion = () => {
    setError(null)
    if (!navigator.geolocation) return setError('Tu navegador no da la ubicación')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const p = { lat: redondear6(coords.latitude), lng: redondear6(coords.longitude) }
        elegir({ ...p, texto: textoAproximado(p) })
      },
      () => setError('No se pudo obtener tu ubicación'),
      { enableHighAccuracy: false, timeout: 8000 },
    )
  }

  const elegirEnMapa = (p) => {
    const punto = { lat: redondear6(p.lat), lng: redondear6(p.lng) }
    elegir({ ...punto, texto: textoAproximado(punto) })
  }

  const mostrarGoogle = escribiendo && consulta.length >= MIN_LETRAS ? sugerencias : []
  const mostrarFrecuentes = escribiendo ? frecuentes.slice(0, 4) : frecuentes

  return (
    <div className="grid min-w-0 grid-cols-1 gap-2">
      <span className="text-sm font-medium">
        {label} {opcional && <span className="font-normal text-muted">(opcional)</span>}
      </span>
      <div className="flex min-w-0 gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input
            className="h-11 w-full min-w-0 rounded-xl border border-line bg-white pr-8 pl-9 text-sm outline-none focus:border-ink"
            value={texto}
            placeholder={placeholder}
            aria-label={label}
            autoComplete="off"
            autoFocus={autoFocus}
            enterKeyHint="search"
            onFocus={() => setAbierto(true)}
            onBlur={() => setTimeout(() => setAbierto(false), 150)}
            onChange={(e) => {
              setTexto(e.target.value)
              setAbierto(true)
            }}
          />
          {buscando && (
            <LoaderCircle size={16} className="absolute top-1/2 right-3 -translate-y-1/2 animate-spin text-muted" />
          )}
        </div>
        <BotonIcono label="Usar mi ubicación" onClick={usarUbicacion}>
          <LocateFixed size={18} />
        </BotonIcono>
        <BotonIcono label="Elegir en el mapa" activo={verMapa} onClick={() => setVerMapa((v) => !v)}>
          <MapIcon size={18} />
        </BotonIcono>
        {opcional && value && (
          <BotonIcono label="Quitar" onClick={() => elegir(null)}>
            <X size={18} />
          </BotonIcono>
        )}
      </div>

      {abierto && (mostrarFrecuentes.length > 0 || mostrarGoogle.length > 0) && (
        <ul className="grid max-h-64 grid-cols-1 overflow-y-auto rounded-xl border border-line bg-white py-1 text-sm">
          {mostrarFrecuentes.map((l) => (
            <Opcion
              key={l.id}
              principal={l.texto}
              secundario="Lugar frecuente"
              onElegir={() => elegir({ lat: l.lat, lng: l.lng, texto: l.texto })}
            />
          ))}
          {mostrarGoogle.map((s) => (
            <Opcion key={s.id} principal={s.principal} secundario={s.secundario} onElegir={() => elegirSugerencia(s)} />
          ))}
        </ul>
      )}

      {abierto &&
        escribiendo &&
        consulta.length >= MIN_LETRAS &&
        (!GOOGLE_MAPS_KEY || consultado === texto) &&
        !buscando &&
        !mostrarFrecuentes.length &&
        !mostrarGoogle.length && (
        <p className="rounded-xl bg-surface px-3 py-2 text-xs text-muted">
          No encontramos ese lugar. Prueba con otro nombre, tu ubicación o el mapa.
        </p>
      )}

      {value && !escribiendo && (
        <p className="flex min-w-0 items-center gap-1 text-xs text-muted">
          <MapPin size={13} className="shrink-0" />
          <span className="truncate">{value.texto}</span>
        </p>
      )}
      {error && <p className="text-xs text-coral">{error}</p>}
      {verMapa && (
        <>
          <RouteMap
            alto={200}
            onPick={elegirEnMapa}
            marcadores={[
              ...LUGARES.map((l) => ({ ...l, tipo: 'lugar', etiqueta: l.texto.split(' (')[0] })),
              ...(value ? [{ ...value, tipo: 'destino', etiqueta: 'Aquí' }] : []),
            ]}
          />
          <p className="text-[11px] text-muted">Toca el mapa para elegir el punto.</p>
        </>
      )}
    </div>
  )
}

function Opcion({ principal, secundario, onElegir }) {
  return (
    <li>
      <button
        type="button"
        // onMouseDown: elige antes de que el input pierda el foco y se cierre la lista.
        onMouseDown={(e) => {
          e.preventDefault()
          onElegir()
        }}
        className="flex w-full min-w-0 items-start gap-2 px-3 py-2 text-left hover:bg-surface"
      >
        <MapPin size={15} className="mt-0.5 shrink-0 text-muted" />
        <span className="min-w-0">
          <span className="block truncate">{principal}</span>
          {secundario && <span className="block truncate text-xs text-muted">{secundario}</span>}
        </span>
      </button>
    </li>
  )
}

function BotonIcono({ children, label, onClick, activo = false }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`grid size-11 shrink-0 place-items-center rounded-xl border ${
        activo ? 'border-coral bg-coral/10' : 'border-line bg-white'
      }`}
    >
      {children}
    </button>
  )
}
