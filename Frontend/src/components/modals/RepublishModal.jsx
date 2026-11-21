import { useState } from 'react'
import { api } from '../../lib/api'
import { aInputFechaHora, deInputFechaHora, formatRuta } from '../../lib/format'
import { ErrorBanner, inputClass } from '../ui/Feedback'
import { Modal, ModalHeader } from '../ui/Modal'
import { PrimaryButton } from '../ui/PrimaryButton'

// Misma hora del viaje original, pero mañana (o en un día futuro).
function sugerencia(salidaOriginal) {
  const original = new Date(salidaOriginal)
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(original.getHours(), original.getMinutes(), 0, 0)
  return aInputFechaHora(d)
}

/** RF-08: clona origen, destino, ruta y asientos; el conductor solo elige fecha y hora. */
export function RepublishModal({ viaje, onPublicado, onClose }) {
  const [salida, setSalida] = useState(() => sugerencia(viaje.salida_en))
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  const publicar = async () => {
    setEnviando(true)
    setError(null)
    try {
      const { viaje: nuevo } = await api.post(`/viajes/${viaje.id}/republicar`, { salida_en: deInputFechaHora(salida) })
      onPublicado(nuevo)
    } catch (err) {
      setError(err)
      setConfirmando(false)
      setEnviando(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <ModalHeader eyebrow="Publicar de nuevo" title={formatRuta(viaje.origen, viaje.destino)} onClose={onClose} />
      <p className="mb-3 text-sm text-muted">
        Se copian la ruta, los {viaje.asientos_ofrecidos} asientos y el vehículo. Solo elige la fecha y la hora.
      </p>
      <label className="text-sm font-medium">
        Nueva salida
        <input
          type="datetime-local"
          className={inputClass}
          value={salida}
          min={aInputFechaHora(new Date())}
          onChange={(e) => {
            setSalida(e.target.value)
            setConfirmando(false)
          }}
        />
      </label>
      <ErrorBanner error={error} className="mt-3" />
      {confirmando ? (
        <div className="mt-4 grid gap-2">
          <p className="rounded-xl bg-coral/10 p-3 text-sm">
            ¿Publicar para el <b>{new Date(salida).toLocaleString('es-MX', { dateStyle: 'full', timeStyle: 'short' })}</b>?
          </p>
          <PrimaryButton onClick={publicar} disabled={enviando}>
            {enviando ? 'Publicando…' : 'Sí, publicar'}
          </PrimaryButton>
        </div>
      ) : (
        <PrimaryButton className="mt-4" onClick={() => setConfirmando(true)} disabled={!salida}>
          Continuar
        </PrimaryButton>
      )}
    </Modal>
  )
}
