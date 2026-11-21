import { CarFront, ChevronRight } from 'lucide-react'
import { ESTADO_RESERVA, ESTADO_VIAJE, formatDiaHora, formatRuta } from '../../lib/format'
import { StatusChip } from '../ui/StatusChip'

/** Próximo viaje del usuario, como conductor o como pasajero. */
export function CurrentTripCard({ proximo, onView }) {
  const etiqueta = proximo.papel === 'conductor' ? 'Tu próximo viaje (conduces)' : 'Tu próximo viaje'
  const estado = proximo.papel === 'conductor' ? ESTADO_VIAJE[proximo.estado] : ESTADO_RESERVA[proximo.estado]
  return (
    <section className="current-trip">
      <div>
        <span>
          <CarFront size={20} /> {etiqueta}
        </span>
        <StatusChip>{estado}</StatusChip>
      </div>
      <h2>{formatRuta(proximo.origen, proximo.destino)}</h2>
      <footer>
        <p>
          <b>{proximo.papel === 'conductor' ? proximo.detalle : proximo.conductor}</b>
          <small>{formatDiaHora(proximo.salida_en)}</small>
        </p>
        <button type="button" onClick={onView}>
          Ver viaje <ChevronRight size={18} />
        </button>
      </footer>
    </section>
  )
}
