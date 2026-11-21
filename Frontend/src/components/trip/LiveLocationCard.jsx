import { haceTexto, useAhora, useCompartirUbicacion, useUbicacionConductor } from '../../hooks/useUbicacion'
import { formatHora } from '../../lib/format'

/**
 * Vista del conductor: compartir su ubicación en vivo con los pasajeros confirmados.
 * Solo dentro de la ventana del viaje y con la app abierta (RNF-03); no se guarda el recorrido.
 */
export function LiveLocationCard({ viajeId }) {
  const { ventana } = useUbicacionConductor(viajeId, { intervaloMs: 30_000 })
  const { compartiendo, ultimaEnviada, error, iniciar, detener } = useCompartirUbicacion(viajeId)
  const ahora = useAhora()
  if (!ventana) return null

  let texto
  if (!ventana.abierta) texto = `Podrás compartirla desde las ${formatHora(ventana.desde)}, 30 min antes de salir.`
  else if (compartiendo && ultimaEnviada) texto = `Tus pasajeros confirmados te ven · actualizada ${haceTexto(ultimaEnviada, ahora)}.`
  else if (compartiendo) texto = 'Buscando tu ubicación…'
  else texto = 'Tus pasajeros confirmados verán dónde vas. Solo con la app abierta; no guardamos tu recorrido.'

  return (
    <section className="live-card">
      <div className="live-card__head">
        <span className={`live-dot ${compartiendo ? 'live-dot--on' : ''}`} aria-hidden="true" />
        <div>
          <b>Ubicación en vivo</b>
          <p>{texto}</p>
        </div>
      </div>
      {ventana.abierta &&
        (compartiendo ? (
          <button type="button" className="live-btn live-btn--off" onClick={detener}>
            Dejar de compartir
          </button>
        ) : (
          <button type="button" className="live-btn" onClick={iniciar}>
            Compartir mi ubicación
          </button>
        ))}
      {error && <p className="text-xs text-coral">{error}</p>}
    </section>
  )
}
