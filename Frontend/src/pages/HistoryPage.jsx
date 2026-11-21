import { BottomNav } from '../components/layout/BottomNav'
import { PhoneFrame } from '../components/layout/PhoneFrame'
import { TripCard } from '../components/trip/TripCard'
import { Empty, ErrorBanner, Loading } from '../components/ui/Feedback'
import { StatusChip } from '../components/ui/StatusChip'
import { PAGES } from '../constants/pages'
import { useAsync } from '../hooks/useAsync'
import { api } from '../lib/api'
import { ESTADO_RESERVA, ESTADO_VIAJE, esEstadoActivo, formatDia, formatRangoHora } from '../lib/format'

// Viajes que conduzco y reservas que tengo, en una sola lista.
async function cargarMisViajes() {
  const [{ viajes }, { reservas }] = await Promise.all([
    api.get('/viajes/mios', { limite: 50 }),
    api.get('/reservas/mias', { limite: 50 }),
  ])
  const items = [
    ...viajes.map((v) => ({
      clave: `v${v.id}`,
      papel: 'conductor',
      viajeId: v.id,
      titulo: 'Tú conduces',
      salida_en: v.salida_en,
      duracion_min: v.ruta?.duracion_min,
      origen: v.origen,
      destino: v.destino,
      estado: ESTADO_VIAJE[v.estado],
      activo: esEstadoActivo(v.estado),
      pendientes: v.solicitudes_pendientes,
    })),
    ...reservas.map((r) => ({
      clave: `r${r.id}`,
      papel: 'pasajero',
      viajeId: r.viaje.id,
      titulo: r.viaje.conductor.nombre_visible,
      salida_en: r.viaje.salida_en,
      duracion_min: r.viaje.ruta?.duracion_min,
      origen: r.viaje.origen,
      destino: r.viaje.destino,
      estado: ESTADO_RESERVA[r.estado],
      activo: esEstadoActivo(r.estado),
      pendientes: 0,
    })),
  ]
  // Próximos y vigentes: el más cercano arriba. Historial: el más reciente arriba.
  const ahora = Date.now()
  const proximos = items.filter((i) => i.activo && new Date(i.salida_en).getTime() >= ahora - 3 * 3_600_000)
  const historial = items.filter((i) => !proximos.includes(i))
  proximos.sort((a, b) => new Date(a.salida_en) - new Date(b.salida_en))
  historial.sort((a, b) => new Date(b.salida_en) - new Date(a.salida_en))
  return { proximos, historial }
}

/** "Mis viajes" (RF-10): lo que conduces y en lo que viajas. */
export function HistoryPage({ navigate }) {
  const { data, error, cargando } = useAsync(cargarMisViajes, '', { intervaloMs: 20_000 })
  const vacio = data && !data.proximos.length && !data.historial.length

  const abrir = (item) => navigate(item.papel === 'conductor' ? PAGES.DRIVER_DETAIL : PAGES.TRIP_DETAIL, { viajeId: item.viajeId })

  return (
    <PhoneFrame className="app-screen history-screen">
      <header className="simple-header">
        <h1>Mis viajes</h1>
        <p>Historial de viajes</p>
      </header>

      {cargando && <Loading />}
      <ErrorBanner error={error} className="mt-4" />
      {vacio && (
        <div className="trip-list">
          <Empty>Aún no tienes viajes. Busca uno en Inicio o publica el tuyo.</Empty>
        </div>
      )}

      {data?.proximos.length > 0 && (
        <>
          <h2>Próximos</h2>
          <Lista items={data.proximos} onAbrir={abrir} />
        </>
      )}
      {data?.historial.length > 0 && (
        <>
          {data.proximos.length > 0 && <h2>Anteriores</h2>}
          <Lista items={data.historial} onAbrir={abrir} />
        </>
      )}

      <BottomNav activePage={PAGES.HISTORY} navigate={navigate} />
    </PhoneFrame>
  )
}

function Lista({ items, onAbrir }) {
  return (
    <div className="trip-list">
      {items.map((item) => (
        <TripCard
          key={item.clave}
          historial
          titulo={item.titulo}
          horario={`${formatDia(item.salida_en)} · ${formatRangoHora(item.salida_en, item.duracion_min)}`}
          origen={item.origen}
          destino={item.destino}
          estado={<StatusChip activo={item.activo}>{item.estado}</StatusChip>}
          onClick={() => onAbrir(item)}
          pie={
            <>
              {item.pendientes > 0 && (
                <span className="font-semibold text-coral">
                  {item.pendientes} solicitud{item.pendientes > 1 ? 'es' : ''} por responder
                </span>
              )}
              <span>Ver detalle</span>
            </>
          }
        />
      ))}
    </div>
  )
}
