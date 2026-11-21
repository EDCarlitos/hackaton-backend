import { useState } from 'react'
import { CircleCheck, CircleX, Hourglass, Leaf } from 'lucide-react'
import { TripChat } from '../components/chat/TripChat'
import { BottomNav } from '../components/layout/BottomNav'
import { DetailHeader } from '../components/layout/DetailHeader'
import { PhoneFrame } from '../components/layout/PhoneFrame'
import { TripMap } from '../components/map/TripMap'
import { TripInfo } from '../components/trip/TripInfo'
import { ErrorBanner, Loading } from '../components/ui/Feedback'
import { PrimaryButton } from '../components/ui/PrimaryButton'
import { PAGES } from '../constants/pages'
import { useAsync } from '../hooks/useAsync'
import { useChat } from '../hooks/useChat'
import { api } from '../lib/api'
import { ESTADO_RESERVA, ESTADO_VIAJE, formatDiaHora, formatHora, formatMetros, tonoEstado } from '../lib/format'

// Qué sigue para el pasajero, según el estado de su reserva.
function siguientePaso(viaje, reserva) {
  const lugar = reserva?.recogida?.texto || 'el punto que elegiste'
  switch (reserva?.estado) {
    case 'solicitada':
      return {
        tono: 'coral',
        icono: Hourglass,
        titulo: 'Esperando al conductor',
        texto: `Te avisamos en cuanto acepte. Pediste que te recogieran en ${lugar}.`,
      }
    case 'confirmada':
      return {
        tono: 'teal',
        icono: CircleCheck,
        titulo: '¡Tienes lugar!',
        texto: reserva.punto_abordaje
          ? `Camina al punto de abordaje (turquesa en el mapa) y llega antes de las ${formatHora(viaje.salida_en)}. El conductor no hace desvíos.`
          : `Te recogen en ${lugar} a las ${formatHora(viaje.salida_en)}.`,
      }
    case 'completada':
      return { tono: 'teal', icono: Leaf, titulo: 'Viaje completado', texto: 'Sumó a tu impacto ambiental.', accion: 'impacto' }
    case 'rechazada':
      return { icono: CircleX, titulo: 'No hubo lugar', texto: 'El conductor no aceptó o el viaje se llenó.', accion: 'buscar' }
    case 'expirada':
      return { icono: CircleX, titulo: 'La solicitud expiró', texto: 'El viaje salió sin respuesta.', accion: 'buscar' }
    case 'cancelada':
      return { icono: CircleX, titulo: 'Reserva cancelada', texto: 'Ya no tienes lugar en este viaje.', accion: 'buscar' }
    default:
      return { icono: CircleX, titulo: 'No tienes reserva aquí', texto: 'Busca un viaje que pase cerca de ti.', accion: 'buscar' }
  }
}

/** Detalle del viaje, vista de pasajero ({ viajeId }). */
export function TripDetailPage({ navigate, params }) {
  const { viajeId } = params
  const { data, error, cargando, reload } = useAsync(
    () => api.get(`/viajes/${viajeId}`).then((d) => ({ ...d, yaSalio: new Date(d.viaje.salida_en).getTime() <= Date.now() })),
    viajeId,
    { intervaloMs: 10_000 },
  )
  const chat = useChat(viajeId)
  const [confirmarCancelar, setConfirmarCancelar] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [accionError, setAccionError] = useState(null)

  const viaje = data?.viaje
  const reserva = viaje?.mi_reserva
  const cancelable = reserva && ['solicitada', 'confirmada'].includes(reserva.estado) && !data.yaSalio
  const estado = reserva
    ? { texto: ESTADO_RESERVA[reserva.estado], tono: tonoEstado(reserva.estado) }
    : viaje && { texto: ESTADO_VIAJE[viaje.estado], tono: tonoEstado(viaje.estado) }
  const paso = viaje && siguientePaso(viaje, reserva)
  const IconoPaso = paso?.icono

  const cancelar = async () => {
    setEnviando(true)
    setAccionError(null)
    try {
      await api.post(`/reservas/${reserva.id}/cancelar`)
      setConfirmarCancelar(false)
      reload()
    } catch (err) {
      setAccionError(err)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <PhoneFrame className="app-screen">
      <DetailHeader
        subtitle={viaje ? (viaje.estado === 'en_curso' ? 'Viaje actual' : formatDiaHora(viaje.salida_en)) : 'Cargando…'}
        status={estado?.texto}
        statusTono={estado?.tono}
        onBack={() => navigate(PAGES.HISTORY)}
      />
      {cargando && <Loading />}
      <ErrorBanner error={error} className="mt-4" />

      {viaje && (
        <>
          <div className={`next-step ${paso.tono ? `next-step--${paso.tono}` : ''}`}>
            <IconoPaso size={20} />
            <div>
              <b>{paso.titulo}</b>
              <p>{paso.texto}</p>
              {paso.accion === 'buscar' && (
                <button type="button" onClick={() => navigate(PAGES.HOME)}>
                  Buscar otro viaje
                </button>
              )}
              {paso.accion === 'impacto' && (
                <button type="button" onClick={() => navigate(PAGES.IMPACT)}>
                  Ver mi impacto
                </button>
              )}
            </div>
          </div>

          <TripMap
            polilinea={viaje.ruta.polilinea}
            etiqueta={
              reserva?.distancia_pie_m != null
                ? `Recogida a ${formatMetros(reserva.distancia_pie_m)}`
                : `${viaje.ruta.distancia_km} km · ${viaje.ruta.duracion_min} min`
            }
            marcadores={[
              { ...viaje.origen, tipo: 'origen' },
              { ...viaje.destino, tipo: 'destino' },
              ...(reserva ? [{ ...reserva.recogida, tipo: 'recogida', etiqueta: 'Tú' }] : []),
              ...(reserva?.punto_abordaje ? [{ ...reserva.punto_abordaje, tipo: 'abordaje', etiqueta: 'Abordaje' }] : []),
            ]}
            leyenda={reserva?.punto_abordaje ? ['origen', 'destino', 'recogida', 'abordaje'] : ['origen', 'destino']}
          />

          <TripInfo viaje={viaje} />

          <TripChat chat={chat} />

          <ErrorBanner error={accionError} className="mt-4" />
          {cancelable && (
            <div className="detail-actions">
              {confirmarCancelar ? (
                <>
                  <p className="text-center text-sm">
                    {reserva.estado === 'confirmada' ? 'Tu asiento quedará libre para otra persona.' : 'Se retirará tu solicitud.'}
                  </p>
                  <PrimaryButton variante="peligro" onClick={cancelar} disabled={enviando}>
                    {enviando ? 'Cancelando…' : 'Sí, cancelar mi reserva'}
                  </PrimaryButton>
                  <PrimaryButton variante="secundario" onClick={() => setConfirmarCancelar(false)}>
                    No, mantenerla
                  </PrimaryButton>
                </>
              ) : (
                <button type="button" className="danger-link" onClick={() => setConfirmarCancelar(true)}>
                  Cancelar mi reserva
                </button>
              )}
            </div>
          )}
        </>
      )}

      <BottomNav activePage={PAGES.HISTORY} navigate={navigate} />
    </PhoneFrame>
  )
}
