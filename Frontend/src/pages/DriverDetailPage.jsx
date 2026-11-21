import { useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { Ban, CarFront, Check, CircleCheck, Copy, Inbox, User, X } from 'lucide-react'
import { TripChat } from '../components/chat/TripChat'
import { BottomNav } from '../components/layout/BottomNav'
import { DetailHeader } from '../components/layout/DetailHeader'
import { PhoneFrame } from '../components/layout/PhoneFrame'
import { TripMap } from '../components/map/TripMap'
import { RepublishModal } from '../components/modals/RepublishModal'
import { ErrorBanner, inputClass, Loading } from '../components/ui/Feedback'
import { Modal, ModalHeader } from '../components/ui/Modal'
import { PrimaryButton } from '../components/ui/PrimaryButton'
import { PAGES } from '../constants/pages'
import { useAsync } from '../hooks/useAsync'
import { useChat } from '../hooks/useChat'
import { api } from '../lib/api'
import {
  ESTADO_RESERVA,
  ESTADO_VIAJE,
  formatCosto,
  formatDia,
  formatMetros,
  formatRangoHora,
  formatRuta,
  tonoEstado,
} from '../lib/format'
import { TripDetailPage } from './TripDetailPage'

// Qué sigue para el conductor, según el estado del viaje y sus solicitudes.
function siguientePaso(viaje, pendientes, confirmados) {
  const libres = viaje.asientos_disponibles
  const n = confirmados.length
  if (viaje.estado === 'cancelado') {
    return { icono: Ban, titulo: 'Viaje cancelado', texto: viaje.motivo_cancelacion || 'Los pasajeros recibieron un aviso.' }
  }
  if (viaje.estado === 'finalizado') {
    return { tono: 'teal', icono: CircleCheck, titulo: 'Viaje finalizado', texto: `Compartiste el viaje con ${n} pasajero${n === 1 ? '' : 's'}.` }
  }
  if (pendientes.length) {
    return {
      tono: 'coral',
      icono: Inbox,
      titulo: `${pendientes.length} solicitud${pendientes.length === 1 ? '' : 'es'} por responder`,
      texto: 'Acepta o rechaza abajo. Si el viaje se llena, las demás se rechazan solas.',
    }
  }
  if (viaje.estado === 'en_curso') return { tono: 'coral', icono: CarFront, titulo: 'En camino', texto: 'Buen viaje.' }
  if (viaje.estado === 'lleno') return { tono: 'teal', icono: CircleCheck, titulo: 'Viaje lleno', texto: `Llevas ${n} pasajero${n === 1 ? '' : 's'}.` }
  if (n) {
    return {
      tono: 'teal',
      icono: CircleCheck,
      titulo: `${n} pasajero${n === 1 ? '' : 's'} confirmado${n === 1 ? '' : 's'}`,
      texto: `Te queda${libres === 1 ? '' : 'n'} ${libres} lugar${libres === 1 ? '' : 'es'} libre${libres === 1 ? '' : 's'}.`,
    }
  }
  return { icono: CarFront, titulo: 'Viaje publicado', texto: 'Te avisamos cuando alguien pida lugar.' }
}

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
  const paso = viaje && siguientePaso(viaje, pendientes, confirmados)
  const IconoPaso = paso?.icono

  return (
    <PhoneFrame className="app-screen">
      <DetailHeader
        subtitle="Vista de conductor"
        status={viaje && ESTADO_VIAJE[viaje.estado]}
        statusTono={viaje && tonoEstado(viaje.estado)}
        onBack={() => navigate(PAGES.HISTORY)}
      />
      {cargando && <Loading />}
      <ErrorBanner error={error} className="mt-4" />

      {viaje && (
        <>
          <div className={`next-step ${paso.tono ? `next-step--${paso.tono}` : ''}`}>
            <IconoPaso size={20} />
            <div>
              <b>{paso.titulo}</b>
              <p>{paso.texto}</p>
            </div>
          </div>

          <TripMap
            polilinea={viaje.ruta.polilinea}
            etiqueta={`${viaje.ruta.distancia_km} km · ${viaje.ruta.duracion_min} min`}
            marcadores={[
              { ...viaje.origen, tipo: 'origen' },
              { ...viaje.destino, tipo: 'destino' },
              ...pendientes.map((r) => ({ ...r.recogida, tipo: 'recogida', etiqueta: r.pasajero.nombre_visible.split(' ')[0] })),
              ...confirmados
                .filter((r) => r.punto_abordaje)
                .map((r) => ({ ...r.punto_abordaje, tipo: 'abordaje', etiqueta: r.pasajero.nombre_visible.split(' ')[0] })),
            ]}
            leyenda={pendientes.length || confirmados.length ? ['origen', 'destino', 'recogida', 'abordaje'] : undefined}
          />

          <ErrorBanner error={accionError} className="mt-4" />
          {aviso && <p className="note">{aviso}</p>}

          {pendientes.length > 0 && (
            <section className="passengers">
              <header>
                <b>Solicitudes</b>
                <small>
                  {pendientes.length} por responder
                </small>
              </header>
              {pendientes.map((r) => (
                <div className="passenger" key={r.id}>
                  <span className="avatar">
                    <User size={20} />
                  </span>
                  <p>
                    <b>{r.pasajero.nombre_visible}</b>
                    <small>
                      {r.recogida.texto || 'Punto en el mapa'} · a {formatMetros(r.distancia_pie_m ?? 0)} de tu ruta
                    </small>
                  </p>
                  <div className="passenger-actions">
                    <button
                      type="button"
                      aria-label={`Rechazar a ${r.pasajero.nombre_visible}`}
                      disabled={ocupado === r.id}
                      onClick={() => responder(r, 'rechazar')}
                    >
                      <X size={16} />
                    </button>
                    <button
                      type="button"
                      className="accept"
                      aria-label={`Aceptar a ${r.pasajero.nombre_visible}`}
                      disabled={ocupado === r.id || viaje.asientos_disponibles < 1}
                      onClick={() => responder(r, 'aceptar')}
                    >
                      <Check size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </section>
          )}

          <section className="passengers">
            <header>
              <b>Pasajeros</b>
              <small>
                {viaje.asientos_ofrecidos - viaje.asientos_disponibles} de {viaje.asientos_ofrecidos} plazas
              </small>
            </header>
            {!confirmados.length && <p className="empty-row">Aún no hay pasajeros confirmados.</p>}
            {confirmados.map((r, index) => (
              <div className="passenger" key={r.id}>
                <span className="avatar">
                  <User size={20} />
                </span>
                <p>
                  <b>{r.pasajero.nombre_visible}</b>
                  <small>1 plaza · {r.recogida.texto || 'punto en el mapa'}</small>
                </p>
                <em title={ESTADO_RESERVA[r.estado]}>{r.estado === 'completada' ? '✓' : String(index + 1).padStart(2, '0')}</em>
              </div>
            ))}
            <footer>
              <b>{formatRuta(viaje.origen, viaje.destino)}</b>
              <small>
                {formatRangoHora(viaje.salida_en, viaje.ruta.duracion_min)} · {formatDia(viaje.salida_en)} ·{' '}
                {formatCosto(viaje.costo_referencia)}
              </small>
              {otras.length > 0 && (
                <small>
                  Cerradas:{' '}
                  {otras.map((r) => `${r.pasajero.nombre_visible.split(' ')[0]} (${ESTADO_RESERVA[r.estado].toLowerCase()})`).join(', ')}
                </small>
              )}
            </footer>
          </section>

          <TripChat chat={chat} />

          <div className="detail-actions">
            <PrimaryButton variante="secundario" onClick={() => setModal('republicar')}>
              <Copy size={16} className="mr-2 inline" /> Publicar de nuevo
            </PrimaryButton>
            {cancelable && (
              <button type="button" className="danger-link" onClick={() => setModal('cancelar')}>
                Cancelar este viaje
              </button>
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
