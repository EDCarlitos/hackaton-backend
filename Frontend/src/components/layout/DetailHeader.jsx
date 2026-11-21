import { ArrowLeft } from 'lucide-react'
import { IconButton } from '../ui/IconButton'
import { StatusChip } from '../ui/StatusChip'

export function DetailHeader({ title = 'Detalle del viaje', subtitle, status, statusTono = 'coral', onBack }) {
  return (
    <header className="detail-header">
      <IconButton label="Volver" onClick={onBack}>
        <ArrowLeft size={20} />
      </IconButton>
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {status ? <StatusChip tono={statusTono}>{status}</StatusChip> : <span />}
    </header>
  )
}
