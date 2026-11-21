import { Armchair, MapPin, User } from 'lucide-react'
import { formatCosto, formatRangoHora } from '../../lib/format'

/** Tarjeta "Información del viaje": conductor, origen, destino y plazas ocupadas. */
export function TripInfo({ viaje }) {
  const ocupadas = viaje.asientos_ofrecidos - viaje.asientos_disponibles
  return (
    <section className="trip-info">
      <div className="trip-info__driver">
        <span className="avatar avatar--lg">
          <User size={24} />
        </span>
        <p>
          <b>{viaje.conductor?.nombre_visible || 'Tú conduces'}</b>
          <small>{viaje.vehiculo.placa_o_descripcion}</small>
        </p>
        <span className="trip-info__time">{formatRangoHora(viaje.salida_en, viaje.ruta.duracion_min)}</span>
      </div>
      <div className="trip-info__stops">
        <Stop className="stop--from" etiqueta="Origen" punto={viaje.origen} />
        <Stop etiqueta="Destino" punto={viaje.destino} />
      </div>
      <footer>
        <span>
          <Armchair size={16} /> {ocupadas} de {viaje.asientos_ofrecidos} plazas ocupadas
        </span>
        <span>{formatCosto(viaje.costo_referencia)}</span>
      </footer>
    </section>
  )
}

function Stop({ etiqueta, punto, className = '' }) {
  return (
    <div className={`stop ${className}`}>
      <MapPin size={18} />
      <p>
        <small>{etiqueta}</small>
        <b>{punto?.texto || 'Punto en el mapa'}</b>
      </p>
    </div>
  )
}
