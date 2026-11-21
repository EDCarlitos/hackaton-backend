import { useState } from 'react'
import { Footprints, MapPin } from 'lucide-react'
import { TripChat } from '../components/chat/TripChat'
import { BottomNav } from '../components/layout/BottomNav'
import { DetailHeader } from '../components/layout/DetailHeader'
import { PhoneFrame } from '../components/layout/PhoneFrame'
import { MapLegend, RouteMap } from '../components/map/RouteMap'
import { Route } from '../components/trip/Route'
import { SeatCount } from '../components/trip/SeatCount'
import { Empty, ErrorBanner, Loading } from '../components/ui/Feedback'
import { PrimaryButton } from '../components/ui/PrimaryButton'
import { PAGES } from '../constants/pages'
import { useAsync } from '../hooks/useAsync'
import { useChat } from '../hooks/useChat'
import { api } from '../lib/api'
import { ESTADO_RESERVA, esEstadoActivo, formatCosto, formatDiaHora, formatMetros, formatRangoHora } from '../lib/format'

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
    <PhoneFrame className="app-screen detail-screen">
      <DetailHeader
        title="Tu reserva"
        subtitle={viaje ? formatDiaHora(viaje.salida_en) : 'Detalle del viaje'}
        status={reserva && ESTADO_RESERVA[reserva.estado]}
        statusActivo={reserva && esEstadoActivo(reserva.estado)}
        onBack={() => navigate(PAGES.HISTORY)}
      />
      {cargando && <Loading />}
      <ErrorBanner error={error} className="mt-4" />

      {viaje && (
        <>
          <RouteMap
            className="mt-6"
            alto={230}
            polilinea={viaje.ruta.polilinea}
            marcadores={[
              { ...viaje.origen, tipo: 'origen' },
              { ...viaje.destino, tipo: 'destino' },
              ...(reserva ? [{ ...reserva.recogida, tipo: 'recogida', etiqueta: 'Tú' }] : []),
              ...(reserva?.punto_abordaje ? [{ ...reserva.punto_abordaje, tipo: 'abordaje', etiqueta: 'Abordaje' }] : []),
            ]}
          />
          <MapLegend tipos={['origen', 'destino', 'recogida', 'abordaje']} />

          <section className="trip-info">
            <div>
              <b>{viaje.conductor.nombre_visible}</b>
              <span>{formatRangoHora(viaje.salida_en, viaje.ruta.duracion_min)}</span>
            </div>
            <small className="text-muted">{viaje.vehiculo.placa_o_descripcion}</small>
            <Route origen={viaje.origen} destino={viaje.destino} />
            <footer>
              <SeatCount taken={viaje.asientos_ofrecidos - viaje.asientos_disponibles} total={viaje.asientos_ofrecidos} />
              <small>{formatCosto(viaje.costo_referencia)}</small>
            </footer>
          </section>

          {reserva ? (
            <section className="trip-info">
              <b>Punto de recogida acordado</b>
              <p className="flex items-start gap-2 text-sm">
                <MapPin size={16} className="mt-0.5 shrink-0" /> {reserva.recogida.texto || 'Punto elegido en el mapa'}
              </p>
              {reserva.punto_abordaje && (
                <p className="flex items-start gap-2 text-sm text-muted">
                  <Footprints size={16} className="mt-0.5 shrink-0" />
                  Camina {formatMetros(reserva.distancia_pie_m ?? 0)} hasta la ruta (punto verde del mapa). El conductor no
                  hace desvíos.
                </p>
              )}
              <p className="rounded-xl bg-surface p-3 text-sm">{EXPLICACION[reserva.estado]}</p>
            </section>
          ) : (
            <div className="mt-4">
              <Empty>No tienes una reserva en este viaje.</Empty>
            </div>
          )}

          <TripChat chat={chat} />

          <ErrorBanner error={accionError} className="mt-4" />
          {cancelable &&
            (confirmarCancelar ? (
              <div className="mt-6 grid gap-2">
                <p className="text-center text-sm">
                  {reserva.estado === 'confirmada'
                    ? 'Tu asiento quedará libre para otra persona.'
                    : 'Se retirará tu solicitud.'}
                </p>
                <PrimaryButton variante="peligro" onClick={cancelar} disabled={enviando}>
                  {enviando ? 'Cancelando…' : 'Sí, cancelar mi reserva'}
                </PrimaryButton>
                <PrimaryButton variante="secundario" onClick={() => setConfirmarCancelar(false)}>
                  No, mantenerla
                </PrimaryButton>
              </div>
            ) : (
              <PrimaryButton variante="peligro" className="mt-6" onClick={() => setConfirmarCancelar(true)}>
                Cancelar reserva
              </PrimaryButton>
            ))}
        </>
      )}

      <BottomNav activePage={PAGES.HISTORY} navigate={navigate} />
    </PhoneFrame>
  )
}
