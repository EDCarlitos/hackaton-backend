import { useCallback, useMemo, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { SlidersHorizontal } from 'lucide-react'
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
import { ErrorBanner, Loading } from '../components/ui/Feedback'
import { StatusChip } from '../components/ui/StatusChip'
import { PAGES } from '../constants/pages'
import { useAsync } from '../hooks/useAsync'
import { api } from '../lib/api'
import { HORAS_BUSQUEDA, ORDENES, resolverHora } from '../lib/horas'
import { ESTADO_RESERVA, formatCostoCorto, formatDia, formatMetros, formatRangoHora, tonoEstado } from '../lib/format'

const MODALS = { FILTROS: 'filtros', NOTIFICATIONS: 'notifications', PROFILE: 'profile' }
const CLAVE_BUSQUEDA = 'rutacaribe.busqueda'
const HORA_INICIAL = { id: 'cualquiera', otra: '' }

// Recogida, bajada y orden de la última búsqueda (solo en este navegador). La hora arranca en "Cualquier hora".
function leerFiltrosGuardados() {
  const base = { recogida: null, bajada: null, hora: HORA_INICIAL, orden: ORDENES[0] }
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE_BUSQUEDA) || 'null')
    if (g?.recogida) return { ...base, recogida: g.recogida, bajada: g.bajada || null, orden: ORDENES.includes(g.orden) ? g.orden : base.orden }
  } catch {
    // sin almacenamiento: se empieza de cero
  }
  return base
}

function guardarFiltros({ recogida, bajada, orden }) {
  try {
    localStorage.setItem(CLAVE_BUSQUEDA, JSON.stringify({ recogida, bajada, orden }))
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
      pendientes: v.solicitudes_pendientes,
      detalle:
        v.solicitudes_pendientes > 0
          ? `${plural(v.solicitudes_pendientes, 'solicitud')} por responder`
          : `${plural(v.pasajeros_confirmados, 'pasajero')} confirmado${v.pasajeros_confirmados === 1 ? '' : 's'}`,
    })),
  ]
  const proximo = candidatos.sort((a, b) => new Date(a.salida_en) - new Date(b.salida_en))[0]
  return proximo ? { ...proximo, yaSalio: new Date(proximo.salida_en).getTime() <= Date.now() } : null
}

const VENTANA_MS = 15 * 60_000 // la misma de la sección 5 (REGLAS.VENTANA_HORA_MIN en el backend)

// "Cualquier hora": todos los próximos con lugar (/viajes/proximos), con o sin punto de recogida.
// Con una hora concreta: la búsqueda de ±15 min (/viajes/buscar); sin recogida se filtran los próximos.
async function buscarViajes({ recogida, bajada, hora }) {
  const punto = recogida && {
    recogida_lat: recogida.lat,
    recogida_lng: recogida.lng,
    bajada_lat: bajada?.lat,
    bajada_lng: bajada?.lng,
  }
  const elegida = resolverHora(HORAS_BUSQUEDA, hora)
  if (!elegida) return api.get('/viajes/proximos', { ...punto, limite: 50 })

  // Si la hora elegida ya pasó (pantalla abierta mucho rato), se busca desde ahora.
  const salida = new Date(Math.max(elegida.getTime(), Date.now()))
  if (punto) return api.get('/viajes/buscar', { ...punto, salida_en: salida.toISOString() })
  const todos = await api.get('/viajes/proximos', { limite: 100 })
  return {
    ...todos,
    resultados: todos.resultados.filter((r) => Math.abs(new Date(r.salida_en) - salida) <= VENTANA_MS),
  }
}

