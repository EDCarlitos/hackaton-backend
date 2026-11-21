import { useState } from 'react'
import { PointPicker } from '../forms/PointPicker'
import { TimeChips } from '../forms/TimeChips'
import { HORAS_BUSQUEDA, ORDENES } from '../../lib/horas'
import { Modal, ModalHeader } from '../ui/Modal'
import { PrimaryButton } from '../ui/PrimaryButton'

/**
 * Filtros de "Conductores disponibles" (RF-12, RF-13): dónde te recogen, dónde te bajas (opcional),
 * a qué hora y en qué orden. Se aplican al tocar "Ver conductores".
 * inicial/onAplicar: { recogida, bajada, hora: { id, otra }, orden }.
 */
export function SearchModal({ inicial, onAplicar, onClose }) {
  const [filtros, setFiltros] = useState(inicial)
  const cambiar = (campo) => (valor) => setFiltros((f) => ({ ...f, [campo]: valor }))

  return (
    <Modal onClose={onClose}>
      <ModalHeader title="Filtros" onClose={onClose} />
      <form
        className="grid grid-cols-1 gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (filtros.recogida) onAplicar(filtros)
        }}
      >
        <PointPicker
          label="Te recogen en"
          value={filtros.recogida}
          onChange={cambiar('recogida')}
          placeholder="Calle, colonia o lugar"
          autoFocus={!filtros.recogida}
        />
        <PointPicker
          label="Te bajas en"
          value={filtros.bajada}
          onChange={cambiar('bajada')}
          opcional
          placeholder="Solo los que van hacia allá"
        />
        <div className="grid grid-cols-1 gap-2">
          <span className="text-sm font-medium">Hora</span>
          <TimeChips opciones={HORAS_BUSQUEDA} valor={filtros.hora} onChange={cambiar('hora')} etiqueta="Hora de salida" />
        </div>
        <div className="grid grid-cols-1 gap-2">
          <span className="text-sm font-medium">Ordenar por</span>
          <div className="chip-row" role="group" aria-label="Ordenar por">
            {ORDENES.map((o) => (
              <button key={o} type="button" className="chip" aria-pressed={filtros.orden === o} onClick={() => cambiar('orden')(o)}>
                {o}
              </button>
            ))}
          </div>
        </div>
        <PrimaryButton type="submit" disabled={!filtros.recogida}>
          {filtros.recogida ? 'Ver conductores' : 'Elige dónde te recogen'}
        </PrimaryButton>
      </form>
    </Modal>
  )
}
