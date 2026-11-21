import { useState } from 'react'
import { Droplet, ExternalLink, Leaf, Lightbulb, Target, Trees, Trophy } from 'lucide-react'
import { BottomNav } from '../components/layout/BottomNav'
import { DetailHeader } from '../components/layout/DetailHeader'
import { PhoneFrame } from '../components/layout/PhoneFrame'
import { StatusChip } from '../components/ui/StatusChip'
import { PAGES } from '../constants/pages'
import { useAsync } from '../hooks/useAsync'
import { api } from '../lib/api'

/*
 * "Tu impacto": huella de carbono (se abre desde el perfil y desde el detalle de un viaje cerrado).
 * MOCKUP: los números salen de MOCK (datos de ejemplo); todavía no hay endpoint para la huella.
 * La metodología (RF-24: fórmula, factor, fuente y supuestos) sí viene de GET /impacto.
 * Mismo factor que el backend: 0.249 kg CO₂/km (EPA, 400 g/milla).
 */
const FACTOR = 0.249
const KG_CO2_POR_LITRO = 2.31 // gasolina
const KG_POR_ARBOL_MES = 1.75 // ~21 kg CO₂ al año por árbol

const MOCK = {
  semana: {
    etiqueta: 'esta semana',
    km: 46,
    barras: [
      ['L', 1.2, 1.9],
      ['M', 0.6, 2.4],
      ['M', 1.4, 0.8],
      ['J', 0.5, 2.5],
      ['V', 0.9, 1.6],
      ['S', 0, 0],
      ['D', 0.4, 0],
    ],
  },
  mes: {
    etiqueta: 'este mes',
    km: 182,
    barras: [
      ['Sem 1', 5.1, 6.3],
      ['Sem 2', 3.8, 8.1],
      ['Sem 3', 4.4, 7.6],
      ['Sem 4', 3.2, 9.4],
    ],
  },
  semestre: {
    etiqueta: 'este semestre',
    km: 845,
    barras: [
      ['Ago', 21.4, 14.2],
      ['Sep', 18.9, 22.7],
      ['Oct', 15.1, 29.8],
      ['Nov', 16.5, 31.4],
    ],
  },
}

const REPARTO = [
  { etiqueta: 'Como pasajero', pct: 48, color: 'bg-teal' },
  { etiqueta: 'Conduciendo con pasajeros', pct: 31, color: 'bg-teal/45' },
  { etiqueta: 'Solo, sin compartir', pct: 21, color: 'bg-coral' },
]

const RANKING = [
  { nombre: 'Ingeniería', kg: 412, tuya: true },
  { nombre: 'Turismo', kg: 356 },
  { nombre: 'Negocios', kg: 298 },
  { nombre: 'Ciencias Sociales', kg: 211 },
]

const CONSEJOS = [
  'Tus viajes de los jueves a las 14:00 casi siempre van solos: publícalos y comparte 3 asientos.',
  'Ana y Luis salen de tu zona a la misma hora que tú. Reservar con ellos bajaría tu huella un 30%.',
  'Llevas 2 semanas seguidas bajando tu huella. Sigue así para llegar a tu meta del semestre.',
]

const META_KG = 120

const kg = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 })
const suma = (barras, i) => barras.reduce((t, b) => t + b[i], 0)

