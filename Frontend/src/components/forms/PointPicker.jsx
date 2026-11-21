import { useState } from 'react'
import { LocateFixed, Map as MapIcon, MapPin, X } from 'lucide-react'
import { LUGARES, redondear6 } from '../../lib/geo'
import { RouteMap } from '../map/RouteMap'

const R_TIERRA = 6371000
const distanciaM = (a, b) => {
  const k = Math.cos((a.lat * Math.PI) / 180)
  const dx = ((b.lng - a.lng) * Math.PI * R_TIERRA * k) / 180
  const dy = ((b.lat - a.lat) * Math.PI * R_TIERRA) / 180
  return Math.hypot(dx, dy)
}

// Texto aproximado para un punto elegido a mano (RNF-03: nunca el domicilio exacto).
function textoAproximado(p) {
  const cercano = LUGARES.map((l) => ({ l, d: distanciaM(p, l) })).sort((a, b) => a.d - b.d)[0]
  return cercano && cercano.d < 600 ? `Cerca de ${cercano.l.texto}` : 'Punto elegido en el mapa'
}

/**
 * Elegir un punto (RF-05, RF-12): de la lista de lugares, con la ubicación actual (una sola vez,
 * sin rastreo) o tocando el mapa. value/onChange: { lat, lng, texto } | null.
 */
export function PointPicker({ label, value, onChange, placeholder = 'Elige un lugar', opcional = false }) {
  const [verMapa, setVerMapa] = useState(false)
  const [errorUbicacion, setErrorUbicacion] = useState(null)

  const elegirLugar = (id) => {
    const l = LUGARES.find((x) => x.id === id)
    if (l) onChange({ lat: l.lat, lng: l.lng, texto: l.texto })
  }

  const usarUbicacion = () => {
    setErrorUbicacion(null)
    if (!navigator.geolocation) return setErrorUbicacion('Tu navegador no da la ubicación')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const p = { lat: redondear6(coords.latitude), lng: redondear6(coords.longitude) }
        onChange({ ...p, texto: textoAproximado(p) })
      },
      () => setErrorUbicacion('No se pudo obtener tu ubicación'),
      { enableHighAccuracy: false, timeout: 8000 },
    )
  }

  const elegirEnMapa = (p) => {
    const punto = { lat: redondear6(p.lat), lng: redondear6(p.lng) }
    onChange({ ...punto, texto: textoAproximado(punto) })
  }

  const seleccionado = LUGARES.find((l) => value && l.lat === value.lat && l.lng === value.lng)

  return (
    <div className="grid min-w-0 grid-cols-1 gap-2">
      <span className="text-sm font-medium">
        {label} {opcional && <span className="font-normal text-muted">(opcional)</span>}
      </span>
      <div className="flex min-w-0 gap-2">
        <select
          className="h-11 w-0 min-w-0 flex-1 truncate rounded-xl border border-line bg-white px-3 text-sm outline-none"
          value={seleccionado?.id || ''}
          onChange={(e) => elegirLugar(e.target.value)}
        >
          <option value="">{value && !seleccionado ? value.texto : placeholder}</option>
          {LUGARES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.texto}
            </option>
          ))}
        </select>
        <BotonIcono label="Usar mi ubicación" onClick={usarUbicacion}>
          <LocateFixed size={18} />
        </BotonIcono>
        <BotonIcono label="Elegir en el mapa" activo={verMapa} onClick={() => setVerMapa((v) => !v)}>
          <MapIcon size={18} />
        </BotonIcono>
        {opcional && value && (
          <BotonIcono label="Quitar" onClick={() => onChange(null)}>
            <X size={18} />
          </BotonIcono>
        )}
      </div>
      {value && (
        <p className="flex min-w-0 items-center gap-1 text-xs text-muted">
          <MapPin size={13} className="shrink-0" />
          <span className="truncate">{value.texto}</span> · {value.lat.toFixed(4)}, {value.lng.toFixed(4)}
        </p>
      )}
      {errorUbicacion && <p className="text-xs text-coral">{errorUbicacion}</p>}
      {verMapa && (
        <>
          <RouteMap
            alto={200}
            onPick={elegirEnMapa}
            marcadores={[
              ...LUGARES.map((l) => ({ ...l, tipo: 'lugar', etiqueta: l.texto.split(' (')[0] })),
              ...(value ? [{ ...value, tipo: 'recogida', etiqueta: 'Aquí' }] : []),
            ]}
          />
          <p className="text-[11px] text-muted">Toca el mapa para elegir el punto.</p>
        </>
      )}
    </div>
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
