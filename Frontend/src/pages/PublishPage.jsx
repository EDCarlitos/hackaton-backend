import { useState } from 'react'
import { CalendarClock, Trash2, Zap } from 'lucide-react'
import { PointPicker } from '../components/forms/PointPicker'
import { TimeChips } from '../components/forms/TimeChips'
import { BottomNav } from '../components/layout/BottomNav'
import { DetailHeader } from '../components/layout/DetailHeader'
import { PhoneFrame } from '../components/layout/PhoneFrame'
import { RouteMap } from '../components/map/RouteMap'
import { VehicleForm } from '../components/modals/ProfileModal'
import { Route } from '../components/trip/Route'
import { Empty, ErrorBanner, inputClass, Loading } from '../components/ui/Feedback'
import { PrimaryButton } from '../components/ui/PrimaryButton'
import { PAGES } from '../constants/pages'
import { useAsync } from '../hooks/useAsync'
import { api } from '../lib/api'
import { aHoraHHMM, formatDiaHora } from '../lib/format'
import { HORAS_SALIDA, resolverHora } from '../lib/horas'

const PESTANAS = { NUEVO: 'nuevo', SALGO_HOY: 'salgo-hoy' }

/** Publicar un viaje (RF-05, RF-06, RF-07) o salir hoy con una plantilla (RF-09). */
export function PublishPage({ navigate }) {
  const vehiculos = useAsync(() => api.get('/vehiculos'))
  const trayectos = useAsync(() => api.get('/trayectos'))
  const [elegida, setPestana] = useState(null)
  // Si ya tienes trayectos guardados, abre en "Salgo hoy": publicar en un toque (objetivo 1).
  const pestana = elegida ?? (trayectos.data?.trayectos.length ? PESTANAS.SALGO_HOY : PESTANAS.NUEVO)

  const activos = vehiculos.data?.vehiculos.filter((v) => v.activo) || []
  const abrirViaje = (viaje) => navigate(PAGES.DRIVER_DETAIL, { viajeId: viaje.id })

  return (
    <PhoneFrame className="app-screen narrow-layout">
      <DetailHeader title="Publicar viaje" subtitle="Comparte el trayecto que ya haces." onBack={() => navigate(PAGES.HOME)} />

      {vehiculos.cargando && <Loading />}
      <ErrorBanner error={vehiculos.error} className="mt-4" />

      {vehiculos.data && !activos.length && (
        <section className="mt-6 grid grid-cols-1 gap-3">
          <h2 className="text-lg font-semibold">Primero, registra tu vehículo</h2>
          <p className="text-sm text-muted">Placa o descripción y cuántos asientos ofreces. No se verifican en el MVP.</p>
          <VehicleForm onCreado={vehiculos.reload} />
        </section>
      )}

      {activos.length > 0 && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-surface p-1 text-sm font-medium">
            {[
              [PESTANAS.NUEVO, 'Nuevo viaje'],
              [PESTANAS.SALGO_HOY, `Salgo hoy${trayectos.data ? ` (${trayectos.data.trayectos.length})` : ''}`],
            ].map(([id, texto]) => (
              <button
                key={id}
                type="button"
                className={`h-10 rounded-lg ${pestana === id ? 'bg-white shadow-sm' : 'text-muted'}`}
                onClick={() => setPestana(id)}
              >
                {texto}
              </button>
            ))}
          </div>
          {pestana === PESTANAS.NUEVO ? (
            <NuevoViaje vehiculos={activos} onPublicado={abrirViaje} onPlantilla={trayectos.reload} />
          ) : (
            <SalgoHoy trayectos={trayectos} onPublicado={abrirViaje} />
          )}
        </>
      )}

      <BottomNav activePage={PAGES.PUBLISH} navigate={navigate} />
    </PhoneFrame>
  )
}

// ---------- Nuevo viaje ----------

