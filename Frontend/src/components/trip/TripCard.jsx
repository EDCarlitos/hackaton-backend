import { motion } from 'motion/react'
import { Clock3 } from 'lucide-react'
import { Route } from './Route'

/**
 * Tarjeta de viaje genérica: búsqueda, "Mis viajes" (conductor y pasajero).
 * `chip` y `pie` son nodos opcionales (estado, asientos, distancia, acciones).
 */
export function TripCard({ titulo, horario, origen, destino, chip, pie, onClick, apagada = false }) {
  return (
    <motion.article
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.985 }}
      className={`trip-card ${apagada ? 'trip-card--off' : ''}`}
      onClick={onClick}
    >
      <div className="trip-title">
        <b>{titulo}</b>
        <span>
          <Clock3 size={14} /> {horario}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Route origen={origen} destino={destino} />
        {chip}
      </div>
      {pie && <div className="trip-footer">{pie}</div>}
    </motion.article>
  )
}
