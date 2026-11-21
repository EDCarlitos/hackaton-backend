import { useState } from 'react'
import { Check, Clock3, Footprints, User } from 'lucide-react'
import { api } from '../../lib/api'
import { ESTADO_RESERVA, formatCosto, formatDia, formatMetros, formatRangoHora } from '../../lib/format'
import { RouteMap, MapLegend } from '../map/RouteMap'
import { ErrorBanner } from '../ui/Feedback'
import { Modal, ModalHeader } from '../ui/Modal'
import { PrimaryButton } from '../ui/PrimaryButton'
import { Route } from '../trip/Route'
import { SeatCount } from '../trip/SeatCount'

/**
 * Resultado de búsqueda (RF-14) y botón para pedir 1 asiento (RF-15).
 * resultado: un elemento de GET /viajes/buscar. recogida/bajada: lo que eligió el pasajero.
 */
export function RideModal({ resultado, recogida, bajada, onReservado, onVerReserva, onClose }) {
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [miReserva, setMiReserva] = useState(resultado.mi_reserva)

  const solicitar = async () => {
    setEnviando(true)
    setError(null)
    try {
      const { reserva } = await api.post('/reservas', { viaje_id: resultado.viaje_id, recogida, bajada: bajada || undefined })
      setMiReserva({ id: reserva.id, estado: reserva.estado })
      onReservado?.()
    } catch (err) {
      setError(err)
    } finally {
      setEnviando(false)
    }
  }

  const marcadores = [
    { ...resultado.origen, tipo: 'origen' },
    { ...resultado.destino, tipo: 'destino' },
    { ...recogida, tipo: 'recogida' },
    { ...resultado.punto_abordaje, tipo: 'abordaje' },
  ]

  return (
    <Modal onClose={onClose}>
      <ModalHeader eyebrow="Viaje compatible" title={`${formatDia(resultado.salida_en)}, ${resultado.conductor.nombre_visible}`} onClose={onClose} />
      <RouteMap polilinea={resultado.ruta.polilinea} marcadores={marcadores} alto={170} />
      <MapLegend tipos={['origen', 'destino', 'recogida', 'abordaje']} />
      <div className="mt-3 rounded-2xl bg-surface p-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-white">
              <User size={19} />
            </span>
            <span>
              <b className="block text-sm">{resultado.conductor.nombre_visible}</b>
              <small className="text-xs text-muted">{resultado.vehiculo.placa_o_descripcion}</small>
            </span>
          </span>
          <span className="text-xs font-medium">
            <Clock3 size={14} className="mr-1 inline" />
            {formatRangoHora(resultado.salida_en, resultado.ruta.duracion_min)}
          </span>
        </div>
        <div className="mt-4 border-t border-line pt-4">
          <Route origen={resultado.origen} destino={resultado.destino} />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs">
          <SeatCount
            taken={resultado.asientos_ofrecidos - resultado.asientos_disponibles}
            total={resultado.asientos_ofrecidos}
          />
          <span className="flex items-center gap-1">
            <Footprints size={14} /> {formatMetros(resultado.distancia_pie_m)} a pie hasta la ruta
          </span>
        </div>
        <p className="mt-2 text-xs text-muted">
          {formatCosto(resultado.costo_referencia)} · sale {Math.abs(resultado.diferencia_min)} min{' '}
          {resultado.diferencia_min < 0 ? 'antes' : 'después'} de tu hora
        </p>
      </div>

      <ErrorBanner error={error} className="mt-4" />
      {miReserva ? (
        <div className="mt-4 grid gap-3">
          <div className="flex items-center gap-3 rounded-xl bg-coral/10 p-3 text-sm">
            <span className="grid size-7 place-items-center rounded-full bg-coral">
              <Check size={16} />
            </span>
            <span>
              <b className="block">{ESTADO_RESERVA[miReserva.estado]}</b>
              {miReserva.estado === 'solicitada'
                ? 'Te avisaremos cuando el conductor acepte.'
                : 'Revisa el detalle y el chat del viaje.'}
            </span>
          </div>
          <PrimaryButton variante="secundario" onClick={() => onVerReserva(resultado.viaje_id)}>
            Ver mi reserva
          </PrimaryButton>
        </div>
      ) : (
        <PrimaryButton className="mt-5" onClick={solicitar} disabled={enviando}>
          {enviando ? 'Enviando…' : 'Solicitar 1 asiento'}
        </PrimaryButton>
      )}
      <p className="mt-3 text-center text-[11px] text-muted">
        El costo es solo una referencia no vinculante; la app no procesa pagos.
      </p>
    </Modal>
  )
}