/** Tu impacto: huella de carbono (mockup), cuánto evitas al compartir y cómo se calcula (RF-23, RF-24). */
export function ImpactPage({ navigate }) {
  const [periodo, setPeriodo] = useState('mes')
  const { data } = useAsync(() => api.get('/impacto'))
  const metodo = data?.metodologia
  const p = MOCK[periodo]
  const emitido = suma(p.barras, 1)
  const evitado = suma(p.barras, 2)
  const sinCompartir = emitido + evitado
  const ahorroPct = sinCompartir ? Math.round((evitado / sinCompartir) * 100) : 0
  const evitadoSemestre = suma(MOCK.semestre.barras, 2)
  const metaPct = Math.min(100, Math.round((evitadoSemestre / META_KG) * 100))

  return (
    <PhoneFrame className="app-screen footprint-screen">
      <DetailHeader
        title="Tu impacto"
        subtitle="Lo que emites al moverte y lo que evitas al compartir"
        status="Vista previa"
        statusTono="gris"
        onBack={() => navigate(PAGES.HOME)}
      />

      <div className="mt-5 grid grid-cols-3 gap-1 rounded-xl bg-surface p-1 text-sm font-medium lg:max-w-md">
        {[
          ['semana', 'Semana'],
          ['mes', 'Mes'],
          ['semestre', 'Semestre'],
        ].map(([id, texto]) => (
          <button
            key={id}
            type="button"
            aria-pressed={periodo === id}
            className={`h-10 rounded-lg ${periodo === id ? 'bg-white shadow-sm' : 'text-muted'}`}
            onClick={() => setPeriodo(id)}
          >
            {texto}
          </button>
        ))}
      </div>

      <div className="footprint-grid mt-5 grid gap-4">
        {/* Resumen */}
        <section className="rounded-[20px] bg-teal p-5 text-white">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Leaf size={18} /> Tu huella {p.etiqueta}
          </p>
          <p className="mt-1 font-display text-4xl">
            {kg.format(emitido)} <span className="text-lg">kg CO₂</span>
          </p>
          <p className="mt-1 text-sm text-white/80">
            Yendo solo habrías emitido {kg.format(sinCompartir)} kg. Al compartir evitaste{' '}
            <b className="text-white">{kg.format(evitado)} kg ({ahorroPct}%)</b>.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Dato valor={`${p.km} km`} etiqueta="recorridos" />
            <Dato valor={kg.format(p.km * FACTOR)} etiqueta="kg si fueras solo en auto" />
            <Dato valor={`${ahorroPct}%`} etiqueta="menos emisiones" />
          </div>
        </section>

        {/* Tendencia */}
        <section className="rounded-[20px] border border-line p-4">
          <h2 className="text-base font-semibold">Emitido vs. evitado</h2>
          <Leyenda />
          <Barras barras={p.barras} />
        </section>

        {/* Equivalencias */}
        <section className="rounded-[20px] border border-line p-4">
          <h2 className="text-base font-semibold">Lo que evitaste equivale a…</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Equivalencia
              icono={<Trees size={20} />}
              valor={Math.round(evitado / KG_POR_ARBOL_MES)}
              etiqueta="árboles absorbiendo CO₂ un mes"
            />
            <Equivalencia
              icono={<Droplet size={20} />}
              valor={kg.format(evitado / KG_CO2_POR_LITRO)}
              etiqueta="litros de gasolina sin quemar"
            />
          </div>
          <p className="mt-3 text-xs text-muted">Equivalencias aproximadas, solo como referencia.</p>
        </section>

        {/* Cómo te mueves */}
        <section className="rounded-[20px] border border-line p-4">
          <h2 className="text-base font-semibold">Cómo te mueves</h2>
          <div className="mt-3 flex h-3 overflow-hidden rounded-full" aria-hidden="true">
            {REPARTO.map((r) => (
              <span key={r.etiqueta} className={r.color} style={{ width: `${r.pct}%` }} />
            ))}
          </div>
          <ul className="mt-3 grid gap-2 text-sm">
            {REPARTO.map((r) => (
              <li key={r.etiqueta} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <i className={`size-2.5 rounded-full ${r.color}`} /> {r.etiqueta}
                </span>
                <b>{r.pct}%</b>
              </li>
            ))}
          </ul>
        </section>

        {/* Meta */}
        <section className="rounded-[20px] border border-line p-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Target size={18} className="text-teal" /> Meta del semestre
          </h2>
          <p className="mt-1 text-sm text-muted">
            Evitar {META_KG} kg de CO₂. Llevas <b className="text-ink">{kg.format(evitadoSemestre)} kg</b>.
          </p>
          <div
            className="mt-3 h-3 overflow-hidden rounded-full bg-surface"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={metaPct}
            aria-label="Avance de la meta"
          >
            <span className="block h-full rounded-full bg-teal" style={{ width: `${metaPct}%` }} />
          </div>
          <p className="mt-2 text-right text-xs font-medium text-teal">{metaPct}%</p>
        </section>

        {/* Ranking */}
        <section className="rounded-[20px] border border-line p-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Trophy size={18} className="text-teal" /> Tu institución
          </h2>
          <p className="mt-1 text-sm text-muted">
            Estás en el lugar <b className="text-ink">12 de 348</b> en CO₂ evitado este semestre.
          </p>
          <ol className="mt-3 grid gap-1 text-sm">
            {RANKING.map((f, i) => (
              <li
                key={f.nombre}
                className={`flex items-center justify-between rounded-xl px-3 py-2 ${f.tuya ? 'bg-teal-soft font-semibold' : ''}`}
              >
                <span>
                  {i + 1}. {f.nombre} {f.tuya && <small className="font-normal text-muted">(tu facultad)</small>}
                </span>
                <span>{f.kg} kg</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Consejos */}
        <section className="footprint-wide rounded-[20px] bg-surface p-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Lightbulb size={18} className="text-coral" /> Para bajar tu huella
          </h2>
          <ul className="mt-2 grid gap-2 text-sm text-muted lg:grid-cols-3">
            {CONSEJOS.map((c) => (
              <li key={c} className="rounded-xl bg-white p-3">
                {c}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {metodo && (
        <section className="mt-6 grid grid-cols-1 gap-3 rounded-[20px] border border-line p-4 text-sm">
          <h2 className="flex items-center justify-between text-base font-semibold">
            ¿Cómo se calcula? <StatusChip tono="gris">Estimación</StatusChip>
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

function Dato({ valor, etiqueta }) {
  return (
    <div className="rounded-xl bg-white/12 px-2 py-2">
      <b className="block text-base">{valor}</b>
      <small className="text-[11px] leading-tight text-white/80">{etiqueta}</small>
    </div>
  )
}

function Leyenda() {
  return (
    <p className="mt-1 flex gap-4 text-xs text-muted">
      <span className="flex items-center gap-1.5">
        <i className="size-2.5 rounded-full bg-coral" /> Emitido
      </span>
      <span className="flex items-center gap-1.5">
        <i className="size-2.5 rounded-full bg-teal" /> Evitado
      </span>
    </p>
  )
}

/** Barras apiladas (emitido abajo, evitado arriba), en kg de CO₂. */
function Barras({ barras }) {
  const max = Math.max(...barras.map(([, e, v]) => e + v), 1)
  const resumen = barras.map(([d, e, v]) => `${d}: ${kg.format(e)} kg emitidos, ${kg.format(v)} kg evitados`).join('; ')
  return (
    <div className="mt-4 flex h-40 items-end gap-2" role="img" aria-label={resumen}>
      {barras.map(([dia, e, v], i) => (
        <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
          <div className="flex w-full max-w-10 flex-1 flex-col justify-end overflow-hidden rounded-lg">
            <span className="block bg-teal" style={{ height: `${(v / max) * 100}%` }} />
            <span className="block bg-coral" style={{ height: `${(e / max) * 100}%` }} />
          </div>
          <small className="text-[11px] text-muted">{dia}</small>
        </div>
      ))}
    </div>
  )
}

function Equivalencia({ icono, valor, etiqueta }) {
  return (
    <div className="rounded-2xl bg-teal-soft p-3">
      <span className="text-teal">{icono}</span>
      <b className="mt-1 block text-xl">{valor}</b>
      <small className="text-[11px] leading-tight text-muted">{etiqueta}</small>
    </div>
  )
}
