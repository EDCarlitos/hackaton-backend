import { useEffect } from 'react'
import { useAsync } from '../../hooks/useAsync'
import { api } from '../../lib/api'
import { formatDiaHora } from '../../lib/format'
import { Empty, ErrorBanner, Loading } from '../ui/Feedback'
import { Modal, ModalHeader } from '../ui/Modal'

// Avisos que le interesan al conductor de ese viaje (el resto son para el pasajero).
const PARA_CONDUCTOR = new Set(['reserva_solicitada', 'reserva_cancelada'])

/** Avisos dentro de la app. Al abrir se marcan como leídos los que no lo estaban. */
export function NotificationsModal({ onAbrirViaje, onLeidas, onClose }) {
  const { data, error, cargando } = useAsync(() => api.get('/notificaciones', { limite: 30 }))

  useEffect(() => {
    const pendientes = (data?.notificaciones || []).filter((n) => !n.leida_en)
    if (!pendientes.length) return
    Promise.all(pendientes.map((n) => api.post(`/notificaciones/${n.id}/leida`)))
      .then(onLeidas)
      .catch(() => {})
  }, [data, onLeidas])

  return (
    <Modal onClose={onClose}>
      <ModalHeader title="Notificaciones" onClose={onClose} />
      <ErrorBanner error={error} />
      {cargando && <Loading />}
      {data && !data.notificaciones.length && <Empty>No tienes notificaciones.</Empty>}
      <div className="grid max-h-[60vh] gap-2 overflow-auto">
        {data?.notificaciones.map((n) => (
          <button
            key={n.id}
            type="button"
            className={`rounded-xl p-4 text-left text-sm ${n.leida_en ? 'bg-surface' : 'bg-coral/10'}`}
            onClick={() => n.viaje_id && onAbrirViaje(n.viaje_id, PARA_CONDUCTOR.has(n.tipo) ? 'conductor' : 'pasajero')}
          >
            <b className="block">{n.titulo}</b>
            <span className="mt-1 block text-muted">{n.mensaje}</span>
            <small className="mt-1 block text-[11px] text-muted">{formatDiaHora(n.creada_en)}</small>
          </button>
        ))}
      </div>
    </Modal>
  )
}
