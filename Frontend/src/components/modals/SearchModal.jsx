import { useState } from 'react'
import { PointPicker } from '../forms/PointPicker'
import { inputClass } from '../ui/Feedback'
import { Modal, ModalHeader } from '../ui/Modal'
import { PrimaryButton } from '../ui/PrimaryButton'

/** ¿A dónde vas? Punto de recogida, de bajada (opcional) y hora deseada (RF-12). */
export function SearchModal({ inicial, onBuscar, onClose }) {
  const [recogida, setRecogida] = useState(inicial.recogida)
  const [bajada, setBajada] = useState(inicial.bajada)
  const [cuando, setCuando] = useState(inicial.cuando)

  return (
    <Modal onClose={onClose}>
      <ModalHeader title="¿A dónde vas?" onClose={onClose} />
      <form
        className="grid grid-cols-1 gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (recogida) onBuscar({ recogida, bajada, cuando })
        }}
      >
        <PointPicker label="Punto de recogida" value={recogida} onChange={setRecogida} placeholder="¿Dónde te recogen?" />
        <PointPicker label="Punto de bajada" value={bajada} onChange={setBajada} opcional placeholder="¿Dónde te bajas?" />
        <label className="text-sm font-medium">
          Hora deseada
          <input
            type="datetime-local"
            className={inputClass}
            value={cuando}
            onChange={(e) => setCuando(e.target.value)}
            required
          />
        </label>
        <PrimaryButton type="submit" disabled={!recogida}>
          Buscar conductores
        </PrimaryButton>
      </form>
    </Modal>
  )
}
