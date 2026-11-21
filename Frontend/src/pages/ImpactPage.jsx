import { useState } from 'react'
import { CarFront, ExternalLink, Leaf, Route as RouteIcon, Users } from 'lucide-react'
import { BottomNav } from '../components/layout/BottomNav'
import { DetailHeader } from '../components/layout/DetailHeader'
import { PhoneFrame } from '../components/layout/PhoneFrame'
import { ErrorBanner, Loading } from '../components/ui/Feedback'
import { StatusChip } from '../components/ui/StatusChip'
import { PAGES } from '../constants/pages'
import { useAsync } from '../hooks/useAsync'
import { api } from '../lib/api'

const numero = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 })

/** Contador de impacto ambiental (RF-23) con su metodología visible (RF-24). */
export function ImpactPage({ navigate }) {
  const { data, error, cargando } = useAsync(() => api.get('/impacto'), '', { intervaloMs: 60_000 })
  const [alcance, setAlcance] = useState('mio')
  const m = data?.[alcance]
  const metodo = data?.metodologia

  return (
    <PhoneFrame className="app-screen">
      <DetailHeader
        title="Tu impacto"
        subtitle="Lo que ahorramos al compartir el auto"
        status={metodo?.etiqueta}
        statusActivo={false}
        onBack={() => navigate(PAGES.HOME)}
      />

      <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-surface p-1 text-sm font-medium">
        {[
          ['mio', 'Tú'],
          ['institucion', 'Tu institución'],
        ].map(([id, texto]) => (
          <button
            key={id}
            type="button"
            className={`h-10 rounded-lg ${alcance === id ? 'bg-white shadow-sm' : 'text-muted'}`}
            onClick={() => setAlcance(id)}
          >
            {texto}
          </button>
        ))}
      </div>

      {cargando && <Loading />}
      <ErrorBanner error={error} className="mt-4" />

      {m && (
        <>
          <section className="mt-5 rounded-[20px] bg-coral p-5 text-white">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Leaf size={18} /> CO₂ evitado <small className="font-normal">(estimación)</small>
            </p>
            <p className="mt-1 font-display text-4xl">
              {numero.format(m.co2_evitado_kg)} <span className="text-lg">kg</span>
            </p>
          </section>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Metrica icono={<CarFront size={18} />} valor={m.viajes_compartidos} etiqueta="viajes compartidos" />
            <Metrica icono={<Users size={18} />} valor={m.asientos_ocupados} etiqueta="asientos ocupados" />
            <Metrica icono={<RouteIcon size={18} />} valor={numero.format(m.km_compartidos)} etiqueta="km compartidos" />
          </div>
        </>
      )}

      {metodo && (
        <section className="mt-6 grid gap-3 rounded-[20px] border border-line p-4 text-sm">
          <h2 className="flex items-center justify-between text-base font-semibold">
            ¿Cómo se calcula? <StatusChip activo={false}>Estimación</StatusChip>
          </h2>
          <p className="rounded-xl bg-surface p-3 font-medium">{metodo.formula}</p>
          <div>
            <b className="block">Factor de emisión</b>
            <p className="text-muted">
              {metodo.factor_emision.valor} {metodo.factor_emision.unidad} ({metodo.factor_emision.calculo})
            </p>
            <p className="mt-1 text-muted">
              Fuente:{' '}
              <a className="inline-flex items-center gap-1 underline" href={metodo.factor_emision.fuente.url} target="_blank" rel="noreferrer">
                {metodo.factor_emision.fuente.nombre} <ExternalLink size={12} />
              </a>
            </p>
            <p className="mt-1 text-xs text-muted italic">“{metodo.factor_emision.fuente.cita}”</p>
          </div>
          <div>
            <b className="block">Qué se cuenta</b>
            <ul className="mt-1 list-disc pl-5 text-muted">
              {Object.entries(metodo.definiciones).map(([k, v]) => (
                <li key={k}>{v}</li>
              ))}
            </ul>
          </div>
          <div>
            <b className="block">Supuestos</b>
            <ul className="mt-1 list-disc pl-5 text-muted">
              {metodo.supuestos.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-muted">
            Es una estimación, no una medición. Se actualiza cuando un viaje se cierra con pasajeros confirmados.
          </p>
        </section>
      )}

      <BottomNav activePage={null} navigate={navigate} />
    </PhoneFrame>
  )
}

function Metrica({ icono, valor, etiqueta }) {
  return (
    <div className="rounded-2xl bg-surface p-3">
      <span className="text-coral">{icono}</span>
      <b className="mt-1 block text-xl">{valor}</b>
      <small className="text-[11px] leading-tight text-muted">{etiqueta}</small>
    </div>
  )
}