/** Inicio (como en Figma): tu viaje actual y "Conductores disponibles"; el botón de orden abre los filtros. */
export function HomePage({ navigate }) {
  const [filtros, setFiltros] = useState(leerFiltrosGuardados)
  const [seleccionado, setSeleccionado] = useState(null)
  const [modal, setModal] = useState(null)

  const proximo = useAsync(cargarProximo, '', { intervaloMs: 30_000 })
  const avisos = useAsync(() => api.get('/notificaciones', { no_leidas: 'true', limite: 1 }), '', { intervaloMs: 20_000 })
  const { recogida, bajada, hora, orden } = filtros
  // El orden se aplica en el cliente: no forma parte de la consulta al API.
  const consulta = { recogida, bajada, hora }
  const busqueda = useAsync(() => buscarViajes(consulta), JSON.stringify(consulta))

  const resultados = useMemo(() => {
    const lista = [...(busqueda.data?.resultados || [])]
    const porHora = (a, b) => new Date(a.salida_en) - new Date(b.salida_en)
    // "Más cercano" solo tiene sentido con punto de recogida (RF-13: distancia a pie y luego hora).
    if (orden === ORDENES[1] && recogida) return lista.sort((a, b) => a.distancia_pie_m - b.distancia_pie_m || porHora(a, b))
    return lista.sort(porHora)
  }, [busqueda.data, orden, recogida])

  const abrirViaje = useCallback(
    (viajeId, papel) => {
      setModal(null)
      navigate(papel === 'conductor' ? PAGES.DRIVER_DETAIL : PAGES.TRIP_DETAIL, { viajeId })
    },
    [navigate],
  )

  const aplicar = (nuevos) => {
    guardarFiltros(nuevos)
    setFiltros(nuevos)
    setModal(null)
  }
  const abrirFiltros = () => setModal(MODALS.FILTROS)

  const n = resultados.length
  const cargandoPrimera = busqueda.cargando && !busqueda.data
  const textoHora =
    hora.id === 'cualquiera' ? null : hora.id === 'otra' ? 'a esa hora' : HORAS_BUSQUEDA.find((o) => o.id === hora.id)?.texto.toLowerCase()
  // Qué se está filtrando, en una sola línea discreta (nada si no hay filtros).
  const filtrosTexto = [recogida?.texto, bajada && `a ${bajada.texto}`, textoHora].filter(Boolean).join(' · ')

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
            <p>
              {cargandoPrimera ? 'Buscando…' : `${n} viaje${n === 1 ? '' : 's'} ${recogida ? 'cerca de ti' : 'próximos'}`}
            </p>
          </div>
          <button type="button" className="filter" onClick={abrirFiltros} aria-label={`Filtros. Orden: ${orden}`}>
            <SlidersHorizontal size={18} /> {orden}
          </button>
        </header>
        {filtrosTexto && (
          <button type="button" className="filters-summary" onClick={abrirFiltros}>
            {filtrosTexto}
          </button>
        )}

        <ErrorBanner error={busqueda.error} className="mt-4" />
        {cargandoPrimera && <Loading texto="Buscando conductores…" />}

        <div className="trip-list">
          {resultados.map((r) => (
            <TripCard
              key={r.viaje_id}
              titulo={r.conductor.nombre_visible}
              horario={`${formatDia(r.salida_en) === 'Hoy' ? '' : `${formatDia(r.salida_en)} · `}${formatRangoHora(r.salida_en, r.ruta.duracion_min)}`}
              origen={r.origen}
              destino={r.destino}
              tono={r.mi_reserva ? tonoEstado(r.mi_reserva.estado) : 'coral'}
              extra={
                r.mi_reserva && <StatusChip tono={tonoEstado(r.mi_reserva.estado)}>{ESTADO_RESERVA[r.mi_reserva.estado]}</StatusChip>
              }
              onClick={() => setSeleccionado(r)}
              pie={
                <>
                  <SeatCount taken={r.asientos_ofrecidos - r.asientos_disponibles} total={r.asientos_ofrecidos} />
                  <span>
                    {r.distancia_pie_m != null && `Recogida a ${formatMetros(r.distancia_pie_m)} · `}
                    <b className="font-semibold">{formatCostoCorto(r.costo_referencia)}</b>
                  </span>
                </>
              }
            />
          ))}
        </div>
      </section>

      <BottomNav activePage={PAGES.HOME} navigate={navigate} />

      <AnimatePresence>
        {modal === MODALS.FILTROS && <SearchModal key="f" inicial={filtros} onAplicar={aplicar} onClose={() => setModal(null)} />}
        {seleccionado && (
          <RideModal
            key="ride"
            resultado={seleccionado}
            recogida={recogida}
            bajada={bajada}
            onReservado={() => {
              proximo.reload()
              busqueda.reload()
            }}
            conHora={hora.id !== 'cualquiera'}
            onVerReserva={(viajeId) => abrirViaje(viajeId, 'pasajero')}
            onElegirRecogida={() => {
              setSeleccionado(null)
              abrirFiltros()
            }}
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
