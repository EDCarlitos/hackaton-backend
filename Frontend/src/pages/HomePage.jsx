import { useCallback, useMemo, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { Footprints, Search, SlidersHorizontal } from 'lucide-react'
import { PointPicker } from '../components/forms/PointPicker'
import { BottomNav } from '../components/layout/BottomNav'
import { HomeHeader } from '../components/layout/HomeHeader'
import { PhoneFrame } from '../components/layout/PhoneFrame'
import { NotificationsModal } from '../components/modals/NotificationsModal'
import { ProfileModal } from '../components/modals/ProfileModal'
import { RideModal } from '../components/modals/RideModal'
import { CurrentTripCard } from '../components/trip/CurrentTripCard'
import { SeatCount } from '../components/trip/SeatCount'
import { TripCard } from '../components/trip/TripCard'
import { Empty, ErrorBanner, inputClass } from '../components/ui/Feedback'
import { PrimaryButton } from '../components/ui/PrimaryButton'
import { StatusChip } from '../components/ui/StatusChip'
import { PAGES } from '../constants/pages'
import { useAuth } from '../context/AuthContext'
import { useAsync } from '../hooks/useAsync'
import { api } from '../lib/api'
import { aInputFechaHora, ESTADO_RESERVA, formatCosto, formatDia, formatMetros, formatRangoHora } from '../lib/format'

const MODALS = { NOTIFICATIONS: 'notifications', PROFILE: 'profile' }
const ORDEN = { CERCANIA: 'Más cercano', HORA: 'Hora más próxima' }

// Próximo viaje del usuario: su reserva vigente o su viaje como conductor, lo que salga antes.
async function cargarProximo() {
  const [{ reservas }, { viajes }] = await Promise.all([
    api.get('/reservas/mias', { cuando: 'proximas', limite: 10 }),
    api.get('/viajes/mios', { cuando: 'proximos', estado: 'abierto,lleno,en_curso', limite: 5 }),
  ])
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
          ? `${v.solicitudes_pendientes} solicitud${v.solicitudes_pendientes > 1 ? 'es' : ''} pendiente${v.solicitudes_pendientes > 1 ? 's' : ''}`
          : `${v.pasajeros_confirmados} pasajero${v.pasajeros_confirmados === 1 ? '' : 's'} confirmado${v.pasajeros_confirmados === 1 ? '' : 's'}`,
    })),
  ]
  return candidatos.sort((a, b) => new Date(a.salida_en) - new Date(b.salida_en))[0] || null
}

