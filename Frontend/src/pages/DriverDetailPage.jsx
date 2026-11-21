import { useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { Check, Copy, Footprints, MapPin, User, X } from 'lucide-react'
import { TripChat } from '../components/chat/TripChat'
import { BottomNav } from '../components/layout/BottomNav'
import { DetailHeader } from '../components/layout/DetailHeader'
import { PhoneFrame } from '../components/layout/PhoneFrame'
import { MapLegend, RouteMap } from '../components/map/RouteMap'
import { RepublishModal } from '../components/modals/RepublishModal'
import { Route } from '../components/trip/Route'
import { SeatCount } from '../components/trip/SeatCount'
import { ErrorBanner, inputClass, Loading } from '../components/ui/Feedback'
import { Modal, ModalHeader } from '../components/ui/Modal'
import { PrimaryButton } from '../components/ui/PrimaryButton'
import { PAGES } from '../constants/pages'
import { useAsync } from '../hooks/useAsync'
import { useChat } from '../hooks/useChat'
import { api } from '../lib/api'
import { ESTADO_RESERVA, ESTADO_VIAJE, esEstadoActivo, formatCosto, formatDiaHora, formatMetros, formatRangoHora } from '../lib/format'
import { TripDetailPage } from './TripDetailPage'

/** Detalle del viaje, vista de conductor ({ viajeId }). */
export function DriverDetailPage({ navigate, params }) {
  const { viajeId } = params
  const { data, error, cargando, reload } = useAsync(() => api.get(`/viajes/${viajeId}`), viajeId, { intervaloMs: 10_000 })
  const chat = useChat(viajeId)
  const [accionError, setAccionError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [ocupado, setOcupado] = useState(null)
  const [modal, setModal] = useState(null)

  const viaje = data?.viaje
  // Si quien abre no es el conductor, se muestra la vista de pasajero.
  if (viaje && viaje.reservas === undefined) return <TripDetailPage navigate={navigate} params={params} />

  const responder = async (reserva, accion) => {
    setOcupado(reserva.id)
    setAccionError(null)
    setAviso(null)
    try {
      const r = await api.post(`/reservas/${reserva.id}/${accion}`)
      if (accion === 'aceptar') {
        setAviso(
          r.rechazadas_automaticamente > 0
            ? `Aceptaste a ${reserva.pasajero.nombre_visible}. El viaje se llenó y ${r.rechazadas_automaticamente} solicitud(es) pendiente(s) se rechazaron automáticamente.`
            : `Aceptaste a ${reserva.pasajero.nombre_visible}. Te quedan ${r.viaje.asientos_disponibles} asiento(s).`,
        )
      }
      reload()
    } catch (err) {
      setAccionError(err)
      reload()
    } finally {
      setOcupado(null)
    }
  }

  const pendientes = viaje?.reservas.filter((r) => r.estado === 'solicitada') || []
  const confirmados = viaje?.reservas.filter((r) => ['confirmada', 'completada'].includes(r.estado)) || []
  const otras = viaje?.reservas.filter((r) => !['solicitada', 'confirmada', 'completada'].includes(r.estado)) || []
  const cancelable = viaje && ['abierto', 'lleno'].includes(viaje.estado)

  return (
    <PhoneFrame className="app-screen detail-screen">
      <DetailHeader
        title="Tu viaje"
        subtitle={viaje ? `${formatDiaHora(viaje.salida_en)} · Vista de conductor` : 'Vista de conductor'}
        status={viaje && ESTADO_VIAJE[viaje.estado]}
        statusActivo={viaje && esEstadoActivo(viaje.estado)}
        onBack={() => navigate(PAGES.HISTORY)}
      />
      {cargando && <Loading />}
      <ErrorBanner error={error} className="mt-4" />

      {viaje && (
        <>
          <RouteMap
            className="mt-6"
            alto={230}
            polilinea={viaje.ruta.polilinea}
            marcadores={[
              { ...viaje.origen, tipo: 'origen' },
              { ...viaje.destino, tipo: 'destino' },
              ...pendientes.map((r) => ({ ...r.recogida, tipo: 'recogida', etiqueta: r.pasajero.nombre_visible.split(' ')[0] })),
              ...confirmados
                .filter((r) => r.punto_abordaje)
                .map((r) => ({ ...r.punto_abordaje, tipo: 'abordaje', etiqueta: r.pasajero.nombre_visible.split(' ')[0] })),
            ]}
          />
          <MapLegend tipos={['origen', 'destino', 'recogida', 'abordaje']} />

          <section className="trip-info">
            <div>
              <b>{viaje.vehiculo.placa_o_descripcion}</b>
              <span>{formatRangoHora(viaje.salida_en, viaje.ruta.duracion_min)}</span>
            </div>
            <Route origen={viaje.origen} destino={viaje.destino} />
            <footer>
              <SeatCount taken={viaje.asientos_ofrecidos - viaje.asientos_disponibles} total={viaje.asientos_ofrecidos} />
              <small>
                {viaje.ruta.distancia_km} km · {formatCosto(viaje.costo_referencia)}
              </small>
            </footer>
            {viaje.estado === 'cancelado' && (
              <p className="text-xs text-muted">Cancelado{viaje.motivo_cancelacion ? `: ${viaje.motivo_cancelacion}` : ''}</p>
            )}
          </section>

          <ErrorBanner error={accionError} className="mt-4" />
          {aviso && <p className="mt-4 rounded-xl bg-surface p-3 text-sm">{aviso}</p>}

          <section className="passengers">
            <header>
              <b>Solicitudes</b>
              <small>{pendientes.length} pendiente(s)</small>
            </header>
            {!pendientes.length && <p className="py-3 text-sm text-muted">No hay solicitudes pendientes.</p>}
            {pendientes.map((r) => (
              <div className="passenger" key={r.id}>
                <span>
                  <User size={20} />
                </span>
                <p>
                  <b>{r.pasajero.nombre_visible}</b>
                  <small>
                    <MapPin size={11} className="inline" /> {r.recogida.texto || 'Punto en el mapa'} ·{' '}
                    <Footprints size={11} className="inline" /> {formatMetros(r.distancia_pie_m ?? 0)}
                  </small>
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    aria-label="Rechazar"
                    disabled={ocupado === r.id}
                    className="grid size-9 place-items-center rounded-full border border-line"
                    onClick={() => responder(r, 'rechazar')}
                  >
                    <X size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label="Aceptar"
                    disabled={ocupado === r.id || viaje.asientos_disponibles < 1}
                    className="grid size-9 place-items-center rounded-full bg-coral disabled:opacity-40"
                    onClick={() => responder(r, 'aceptar')}
                  >
                    <Check size={16} />
                  </button>
                </div>
              </div>
            ))}
          </section>

          <section className="passengers">
            <header>
              <b>Pasajeros</b>
              <small>
                {confirmados.length} de {viaje.asientos_ofrecidos} asientos
              </small>
            </header>
            {!confirmados.length && <p className="py-3 text-sm text-muted">Aún no hay pasajeros confirmados.</p>}
            {confirmados.map((r, index) => (
              <div className="passenger" key={r.id}>
                <span>
                  <User size={20} />
                </span>
                <p>
                  <b>{r.pasajero.nombre_visible}</b>
                  <small>
                    Recoger en: {r.recogida.texto || 'punto en el mapa'}
                    {r.punto_abordaje && ` (sobre tu ruta: ${r.punto_abordaje.lat.toFixed(4)}, ${r.punto_abordaje.lng.toFixed(4)})`}
                  </small>
                </p>
                <em title={ESTADO_RESERVA[r.estado]}>{r.estado === 'completada' ? '✓' : String(index + 1).padStart(2, '0')}</em>
              </div>
            ))}
            {otras.length > 0 && (
              <footer>
                <small>
                  {otras.length} solicitud(es) cerrada(s):{' '}
                  {otras.map((r) => `${r.pasajero.nombre_visible.split(' ')[0]} (${ESTADO_RESERVA[r.estado].toLowerCase()})`).join(', ')}
                </small>
              </footer>
            )}
          </section>

          <TripChat chat={chat} />

          <div className="mt-6 grid gap-2">
            <PrimaryButton variante="secundario" onClick={() => setModal('republicar')}>
              <Copy size={16} className="mr-2 inline" /> Publicar de nuevo
            </PrimaryButton>
            {cancelable && (
              <PrimaryButton variante="peligro" onClick={() => setModal('cancelar')}>
                Cancelar viaje
              </PrimaryButton>
            )}
          </div>
        </>
      )}

      <BottomNav activePage={PAGES.HISTORY} navigate={navigate} />

      <AnimatePresence>
        {modal === 'republicar' && (
          <RepublishModal
            key="r"
            viaje={viaje}
            onPublicado={(nuevo) => {
              setModal(null)
              navigate(PAGES.DRIVER_DETAIL, { viajeId: nuevo.id })
            }}
            onClose={() => setModal(null)}
          />
        )}
        {modal === 'cancelar' && (
          <CancelTripModal
            key="c"
            viaje={viaje}
            onCancelado={() => {
              setModal(null)
              reload()
            }}
            onClose={() => setModal(null)}
          />
        )}
      </AnimatePresence>
    </PhoneFrame>
  )
}

/** RF-11: cancelar con motivo opcional; los pasajeros reciben aviso en la app. */
function CancelTripModal({ viaje, onCancelado, onClose }) {
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const afectados = viaje.reservas.filter((r) => ['solicitada', 'confirmada'].includes(r.estado)).length

  const cancelar = async () => {
    setEnviando(true)
    setError(null)
    try {
      await api.post(`/viajes/${viaje.id}/cancelar`, { motivo: motivo.trim() || undefined })
      onCancelado()
    } catch (err) {
      setError(err)
      setEnviando(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <ModalHeader eyebrow="Cancelar viaje" title="¿Seguro que no sales?" onClose={onClose} />
      <p className="text-sm text-muted">
        {afectados
          ? `${afectados} pasajero(s) con reserva o solicitud recibirán un aviso en la app.`
          : 'Nadie ha reservado todavía.'}
      </p>
      <label className="mt-3 block text-sm font-medium">
        Motivo (opcional)
        <textarea
          className={`${inputClass} h-20 py-2`}
          maxLength={300}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ej. Se me descompuso el auto"
        />
      </label>
      <ErrorBanner error={error} className="mt-3" />
      <PrimaryButton variante="peligro" className="mt-4" onClick={cancelar} disabled={enviando}>
        {enviando ? 'Cancelando…' : 'Cancelar viaje'}
      </PrimaryButton>
    </Modal>
  )
}
