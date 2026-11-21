import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { COLORES_MAPA as COLORES, decodificarPolilinea } from '../../lib/geo'
import { cargarGoogleMaps, GOOGLE_MAPS_KEY } from '../../lib/googleMaps'

/**
 * Mapa del recorrido. Dibuja la polilínea guardada por el backend y marcadores.
 * marcadores: [{ lat, lng, tipo: 'origen'|'destino'|'recogida'|'abordaje'|'lugar', etiqueta? }]
 * onPick(latLng): si se pasa, tocar el mapa elige un punto.
 * Con VITE_GOOGLE_MAPS_API_KEY usa Google Maps; sin llave (o si falla) un esquema en SVG.
 */
export function RouteMap({ polilinea = '', marcadores = [], onPick, alto = 220, className = '' }) {
  const [googleFalla, setGoogleFalla] = useState(false)
  const onFalla = useCallback(() => setGoogleFalla(true), [])
  const props = { polilinea, marcadores, onPick, alto }
  return (
    <div className={`overflow-hidden rounded-[20px] bg-surface ${className}`} style={{ height: alto }}>
      {GOOGLE_MAPS_KEY && !googleFalla ? (
        <GoogleMapa {...props} onFalla={onFalla} />
      ) : (
        <MapaEsquema {...props} />
      )}
    </div>
  )
}

// ---------- Google Maps ----------

// Google cobra cada carga de mapa (cada `new google.maps.Map`), no los re-renders de React.
// Por eso los mapas se reutilizan: al desmontarse, la instancia se limpia y vuelve a este pool,
// y la siguiente pantalla la toma en vez de crear otra. En una sesión normal se crean 1 o 2 mapas.
const CENTRO = { lat: 21.17, lng: -86.85 }
const ESTILO_MINIMO = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
]
const libres = []
let creados = 0

function tomarMapa(maps) {
  const libre = libres.pop()
  if (libre) return libre
  const div = document.createElement('div')
  div.style.cssText = 'width:100%;height:100%'
  const mapa = new maps.Map(div, {
    center: CENTRO,
    zoom: 12,
    disableDefaultUI: true,
    zoomControl: true,
    clickableIcons: false,
    styles: ESTILO_MINIMO,
  })
  creados += 1
  if (import.meta.env.DEV) window.__mapasCreados = creados
  return { div, mapa }
}

function devolverMapa(item) {
  item.div.remove()
  libres.push(item)
}

