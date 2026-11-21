import { Bell, User } from 'lucide-react'
import { saludo } from '../../lib/format'
import { IconButton } from '../ui/IconButton'

export function HomeHeader({ nombre, noLeidas = 0, onOpenNotifications, onOpenProfile }) {
  return (
    <header className="home-header">
      <div>
        <h1>{saludo()}</h1>
        <p>{nombre ? `${nombre.split(' ')[0]}, encuentra tu próximo viaje.` : 'Encuentra tu próximo viaje.'}</p>
      </div>
      <div>
        <span className="relative">
          <IconButton label="Notificaciones" onClick={onOpenNotifications}>
            <Bell size={22} />
          </IconButton>
          {noLeidas > 0 && (
            <b className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-coral text-[11px]">
              {noLeidas > 9 ? '9+' : noLeidas}
            </b>
          )}
        </span>
        <IconButton label="Mi perfil" onClick={onOpenProfile}>
          <User size={22} />
        </IconButton>
      </div>
    </header>
  )
}
