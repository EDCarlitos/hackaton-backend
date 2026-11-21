import { useCallback, useMemo, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { MapPin, SlidersHorizontal } from 'lucide-react'
import { BottomNav } from '../components/layout/BottomNav'
import { HomeHeader } from '../components/layout/HomeHeader'
import { PhoneFrame } from '../components/layout/PhoneFrame'
import { NotificationsModal } from '../components/modals/NotificationsModal'
import { ProfileModal } from '../components/modals/ProfileModal'
import { RideModal } from '../components/modals/RideModal'
import { SearchModal } from '../components/modals/SearchModal'
import { CurrentTripCard } from '../components/trip/CurrentTripCard'
import { SeatCount } from '../components/trip/SeatCount'
import { TripCard } from '../components/trip/TripCard'
import { Empty, ErrorBanner, Loading } from '../components/ui/Feedback'
import { StatusChip } from '../components/ui/StatusChip'
import { PAGES } from '../constants/pages'
import { useAsync } from '../hooks/useAsync'
import { api } from '../lib/api'
import {
  aInputFechaHora,
  ESTADO_RESERVA,
  formatCostoCorto,
  formatDia,
  formatDiaHora,
  formatMetros,
  formatRangoHora,
} from '../lib/format'

const MODALS = { SEARCH: 'search', NOTIFICATIONS: 'notifications', PROFILE: 'profile' }
const ORDEN = { CERCANIA: 'Más cercano', HORA: 'Más próximo' }
const CLAVE_BUSQUEDA = 'rutacaribe.busqueda'

// Recogida y bajada de la última búsqueda (solo en este navegador). La hora siempre arranca en "ahora".
function leerBusquedaGuardada() {
  try {
    const guardada = JSON.parse(localStorage.getItem(CLAVE_BUSQUEDA) || 'null')
    if (guardada?.recogida) return { recogida: guardada.recogida, bajada: guardada.bajada || null, cuando: aInputFechaHora(new Date()) }
  } catch {
    // sin almacenamiento: se empieza de cero
  }
  return null
}

function guardarBusqueda({ recogida, bajada }) {
  try {
    localStorage.setItem(CLAVE_BUSQUEDA, JSON.stringify({ recogida, bajada }))
  } catch {
    // no pasa nada si no se puede guardar
  }
}

// Próximo viaje del usuario: su reserva vigente o su viaje como conductor, lo que salga antes.
async function cargarProximo() {
  const [{ reservas }, { viajes }] = await Promise.all([
    api.get('/reservas/mias', { cuando: 'proximas', limite: 10 }),
    api.get('/viajes/mios', { cuando: 'proximos', estado: 'abierto,lleno,en_curso', limite: 5 }),
  ])
  const plural = (n, palabra) => `${n} ${palabra}${n === 1 ? '' : palabra.endsWith('d') ? 'es' : 's'}`
  const candidatos = [
    ...reservas
      .filter((r) => ['solicitada', 'confirmada'].includes(r.estado))
      .map((r) => ({
        papel: 'pasajero',
        viajeId: r.viaje.id,
        estado: r.estado,
        salida_en: r.viaje.salida_en,
        origen: r.viaje.origen,
        destino: r.viaje.destino,
        conductor: r.viaje.conductor.nombre_visible,
      })),
    ...viajes.map((v) => ({
      papel: 'conductor',
      viajeId: v.id,
      estado: v.estado,
      salida_en: v.salida_en,
      origen: v.origen,
      destino: v.destino,
      detalle:
        v.solicitudes_pendientes > 0
          ? `${plural(v.solicitudes_pendientes, 'solicitud')} por responder`
          : `${plural(v.pasajeros_confirmados, 'pasajero')} confirmado${v.pasajeros_confirmados === 1 ? '' : 's'}`,
    })),
  ]
  const proximo = candidatos.sort((a, b) => new Date(a.salida_en) - new Date(b.salida_en))[0]
  return proximo ? { ...proximo, yaSalio: new Date(proximo.salida_en).getTime() <= Date.now() } : null
}

async function buscarViajes(consulta) {
  if (!consulta) return null
  // Si la hora elegida ya pasó (pantalla abierta mucho rato), se busca desde ahora.
  const salida = new Date(Math.max(new Date(consulta.cuando).getTime(), Date.now()))
  return api.get('/viajes/buscar', {
    recogida_lat: consulta.recogida.lat,
    recogida_lng: consulta.recogida.lng,
    bajada_lat: consulta.bajada?.lat,
    bajada_lng: consulta.bajada?.lng,
    salida_en: salida.toISOString(),
  })
}

/** Inicio: viaje actual y conductores que pasan cerca del punto de recogida. */
export function HomePage({ navigate }) {
  const [consulta, setConsulta] = useState(leerBusquedaGuardada)
  const [orden, setOrden] = useState(ORDEN.CERCANIA)
  const [seleccionado, setSeleccionado] = useState(null)
  const [modal, setModal] = useState(null)

  const proximo = useAsync(cargarProximo, '', { intervaloMs: 30_000 })
  const avisos = useAsync(() => api.get('/notificaciones', { no_leidas: 'true', limite: 1 }), '', { intervaloMs: 20_000 })
  const busqueda = useAsync(() => buscarViajes(consulta), JSON.stringify(consulta))

  const resultados = useMemo(() => {
    const lista = busqueda.data?.resultados || []
    if (orden === ORDEN.HORA) return [...lista].sort((a, b) => Math.abs(a.diferencia_min) - Math.abs(b.diferencia_min))
    return lista // el API ya los manda por distancia a pie y luego por hora (RF-13)
  }, [busqueda.data, orden])

  const abrirViaje = useCallback(
    (viajeId, papel) => {
      setModal(null)
      navigate(papel === 'conductor' ? PAGES.DRIVER_DETAIL : PAGES.TRIP_DETAIL, { viajeId })
    },
    [navigate],
  )

  const buscar = (nueva) => {
    guardarBusqueda(nueva)
    setConsulta(nueva)
    setModal(null)
  }

  const n = resultados.length
  const resumen = !consulta
    ? 'Elige dónde te recogen'
    : busqueda.cargando && !busqueda.data
      ? 'Buscando…'
      : `${n} viaje${n === 1 ? '' : 's'} cerca de ti`

  return (
    <PhoneFrame className="app-screen">
      <HomeHeader
        noLeidas={avisos.data?.no_leidas || 0}
        onOpenNotifications={() => setModal(MODALS.NOTIFICATIONS)}
        onOpenProfile={() => setModal(MODALS.PROFILE)}
      />

      {proximo.data && (
        <CurrentTripCard proximo={proximo.data} onView={() => abrirViaje(proximo.data.viajeId, proximo.data.papel)} />
      )}

      <section className="available">
        <header>
          <div>
            <h2>Conductores disponibles</h2>
            <p>{resumen}</p>
          </div>
          {consulta && (
            <button
              type="button"
              className="filter"
              onClick={() => setOrden((o) => (o === ORDEN.CERCANIA ? ORDEN.HORA : ORDEN.CERCANIA))}
            >
              <SlidersHorizontal size={18} /> {orden}
            </button>
          )}
        </header>

        <button type="button" className="field-bar" onClick={() => setModal(MODALS.SEARCH)}>
          <MapPin size={16} />
          <span>{consulta ? consulta.recogida.texto : '¿Dónde te recogen?'}</span>
          {consulta && <small>{formatDiaHora(consulta.cuando)}</small>}
        </button>

        <ErrorBanner error={busqueda.error} className="mt-4" />
        {consulta && busqueda.cargando && !busqueda.data && <Loading texto="Buscando conductores…" />}

        <div className="trip-list">
          {!consulta && <Empty>Toca la barra de arriba y elige tu punto de recogida para ver quién pasa cerca.</Empty>}
          {consulta && busqueda.data && !n && (
            <Empty>No hay viajes que pasen cerca a esa hora. Prueba otro punto de recogida u otra hora.</Empty>
          )}
          {resultados.map((r) => (
            <TripCard
              key={r.viaje_id}
              titulo={r.conductor.nombre_visible}
              horario={`${formatDia(r.salida_en) === 'Hoy' ? '' : `${formatDia(r.salida_en)} · `}${formatRangoHora(r.salida_en, r.ruta.duracion_min)}`}
              origen={r.origen}
              destino={r.destino}
              extra={r.mi_reserva && <StatusChip>{ESTADO_RESERVA[r.mi_reserva.estado]}</StatusChip>}
              onClick={() => setSeleccionado(r)}
              pie={
                <>
                  <SeatCount taken={r.asientos_ofrecidos - r.asientos_disponibles} total={r.asientos_ofrecidos} />
                  <span>
                    Recogida a {formatMetros(r.distancia_pie_m)} · <b className="font-semibold">{formatCostoCorto(r.costo_referencia)}</b>
                  </span>
                </>
              }
            />
          ))}
        </div>
      </section>

      <BottomNav activePage={PAGES.HOME} navigate={navigate} />

      <AnimatePresence>
        {modal === MODALS.SEARCH && (
          <SearchModal
            key="s"
            inicial={consulta || { recogida: null, bajada: null, cuando: aInputFechaHora(new Date()) }}
            onBuscar={buscar}
            onClose={() => setModal(null)}
          />
        )}
        {seleccionado && (
          <RideModal
            key="ride"
            resultado={seleccionado}
            recogida={consulta.recogida}
            bajada={consulta.bajada}
            onReservado={() => {
              proximo.reload()
              busqueda.reload()
            }}
            onVerReserva={(viajeId) => abrirViaje(viajeId, 'pasajero')}
            onClose={() => setSeleccionado(null)}
          />
        )}
        {modal === MODALS.NOTIFICATIONS && (
          <NotificationsModal key="n" onAbrirViaje={abrirViaje} onLeidas={avisos.reload} onClose={() => setModal(null)} />
        )}
        {modal === MODALS.PROFILE && (
          <ProfileModal key="p" onVerImpacto={() => navigate(PAGES.IMPACT)} onClose={() => setModal(null)} />
        )}
      </AnimatePresence>
    </PhoneFrame>
  )
}