function GoogleMapa({ polilinea, marcadores, onPick, onFalla }) {
  const contenedor = useRef(null)
  const capas = useRef([])
  const onPickRef = useRef(onPick)
  const [item, setItem] = useState(null)

  useEffect(() => {
    onPickRef.current = onPick
  })

  useEffect(() => {
    let vivo = true
    let tomado = null
    let escucha = null
    cargarGoogleMaps()
      .then((maps) => {
        if (!vivo || !contenedor.current) return
        tomado = tomarMapa(maps)
        contenedor.current.appendChild(tomado.div)
        escucha = tomado.mapa.addListener('click', (e) => onPickRef.current?.({ lat: e.latLng.lat(), lng: e.latLng.lng() }))
        setItem(tomado)
      })
      .catch(() => vivo && onFalla())
    return () => {
      vivo = false
      escucha?.remove()
      capas.current.forEach((c) => c.setMap(null))
      capas.current = []
      if (tomado) devolverMapa(tomado)
    }
  }, [onFalla])

  const clave = JSON.stringify([polilinea, marcadores])
  useEffect(() => {
    if (!item) return
    const maps = window.google.maps
    const { mapa } = item
    capas.current.forEach((c) => c.setMap(null))
    capas.current = []
    const limites = new maps.LatLngBounds()

    const ruta = decodificarPolilinea(polilinea)
    if (ruta.length) {
      capas.current.push(
        new maps.Polyline({ map: mapa, path: ruta, strokeColor: '#f15156', strokeWeight: 5, strokeOpacity: 0.9 }),
      )
      ruta.forEach((p) => limites.extend(p))
    }
    for (const m of marcadores) {
      capas.current.push(
        new maps.Marker({
          map: mapa,
          position: { lat: m.lat, lng: m.lng },
          title: m.etiqueta,
          icon: {
            path: maps.SymbolPath.CIRCLE,
            scale: m.tipo === 'lugar' ? 5 : 8,
            fillColor: COLORES[m.tipo] || COLORES.lugar,
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 2,
          },
        }),
      )
      limites.extend(m)
    }
    if (!limites.isEmpty()) mapa.fitBounds(limites, 32)
    else {
      // Un mapa reutilizado conserva la vista anterior: se regresa a Cancún.
      mapa.setCenter(CENTRO)
      mapa.setZoom(12)
    }
  }, [item, clave]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={contenedor} className="size-full" />
}

// ---------- Esquema SVG (sin llave) ----------

const ANCHO = 1000

function MapaEsquema({ polilinea, marcadores, onPick, alto }) {
  const svgRef = useRef(null)
  const ruta = useMemo(() => decodificarPolilinea(polilinea), [polilinea])
  const altoVB = Math.round((ANCHO * alto) / 382)

  // Proyección equirectangular local ajustada a todos los puntos, con margen.
  const proy = useMemo(() => {
    const todos = [...ruta, ...marcadores]
    if (!todos.length) return null
    const lats = todos.map((p) => p.lat)
    const lngs = todos.map((p) => p.lng)
    const k = Math.cos(((Math.min(...lats) + Math.max(...lats)) / 2) * (Math.PI / 180))
    const minX = Math.min(...lngs) * k
    const maxX = Math.max(...lngs) * k
    const minY = Math.min(...lats)
    const maxY = Math.max(...lats)
    const rango = Math.max(maxX - minX, ((maxY - minY) * ANCHO) / altoVB, 0.004)
    const escala = (ANCHO * 0.84) / rango
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    return {
      a: (p) => ({ x: ANCHO / 2 + (p.lng * k - cx) * escala, y: altoVB / 2 - (p.lat - cy) * escala }),
      de: (x, y) => ({ lng: (cx + (x - ANCHO / 2) / escala) / k, lat: cy - (y - altoVB / 2) / escala }),
    }
  }, [ruta, marcadores, altoVB])

  const elegir = (e) => {
    if (!onPick || !proy) return
    const caja = svgRef.current.getBoundingClientRect()
    const x = ((e.clientX - caja.left) / caja.width) * ANCHO
    const y = ((e.clientY - caja.top) / caja.height) * altoVB
    onPick(proy.de(x, y))
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${ANCHO} ${altoVB}`}
      className={`size-full ${onPick ? 'cursor-crosshair' : ''}`}
      onClick={elegir}
      role="img"
      aria-label="Mapa esquemático del recorrido"
    >
      <defs>
        <pattern id="cuadricula" width="60" height="60" patternUnits="userSpaceOnUse">
          <path d="M60 0H0V60" fill="none" stroke="#e9e7e5" strokeWidth="2" />
        </pattern>
      </defs>
      <rect width={ANCHO} height={altoVB} fill="url(#cuadricula)" />
      {proy && ruta.length > 1 && (
        <polyline
          points={ruta.map((p) => `${proy.a(p).x},${proy.a(p).y}`).join(' ')}
          fill="none"
          stroke="#f15156"
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {proy &&
        marcadores.map((m, i) => {
          const { x, y } = proy.a(m)
          const r = m.tipo === 'lugar' ? 11 : 18
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={r} fill={COLORES[m.tipo] || COLORES.lugar} stroke="#fff" strokeWidth="6" />
              {m.etiqueta && m.tipo !== 'lugar' && (
                <text x={x + 26} y={y + 10} fontSize="30" fontWeight="600" fill="#191716" paintOrder="stroke" stroke="#fff" strokeWidth="8">
                  {m.etiqueta}
                </text>
              )}
              {m.etiqueta && m.tipo === 'lugar' && (
                <text x={x + 18} y={y + 9} fontSize="24" fill="#696461" paintOrder="stroke" stroke="#fff" strokeWidth="6">
                  {m.etiqueta}
                </text>
              )}
            </g>
          )
        })}
      {!GOOGLE_MAPS_KEY && (
        <text x={ANCHO - 20} y={altoVB - 20} textAnchor="end" fontSize="22" fill="#a8a29e">
          Mapa esquemático
        </text>
      )}
    </svg>
  )
}

/** Leyenda de colores de los marcadores que se usan en un mapa. */
export function MapLegend({ tipos }) {
  const nombres = { origen: 'Origen', destino: 'Destino', recogida: 'Recogida', abordaje: 'Abordaje' }
  return (
    <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted">
      {tipos.map((t) => (
        <span key={t} className="flex items-center gap-1">
          <i className="inline-block size-2.5 rounded-full" style={{ background: COLORES[t] }} />
          {nombres[t]}
        </span>
      ))}
    </div>
  )
}