/** Inicio del pasajero: elegir recogida (y bajada), hora deseada y ver los viajes compatibles. */
export function HomePage({ navigate }) {
  const { usuario } = useAuth()
  const [recogida, setRecogida] = useState(null)
  const [bajada, setBajada] = useState(null)
  const [cuando, setCuando] = useState(() => aInputFechaHora(new Date()))
  const [busqueda, setBusqueda] = useState(null)
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState(null)
  const [orden, setOrden] = useState(ORDEN.CERCANIA)
  const [seleccionado, setSeleccionado] = useState(null)
  const [modal, setModal] = useState(null)

  const proximo = useAsync(cargarProximo, '', { intervaloMs: 30_000 })
  const avisos = useAsync(() => api.get('/notificaciones', { no_leidas: 'true', limite: 1 }), '', { intervaloMs: 20_000 })

  const buscar = async (e) => {
    e?.preventDefault()
    if (!recogida) return
    setBuscando(true)
    setError(null)
    try {
      // Si la hora elegida ya pasó (pantalla abierta mucho rato), se busca desde ahora.
      const salida = new Date(Math.max(new Date(cuando).getTime(), Date.now()))
      const r = await api.get('/viajes/buscar', {
        recogida_lat: recogida.lat,
        recogida_lng: recogida.lng,
        bajada_lat: bajada?.lat,
        bajada_lng: bajada?.lng,
        salida_en: salida.toISOString(),
      })
      setBusqueda(r)
    } catch (err) {
      setError(err)
    } finally {
      setBuscando(false)
    }
  }

  const resultados = useMemo(() => {
    const lista = busqueda?.resultados || []
    if (orden === ORDEN.HORA) return [...lista].sort((a, b) => Math.abs(a.diferencia_min) - Math.abs(b.diferencia_min))
    return lista // el API ya los manda por distancia a pie y luego por hora (RF-13)
  }, [busqueda, orden])

  const abrirViaje = useCallback(
    (viajeId, papel) => {
      setModal(null)
      navigate(papel === 'conductor' ? PAGES.DRIVER_DETAIL : PAGES.TRIP_DETAIL, { viajeId })
    },
    [navigate],
  )

  return (
    <PhoneFrame className="app-screen">
      <HomeHeader
        nombre={usuario.nombre_visible}
        noLeidas={avisos.data?.no_leidas || 0}
        onOpenNotifications={() => setModal(MODALS.NOTIFICATIONS)}
        onOpenProfile={() => setModal(MODALS.PROFILE)}
      />

      {proximo.data && (
        <CurrentTripCard proximo={proximo.data} onView={() => abrirViaje(proximo.data.viajeId, proximo.data.papel)} />
      )}

      <form onSubmit={buscar} className="mt-6 grid gap-4 rounded-[20px] border border-line p-4">
        <h2 className="text-lg font-semibold">¿A dónde vas?</h2>
        <PointPicker label="Punto de recogida" value={recogida} onChange={setRecogida} placeholder="¿Dónde te recogen?" />
        <PointPicker label="Punto de bajada" value={bajada} onChange={setBajada} opcional placeholder="¿Dónde te bajas?" />
        <label className="text-sm font-medium">
          Hora deseada
          <input
            type="datetime-local"
            className={inputClass}
            value={cuando}
            onChange={(e) => setCuando(e.target.value)}
            required
          />
        </label>
        <PrimaryButton type="submit" disabled={!recogida || buscando}>
          <Search size={16} className="mr-2 inline" />
          {buscando ? 'Buscando…' : 'Buscar viajes'}
        </PrimaryButton>
      </form>

      <ErrorBanner error={error} className="mt-4" />

      {busqueda && (
        <section className="available">
          <header>
            <div>
              <h2>Viajes compatibles</h2>
              <p>
                {resultados.length} viaje{resultados.length === 1 ? '' : 's'} · ruta a menos de{' '}
                {busqueda.criterios.max_distancia_pie_m} m y ±{busqueda.criterios.ventana_min} min
              </p>
            </div>
            <button
              type="button"
              className="filter"
              onClick={() => setOrden((o) => (o === ORDEN.CERCANIA ? ORDEN.HORA : ORDEN.CERCANIA))}
            >
              <SlidersHorizontal size={18} /> {orden}
            </button>
          </header>
          {!resultados.length && (
            <Empty>
              No hay viajes que pasen cerca a esa hora. Prueba otro punto de recogida u otra hora.
            </Empty>
          )}
          {resultados.map((r) => (
            <TripCard
              key={r.viaje_id}
              titulo={r.conductor.nombre_visible}
              horario={`${formatDia(r.salida_en)} · ${formatRangoHora(r.salida_en, r.ruta.duracion_min)}`}
              origen={r.origen}
              destino={r.destino}
              chip={r.mi_reserva && <StatusChip>{ESTADO_RESERVA[r.mi_reserva.estado]}</StatusChip>}
              onClick={() => setSeleccionado(r)}
              pie={
                <>
                  <SeatCount taken={r.asientos_ofrecidos - r.asientos_disponibles} total={r.asientos_ofrecidos} />
                  <small className="flex items-center gap-1">
                    <Footprints size={13} /> {formatMetros(r.distancia_pie_m)}
                  </small>
                  <small>{formatCosto(r.costo_referencia)}</small>
                </>
              }
            />
          ))}
        </section>
      )}

      <BottomNav activePage={PAGES.HOME} navigate={navigate} />

      <AnimatePresence>
        {seleccionado && (
          <RideModal
            key="ride"
            resultado={seleccionado}
            recogida={recogida}
            bajada={bajada}
            onReservado={() => {
              proximo.reload()
              buscar()
            }}
            onVerReserva={(viajeId) => abrirViaje(viajeId, 'pasajero')}
            onClose={() => setSeleccionado(null)}
          />
        )}
        {modal === MODALS.NOTIFICATIONS && (
          <NotificationsModal key="n" onAbrirViaje={abrirViaje} onLeidas={avisos.reload} onClose={() => setModal(null)} />
        )}
        {modal === MODALS.PROFILE && <ProfileModal key="p" onClose={() => setModal(null)} />}
      </AnimatePresence>
    </PhoneFrame>
  )
}
