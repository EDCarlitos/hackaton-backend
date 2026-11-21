import { useState } from 'react'
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
import { ESTADO_RESERVA, ESTADO_VIAJE, esEstadoActivo, formatDiaHora, formatMetros } from '../lib/format'

const EXPLICACION = {
  solicitada: 'Tu solicitud está pendiente. Te avisaremos cuando el conductor la acepte o la rechace.',
  confirmada: '¡Tienes lugar! Llega al punto de abordaje unos minutos antes de la hora.',
  rechazada: 'El conductor no pudo aceptar tu solicitud (o el viaje se llenó). Busca otro viaje compatible.',
  cancelada: 'Esta reserva está cancelada.',
  completada: 'Viaje completado. Suma a tu contador de impacto.',
  expirada: 'La solicitud expiró porque el viaje salió sin respuesta.',
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
    ? { texto: ESTADO_RESERVA[reserva.estado], activo: esEstadoActivo(reserva.estado) }
    : viaje && { texto: ESTADO_VIAJE[viaje.estado], activo: esEstadoActivo(viaje.estado) }

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
        statusActivo={estado?.activo}
        onBack={() => navigate(PAGES.HISTORY)}
      />
      {cargando && <Loading />}
      <ErrorBanner error={error} className="mt-4" />

      {viaje && (
        <>
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
          />

          <TripInfo viaje={viaje} />

          <div className="note">
            {reserva ? EXPLICACION[reserva.estado] : 'No tienes una reserva en este viaje.'}
            {reserva && (
              <small>
                Te recogen en: {reserva.recogida.texto || 'el punto que elegiste'}
                {reserva.punto_abordaje && ' · camina hasta el punto verde del mapa, el conductor no hace desvíos'}
              </small>
            )}
          </div>

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
                <PrimaryButton variante="secundario" onClick={() => setConfirmarCancelar(true)}>
                  Cancelar reserva
                </PrimaryButton>
              )}
            </div>
          )}
        </>
      )}

      <BottomNav activePage={PAGES.HISTORY} navigate={navigate} />
    </PhoneFrame>
  )
}