function NuevoViaje({ vehiculos, onPublicado, onPlantilla }) {
  const [origen, setOrigen] = useState(null)
  const [destino, setDestino] = useState(null)
  const [hora, setHora] = useState({ id: 'en30', otra: '' })
  const [vehiculoId, setVehiculoId] = useState(vehiculos[0].id)
  const vehiculo = vehiculos.find((v) => v.id === Number(vehiculoId)) || vehiculos[0]
  const [asientos, setAsientos] = useState(Math.min(3, vehiculo.asientos))
  const [costo, setCosto] = useState('')
  const [guardarPlantilla, setGuardarPlantilla] = useState(false)
  const [nombrePlantilla, setNombrePlantilla] = useState('')
  const [salida, setSalida] = useState(null) // se fija al revisar: "en 15 min" no se mueve mientras confirmas
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  const listo = origen && destino && (hora.id !== 'otra' || hora.otra)
  const plazas = Math.min(Number(asientos), vehiculo.asientos)

  const publicar = async () => {
    setEnviando(true)
    setError(null)
    try {
      const { viaje } = await api.post('/viajes', {
        vehiculo_id: vehiculo.id,
        origen,
        destino,
        salida_en: salida.toISOString(),
        asientos_ofrecidos: plazas,
        costo_referencia: costo === '' ? undefined : Number(costo),
      })
      if (guardarPlantilla) {
        // La plantilla copia la ruta ya calculada: no se vuelve a consultar Google.
        await api
          .post('/trayectos', {
            nombre: nombrePlantilla.trim() || `${origen.texto} → ${destino.texto}`.slice(0, 80),
            hora_habitual: aHoraHHMM(salida),
            desde_viaje_id: viaje.id,
          })
          .then(onPlantilla)
          .catch(() => {}) // el viaje ya quedó publicado; la plantilla es opcional
      }
      onPublicado(viaje)
    } catch (err) {
      setError(err)
      setSalida(null)
    } finally {
      setEnviando(false)
    }
  }

  if (salida) {
    // Resumen obligatorio antes de publicar (caso límite 7.4: hora equivocada).
    return (
      <section className="mt-6 grid grid-cols-1 gap-4">
        <h2 className="text-lg font-semibold">¿Todo bien?</h2>
        <div className="grid grid-cols-1 gap-3 rounded-[20px] border border-line p-4 text-sm">
          <p className="flex items-center gap-2 text-base font-semibold">
            <CalendarClock size={18} className="text-coral" /> {formatDiaHora(salida)}
          </p>
          <Route origen={origen} destino={destino} />
          <p>
            {plazas} lugar{plazas === 1 ? '' : 'es'} · {vehiculo.placa_o_descripcion}
          </p>
          <p className="text-muted">{costo === '' ? 'Sin costo de referencia' : `$${costo} de referencia (no vinculante)`}</p>
        </div>
        <ErrorBanner error={error} />
        <PrimaryButton onClick={publicar} disabled={enviando}>
          {enviando ? 'Calculando la ruta…' : 'Publicar viaje'}
        </PrimaryButton>
        <PrimaryButton variante="secundario" onClick={() => setSalida(null)} disabled={enviando}>
          Corregir
        </PrimaryButton>
      </section>
    )
  }

  return (
    <form
      className="mt-6 grid grid-cols-1 gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (listo) setSalida(resolverHora(HORAS_SALIDA, hora))
      }}
    >
      <fieldset className="grid grid-cols-1 gap-4">
        <legend className="form-step">
          <span>1</span> Ruta
        </legend>
        <PointPicker label="Sales de" value={origen} onChange={setOrigen} placeholder="Colonia, calle o lugar" privado />
        <PointPicker label="Vas a" value={destino} onChange={setDestino} placeholder="Ej. Universidad del Caribe" privado />
        <p className="-mt-1 text-xs text-muted">Por privacidad guardamos tu origen aproximado (≈100 m), nunca tu casa.</p>
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-3">
        <legend className="form-step">
          <span>2</span> Salida
        </legend>
        <TimeChips opciones={HORAS_SALIDA} valor={hora} onChange={setHora} etiqueta="Salida" />
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-3">
        <legend className="form-step">
          <span>3</span> Lugares y costo
        </legend>
        {vehiculos.length > 1 && (
          <label className="text-sm font-medium">
            Vehículo
            <select className={inputClass} value={vehiculoId} onChange={(e) => setVehiculoId(e.target.value)}>
              {vehiculos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.placa_o_descripcion} ({v.asientos})
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex items-end justify-between gap-4">
          <div>
            <span className="mb-2 block text-sm font-medium">Lugares libres</span>
            <div className="chip-row" role="group" aria-label="Lugares libres">
              {Array.from({ length: vehiculo.asientos }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  className="chip chip--square"
                  aria-pressed={plazas === n}
                  onClick={() => setAsientos(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <label className="w-28 text-sm font-medium">
            Costo
            <span className="mt-2 flex h-11 items-center gap-1 rounded-xl border border-line px-3 focus-within:border-ink">
              <span className="text-muted">$</span>
              <input
                inputMode="decimal"
                placeholder="0"
                aria-label="Costo de referencia en pesos"
                className="w-full min-w-0 border-0 bg-transparent text-sm font-normal outline-none"
                value={costo}
                onChange={(e) => setCosto(e.target.value.replace(/[^\d.]/g, ''))}
              />
            </span>
          </label>
        </div>
        <p className="text-xs text-muted">El costo es opcional y solo de referencia: la app no cobra ni procesa pagos.</p>
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4 accent-coral" checked={guardarPlantilla} onChange={(e) => setGuardarPlantilla(e.target.checked)} />
        Guardar como “Mi trayecto” para la próxima vez salir con un toque
      </label>
      {guardarPlantilla && (
        <input
          className="-mt-3 block h-11 w-full min-w-0 rounded-xl border border-line bg-white px-3 text-sm outline-none focus:border-ink"
          placeholder={origen && destino ? `${origen.texto} → ${destino.texto}` : 'Nombre, ej. Casa → UCaribe'}
          maxLength={80}
          value={nombrePlantilla}
          onChange={(e) => setNombrePlantilla(e.target.value)}
        />
      )}
      <ErrorBanner error={error} />
      <PrimaryButton type="submit" disabled={!listo}>
        {listo ? 'Revisar y publicar' : 'Elige de dónde sales y a dónde vas'}
      </PrimaryButton>
    </form>
  )
}

// ---------- "Salgo hoy" ----------

function SalgoHoy({ trayectos, onPublicado }) {
  const [elegido, setElegido] = useState(null)
  const [error, setError] = useState(null)

  const borrar = async (id) => {
    setError(null)
    try {
      await api.delete(`/trayectos/${id}`)
      trayectos.reload()
    } catch (err) {
      setError(err)
    }
  }

  if (elegido) return <ResumenSalgoHoy trayecto={elegido} onVolver={() => setElegido(null)} onPublicado={onPublicado} />

  return (
    <section className="mt-6 grid grid-cols-1 gap-3">
      {trayectos.cargando && <Loading />}
      <ErrorBanner error={trayectos.error || error} />
      {trayectos.data && !trayectos.data.trayectos.length && (
        <Empty>Aún no tienes trayectos guardados. Al publicar un viaje, marca “Guardar como Mi trayecto”.</Empty>
      )}
      {trayectos.data?.trayectos.map((t) => (
        <article key={t.id} className="flex items-center gap-3 rounded-[18px] border border-line p-4">
          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setElegido(t)}>
            <b className="block text-sm">{t.nombre}</b>
            <small className="text-muted">
              {t.hora_habitual ? `Sueles salir a las ${t.hora_habitual}` : 'Sin hora habitual'} · {t.asientos} asientos
            </small>
          </button>
          <button
            type="button"
            className="flex h-9 items-center gap-1 rounded-full bg-coral px-3 text-xs font-semibold text-white"
            onClick={() => setElegido(t)}
          >
            <Zap size={14} /> Salgo hoy
          </button>
          <button type="button" aria-label="Borrar trayecto" onClick={() => borrar(t.id)}>
            <Trash2 size={16} className="text-muted" />
          </button>
        </article>
      ))}
    </section>
  )
}

function horaInicial(trayecto) {
  const ahora = aHoraHHMM(new Date(Date.now() + 10 * 60_000))
  return trayecto.hora_habitual && trayecto.hora_habitual > aHoraHHMM(new Date()) ? trayecto.hora_habitual : ahora
}

// Resumen para confirmar (fecha, hora, ruta, asientos) antes de publicar (RF-09).
function ResumenSalgoHoy({ trayecto, onVolver, onPublicado }) {
  const [hora, setHora] = useState(() => horaInicial(trayecto))
  const [asientos, setAsientos] = useState(trayecto.asientos)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const borrador = useAsync(
    () => api.get(`/trayectos/${trayecto.id}/salgo-hoy`, { hora, asientos_ofrecidos: asientos }),
    `${trayecto.id}-${hora}-${asientos}`,
  )

  const publicar = async () => {
    setEnviando(true)
    setError(null)
    try {
      const { viaje } = await api.post(`/trayectos/${trayecto.id}/salgo-hoy`, { hora, asientos_ofrecidos: Number(asientos) })
      onPublicado(viaje)
    } catch (err) {
      setError(err)
      setEnviando(false)
    }
  }

  const b = borrador.data?.borrador
  return (
    <section className="mt-6 grid grid-cols-1 gap-4">
      <h2 className="text-lg font-semibold">{trayecto.nombre}</h2>
      <RouteMap
        polilinea={trayecto.ruta.polilinea}
        marcadores={[
          { ...trayecto.origen, tipo: 'origen' },
          { ...trayecto.destino, tipo: 'destino' },
        ]}
        alto={180}
      />
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm font-medium">
          Hora de salida (hoy)
          <input type="time" className={inputClass} value={hora} onChange={(e) => setHora(e.target.value)} required />
        </label>
        <label className="text-sm font-medium">
          Asientos
          <select className={inputClass} value={asientos} onChange={(e) => setAsientos(Number(e.target.value))}>
            {Array.from({ length: 4 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ErrorBanner error={borrador.error || error} />
      {b && !borrador.error && (
        <div className="grid grid-cols-1 gap-2 rounded-[20px] border border-line p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold">
            <CalendarClock size={18} /> {formatDiaHora(b.salida_en)}
          </p>
          <Route origen={b.origen} destino={b.destino} />
          <p>
            {b.asientos_ofrecidos} asiento{b.asientos_ofrecidos === 1 ? '' : 's'} · {b.vehiculo.placa_o_descripcion}
          </p>
          <p className="text-xs text-muted">
            {b.ruta.distancia_km} km · {b.ruta.duracion_min} min · se usa la ruta guardada (sin consultar Google)
          </p>
        </div>
      )}
      <PrimaryButton onClick={publicar} disabled={enviando || !b || Boolean(borrador.error)}>
        {enviando ? 'Publicando…' : 'Confirmar y publicar'}
      </PrimaryButton>
      <PrimaryButton variante="secundario" onClick={onVolver}>
        Volver
      </PrimaryButton>
    </section>
  )
}
