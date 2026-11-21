import { useState } from 'react'
import { Check, Footprints } from 'lucide-react'
import { api } from '../../lib/api'
import { ESTADO_RESERVA, formatDia, formatHora, formatMetros } from '../../lib/format'
import { MapLegend, RouteMap } from '../map/RouteMap'
import { TripInfo } from '../trip/TripInfo'
import { ErrorBanner } from '../ui/Feedback'
import { Modal, ModalHeader } from '../ui/Modal'
import { PrimaryButton } from '../ui/PrimaryButton'

/**
 * Resultado de búsqueda (RF-14) y botón para pedir 1 asiento (RF-15).
 * resultado: un elemento de /viajes/buscar o /viajes/proximos. recogida/bajada: lo que eligió el pasajero
 * (puede no haber recogida: entonces se pide elegirla antes de solicitar). conHora: se buscó a una hora concreta.
 */
export function RideModal({ resultado, recogida, bajada, conHora, onReservado, onVerReserva, onElegirRecogida, onClose }) {
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

  // Solo los puntos que existen (sin recogida no hay punto de abordaje).
  const marcadores = [
    { ...resultado.origen, tipo: 'origen' },
    { ...resultado.destino, tipo: 'destino' },
    recogida && { ...recogida, tipo: 'recogida' },
    resultado.punto_abordaje && { ...resultado.punto_abordaje, tipo: 'abordaje' },
  ].filter(Boolean)

  return (
    <Modal onClose={onClose}>
      <ModalHeader
        eyebrow={`${recogida ? 'Pasa cerca de ti' : 'Viaje disponible'} · ${resultado.conductor.nombre_visible}`}
        title={`${formatDia(resultado.salida_en)} a las ${formatHora(resultado.salida_en)}`}
        onClose={onClose}
      />
      <div className="relative">
        <RouteMap polilinea={resultado.ruta.polilinea} marcadores={marcadores} alto={270} />
        {resultado.distancia_pie_m != null && (
          <span className="trip-map__pill">
            <Footprints size={16} /> {formatMetros(resultado.distancia_pie_m)} a pie hasta la ruta
          </span>
        )}
      </div>
      <MapLegend tipos={recogida ? ['origen', 'destino', 'recogida', 'abordaje'] : ['origen', 'destino']} />
      <div className="[&_.trip-info]:mt-3">
        <TripInfo viaje={resultado} />
      </div>
      {conHora && (
        <p className="mt-2 text-xs text-muted">
          Sale {Math.abs(resultado.diferencia_min)} min {resultado.diferencia_min < 0 ? 'antes' : 'después'} de tu hora.
        </p>
      )}

      <ErrorBanner error={error} className="mt-4" />
      {miReserva ? (
        <div className="mt-4 grid grid-cols-1 gap-3">
          <div className="flex items-center gap-3 rounded-xl bg-surface p-3 text-sm">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-coral text-white">
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
      ) : recogida ? (
        <PrimaryButton className="mt-5" onClick={solicitar} disabled={enviando}>
          {enviando ? 'Enviando…' : 'Pedir un lugar'}
        </PrimaryButton>
      ) : (
        // Para reservar, el backend necesita tu punto de recogida (debe quedar a ≤400 m de la ruta).
        <PrimaryButton className="mt-5" onClick={onElegirRecogida}>
          Elegir dónde te recogen
        </PrimaryButton>
      )}
      <p className="mt-3 text-center text-[11px] text-muted">
        El costo es solo una referencia no vinculante; la app no procesa pagos.
      </p>
    </Modal>
  )
}
