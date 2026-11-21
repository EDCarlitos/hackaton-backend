import { MapPin } from 'lucide-react'
import { RouteMap } from './RouteMap'

/** "Mapa del recorrido" de los detalles: mapa de 254 px con una etiqueta abajo a la izquierda. */
export function TripMap({ polilinea, marcadores, etiqueta }) {
  return (
    <div className="trip-map">
      <RouteMap polilinea={polilinea} marcadores={marcadores} alto={254} />
      {etiqueta && (
        <span className="trip-map__pill">
          <MapPin size={16} /> {etiqueta}
        </span>
      )}
    </div>
  )
}
