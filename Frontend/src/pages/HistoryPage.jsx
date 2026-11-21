import { useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { Copy, Inbox } from 'lucide-react'
import { BottomNav } from '../components/layout/BottomNav'
import { PhoneFrame } from '../components/layout/PhoneFrame'
import { RepublishModal } from '../components/modals/RepublishModal'
import { SeatCount } from '../components/trip/SeatCount'
import { TripCard } from '../components/trip/TripCard'
import { Empty, ErrorBanner, Loading } from '../components/ui/Feedback'
import { StatusChip } from '../components/ui/StatusChip'
import { PAGES } from '../constants/pages'
import { useAsync } from '../hooks/useAsync'
import { api } from '../lib/api'
import { ESTADO_RESERVA, ESTADO_VIAJE, esEstadoActivo, formatDiaHora } from '../lib/format'

const PESTANAS = { CONDUZCO: 'conduzco', VIAJO: 'viajo' }

/** "Mis viajes" (RF-10): como conductor (estado y solicitudes) y como pasajero (mis reservas). */
export function HistoryPage({ navigate }) {
  const [pestana, setPestana] = useState(PESTANAS.CONDUZCO)

  return (
    <PhoneFrame className="app-screen history-screen">
      <header className="simple-header">
        <h1>Mis viajes</h1>
        <p>Lo que conduces y en lo que viajas</p>
      </header>
      <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-surface p-1 text-sm font-medium">
        {[
          [PESTANAS.CONDUZCO, 'Conduzco'],
          [PESTANAS.VIAJO, 'Viajo'],
        ].map(([id, texto]) => (
          <button
            key={id}
            type="button"
            className={`h-10 rounded-lg ${pestana === id ? 'bg-white shadow-sm' : 'text-muted'}`}
            onClick={() => setPestana(id)}
          >
            {texto}
          </button>
        ))}
      </div>
      {pestana === PESTANAS.CONDUZCO ? <ComoConductor navigate={navigate} /> : <ComoPasajero navigate={navigate} />}
      <BottomNav activePage={PAGES.HISTORY} navigate={navigate} />
    </PhoneFrame>
  )
}

// Próximos primero (el más cercano arriba), luego los pasados (el más reciente arriba).
async function cargarViajes() {
  const { viajes } = await api.get('/viajes/mios', { limite: 50 })
  const ahora = Date.now()
  return viajes.sort((a, b) => {
    const fa = new Date(a.salida_en).getTime()
    const fb = new Date(b.salida_en).getTime()
    if (fa >= ahora && fb >= ahora) return fa - fb
    if (fa >= ahora) return -1
    if (fb >= ahora) return 1
    return fb - fa
  })
}

function ComoConductor({ navigate }) {
  const { data, error, cargando } = useAsync(cargarViajes, '', { intervaloMs: 20_000 })
  const [republicar, setRepublicar] = useState(null)
  const viajes = data || []

  return (
    <section>
      {cargando && <Loading />}
      <ErrorBanner error={error} className="mt-4" />
      {data && !viajes.length && <Empty>Aún no publicas viajes. Toca “Publicar” para empezar.</Empty>}
      {viajes.map((v) => (
        <TripCard
          key={v.id}
          titulo={formatDiaHora(v.salida_en)}
          horario={v.vehiculo.placa_o_descripcion.split(' · ')[0]}
          origen={v.origen}
          destino={v.destino}
          apagada={!esEstadoActivo(v.estado)}
          chip={<StatusChip activo={esEstadoActivo(v.estado)}>{ESTADO_VIAJE[v.estado]}</StatusChip>}
          onClick={() => navigate(PAGES.DRIVER_DETAIL, { viajeId: v.id })}
          pie={
            <>
              <SeatCount taken={v.asientos_ofrecidos - v.asientos_disponibles} total={v.asientos_ofrecidos} />
              {v.solicitudes_pendientes > 0 && (
                <small className="flex items-center gap-1 font-semibold text-coral">
                  <Inbox size={13} /> {v.solicitudes_pendientes} solicitud{v.solicitudes_pendientes > 1 ? 'es' : ''}
                </small>
              )}
              <button
                type="button"
                className="flex items-center gap-1 text-xs font-medium"
                onClick={(e) => {
                  e.stopPropagation()
                  setRepublicar(v)
                }}
              >
                <Copy size={13} /> Publicar de nuevo
              </button>
            </>
          }
        />
      ))}
      <AnimatePresence>
        {republicar && (
          <RepublishModal
            viaje={republicar}
            onPublicado={(nuevo) => navigate(PAGES.DRIVER_DETAIL, { viajeId: nuevo.id })}
            onClose={() => setRepublicar(null)}
          />
        )}
      </AnimatePresence>
    </section>
  )
}

function ComoPasajero({ navigate }) {
  const { data, error, cargando } = useAsync(() => api.get('/reservas/mias', { limite: 50 }), '', { intervaloMs: 20_000 })

  return (
    <section>
      {cargando && <Loading />}
      <ErrorBanner error={error} className="mt-4" />
      {data && !data.reservas.length && <Empty>Aún no pides viajes. Búscalos desde Inicio.</Empty>}
      {data?.reservas.map((r) => (
        <TripCard
          key={r.id}
          titulo={r.viaje.conductor.nombre_visible}
          horario={formatDiaHora(r.viaje.salida_en)}
          origen={r.viaje.origen}
          destino={r.viaje.destino}
          apagada={!esEstadoActivo(r.estado)}
          chip={<StatusChip activo={esEstadoActivo(r.estado)}>{ESTADO_RESERVA[r.estado]}</StatusChip>}
          onClick={() => navigate(PAGES.TRIP_DETAIL, { viajeId: r.viaje.id })}
          pie={<small>Recogida: {r.recogida.texto || 'punto elegido en el mapa'}</small>}
        />
      ))}
    </section>
  )
}
