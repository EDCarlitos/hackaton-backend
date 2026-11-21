import { useState } from 'react'
import { CarFront, ChevronRight, Leaf, LogOut, Trash2, User } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useAsync } from '../../hooks/useAsync'
import { api } from '../../lib/api'
import { ErrorBanner, inputClass } from '../ui/Feedback'
import { Modal } from '../ui/Modal'
import { PrimaryButton } from '../ui/PrimaryButton'

/** Perfil: datos, vehículos (RF-03), aviso de privacidad (RNF-04) y cerrar sesión. */
export function ProfileModal({ onVerImpacto, onClose }) {
  const { usuario, cerrarSesion } = useAuth()
  const vehiculos = useAsync(() => api.get('/vehiculos'))
  const [error, setError] = useState(null)

  const desactivar = async (id) => {
    setError(null)
    try {
      await api.delete(`/vehiculos/${id}`)
      vehiculos.reload()
    } catch (err) {
      setError(err)
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="mb-5 flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-surface">
          <User size={22} />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{usuario.nombre_visible}</h2>
          <p className="text-sm text-muted">{usuario.correo}</p>
        </div>
      </div>

      {onVerImpacto && (
        <button
          type="button"
          className="mb-5 flex w-full items-center gap-3 rounded-xl bg-surface px-4 py-3 text-left text-sm"
          onClick={onVerImpacto}
        >
          <Leaf size={18} className="text-coral" />
          <span className="flex-1">
            <b className="block font-semibold">Tu impacto</b>
            <small className="text-muted">CO₂ que evitas al compartir el auto</small>
          </span>
          <ChevronRight size={18} />
        </button>
      )}

      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <CarFront size={16} /> Mis vehículos
      </h3>
      <div className="grid grid-cols-1 gap-2">
        {vehiculos.data?.vehiculos
          .filter((v) => v.activo)
          .map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2 text-sm">
              <span className="min-w-0">
                {v.placa_o_descripcion} <small className="text-muted">· {v.asientos} asientos</small>
              </span>
              <button type="button" className="shrink-0" aria-label="Desactivar vehículo" onClick={() => desactivar(v.id)}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        <VehicleForm onCreado={vehiculos.reload} compacto />
      </div>
      <ErrorBanner error={error} className="mt-2" />

      <details className="mt-4 text-xs text-muted">
        <summary className="cursor-pointer font-medium text-ink">Aviso de privacidad</summary>
        <p className="mt-2">
          RutaCaribe guarda lo mínimo: tu correo institucional, tu nombre visible y la placa o descripción de tu
          vehículo. A otros usuarios solo se les muestra tu nombre visible. Los orígenes se guardan como referencias
          aproximadas (sin domicilio exacto) y la app no rastrea tu ubicación en segundo plano: solo la usa si tocas
          “Usar mi ubicación”. El costo es una referencia no vinculante y la app no procesa pagos.
        </p>
      </details>

      <PrimaryButton variante="secundario" className="mt-5" onClick={cerrarSesion}>
        <LogOut size={16} className="mr-2 inline" /> Cerrar sesión
      </PrimaryButton>
    </Modal>
  )
}

/** Alta de vehículo (RF-03). Lo usan el perfil y la pantalla de publicar. */
export function VehicleForm({ onCreado, compacto = false }) {
  const [descripcion, setDescripcion] = useState('')
  const [asientos, setAsientos] = useState(4)
  const [abierto, setAbierto] = useState(!compacto)
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)

  const crear = async (e) => {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      const { vehiculo } = await api.post('/vehiculos', { placa_o_descripcion: descripcion, asientos: Number(asientos) })
      setDescripcion('')
      if (compacto) setAbierto(false)
      onCreado?.(vehiculo)
    } catch (err) {
      setError(err)
    } finally {
      setEnviando(false)
    }
  }

  if (!abierto) {
    return (
      <button type="button" className="rounded-xl border border-dashed border-line p-2 text-sm" onClick={() => setAbierto(true)}>
        + Agregar vehículo
      </button>
    )
  }

  return (
    <form onSubmit={crear} className="grid grid-cols-1 gap-2 rounded-xl border border-line p-3">
      <label className="text-sm font-medium">
        Placa o descripción
        <input
          className={inputClass}
          placeholder="Ej. Nissan March gris · UXP-123-A"
          maxLength={100}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          required
        />
      </label>
      <label className="text-sm font-medium">
        Asientos para pasajeros
        <select className={inputClass} value={asientos} onChange={(e) => setAsientos(e.target.value)}>
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <ErrorBanner error={error} />
      <PrimaryButton type="submit" disabled={enviando}>
        {enviando ? 'Guardando…' : 'Guardar vehículo'}
      </PrimaryButton>
    </form>
  )
}
