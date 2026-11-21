import { CarFront, ChevronRight } from 'lucide-react'
import { ESTADO_RESERVA, ESTADO_VIAJE, formatDiaHora, formatRuta } from '../../lib/format'

/** Viaje actual o próximo del usuario, como conductor o como pasajero. */
export function CurrentTripCard({ proximo, onView }) {
  const conduce = proximo.papel === 'conductor'
  const enCurso = proximo.estado === 'en_curso' || proximo.yaSalio
  const estado = conduce ? ESTADO_VIAJE[proximo.estado] : ESTADO_RESERVA[proximo.estado]
  return (
    <section className="current-trip">
      <div>
        <span>
          <CarFront size={20} /> {enCurso ? 'Viaje actual' : 'Próximo viaje'}
          {conduce && <small className="font-normal text-muted">· conduces</small>}
        </span>
        <span className="current-trip__state">{estado}</span>
      </div>
      <h2>{formatRuta(proximo.origen, proximo.destino)}</h2>
      <footer>
        <p>
          <b>{conduce ? proximo.detalle : proximo.conductor}</b>
          <small>{formatDiaHora(proximo.salida_en)}</small>
        </p>
        <button type="button" className="text-link" onClick={onView}>
          Ver viaje <ChevronRight size={18} />
        </button>
      </footer>
    </section>
  )
}
