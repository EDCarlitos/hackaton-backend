import { CalendarClock } from 'lucide-react'
import { aInputFechaHora } from '../../lib/format'

/** Chips de hora rápida + "Otra hora" (abre el selector nativo). valor: { id, otra }. */
export function TimeChips({ opciones, valor, onChange, etiqueta = 'Hora' }) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-2">
      <div className="chip-row" role="group" aria-label={etiqueta}>
        {opciones.map((o) => (
          <button
            key={o.id}
            type="button"
            className="chip"
            aria-pressed={valor.id === o.id}
            onClick={() => onChange({ ...valor, id: o.id })}
          >
            {o.texto}
          </button>
        ))}
        <button
          type="button"
          className="chip"
          aria-pressed={valor.id === 'otra'}
          onClick={() => onChange({ id: 'otra', otra: valor.otra || aInputFechaHora(opciones[0].calcular()) })}
        >
          <CalendarClock size={15} /> Otra hora
        </button>
      </div>
      {valor.id === 'otra' && (
        <input
          type="datetime-local"
          aria-label={`${etiqueta}: fecha y hora`}
          className="block h-11 w-full min-w-0 rounded-xl border border-line bg-white px-3 text-sm outline-none focus:border-ink"
          value={valor.otra}
          min={aInputFechaHora(new Date())}
          onChange={(e) => onChange({ id: 'otra', otra: e.target.value })}
        />
      )}
    </div>
  )
}
