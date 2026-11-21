import { CarFront, ChevronRight } from 'lucide-react'
import { ESTADO_RESERVA, ESTADO_VIAJE, formatDiaHora, formatRuta, tonoEstado } from '../../lib/format'
import { StatusChip } from '../ui/StatusChip'

/** Viaje actual o próximo del usuario, como conductor o como pasajero. Toda la tarjeta abre el viaje. */
export function CurrentTripCard({ proximo, onView }) {
  const conduce = proximo.papel === 'conductor'
  const enCurso = proximo.estado === 'en_curso' || proximo.yaSalio
  const estado = conduce ? ESTADO_VIAJE[proximo.estado] : ESTADO_RESERVA[proximo.estado]
  return (
    <button type="button" className="current-trip" onClick={onView}>
      <span className="current-trip__top">
        <span>
          <CarFront size={18} /> {enCurso ? 'Viaje actual' : conduce ? 'Tu próximo viaje · conduces' : 'Tu próximo viaje'}
        </span>
        <StatusChip tono={tonoEstado(proximo.estado)}>{estado}</StatusChip>
      </span>
      <b className="current-trip__route">{formatRuta(proximo.origen, proximo.destino)}</b>
      <span className="current-trip__bottom">
        <span>
          <b className={proximo.pendientes > 0 ? 'text-coral' : ''}>{conduce ? proximo.detalle : proximo.conductor}</b>
          <small>{formatDiaHora(proximo.salida_en)}</small>
        </span>
        <span className="text-link">
          Ver viaje <ChevronRight size={18} />
        </span>
      </span>
    </button>
  )
}
