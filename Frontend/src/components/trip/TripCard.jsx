import tripTime from '../../assets/figma/trip-time.svg'
import { Route } from './Route'

/**
 * Tarjeta de viaje (borde izquierdo coral): "Conductores disponibles" e historial.
 * `estado` va arriba (chip, historial); `extra` a la derecha de la ruta; `pie` abajo.
 */
export function TripCard({ titulo, horario, origen, destino, estado, extra, pie, onClick, apagada = false, historial = false }) {
  const clases = ['trip-card', historial && 'trip-card--history', apagada && 'trip-card--off'].filter(Boolean).join(' ')
  return (
    <article
      className={clases}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.()
        }
      }}
    >
      {estado && <div>{estado}</div>}
      <div className="trip-row trip-title">
        <b>{titulo}</b>
        <span className="trip-time">
          <img src={tripTime} width="14" height="14" alt="" /> {horario}
        </span>
      </div>
      <div className="trip-row">
        <Route origen={origen} destino={destino} />
        {extra}
      </div>
      {pie && <div className="trip-row trip-footer">{pie}</div>}
    </article>
  )
}
