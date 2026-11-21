import { MapPin } from 'lucide-react'
import { MapLegend, RouteMap } from './RouteMap'

/** "Mapa del recorrido" de los detalles: mapa grande, etiqueta abajo a la izquierda y leyenda. */
export function TripMap({ polilinea, marcadores, etiqueta, leyenda, vivo = null }) {
  return (
    <div className="trip-map">
      <div className="relative">
        <RouteMap polilinea={polilinea} marcadores={marcadores} vivo={vivo} alto={340} />
        {etiqueta && (
          <span className="trip-map__pill">
            <MapPin size={16} /> {etiqueta}
          </span>
        )}
      </div>
      {leyenda && <MapLegend tipos={leyenda} />}
    </div>
  )
}
