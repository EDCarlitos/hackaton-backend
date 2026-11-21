import { CarFront, House, Plus } from 'lucide-react'
import { PAGES } from '../../constants/pages'

// Qué opción se marca como activa en cada pantalla (los detalles cuelgan de "Mis viajes").
const SECCION = {
  [PAGES.HOME]: PAGES.HOME,
  [PAGES.PUBLISH]: PAGES.PUBLISH,
  [PAGES.HISTORY]: PAGES.HISTORY,
  [PAGES.TRIP_DETAIL]: PAGES.HISTORY,
  [PAGES.DRIVER_DETAIL]: PAGES.HISTORY,
}

/**
 * Navegación de escritorio (≥ 1024 px): barra lateral fija con las mismas opciones que la
 * navegación inferior del celular. Se monta una vez, fuera de la transición entre pantallas.
 */
export function SideNav({ page, navigate }) {
  const activa = SECCION[page]
  return (
    <nav className="side-nav" aria-label="Navegación principal">
      <img className="side-nav__brand" src="/logo.png" alt="Yendo" width="149" height="32" />
      <button
        type="button"
        className="side-nav__publish"
        aria-current={activa === PAGES.PUBLISH ? 'page' : undefined}
        onClick={() => navigate(PAGES.PUBLISH)}
      >
        <Plus size={18} /> Publicar viaje
      </button>
      <Opcion activa={activa === PAGES.HOME} onClick={() => navigate(PAGES.HOME)}>
        <House size={20} /> Inicio
      </Opcion>
      <Opcion activa={activa === PAGES.HISTORY} onClick={() => navigate(PAGES.HISTORY)}>
        <CarFront size={20} /> Mis viajes
      </Opcion>
    </nav>
  )
}

function Opcion({ activa, onClick, children }) {
  return (
    <button type="button" className={activa ? 'active' : ''} aria-current={activa ? 'page' : undefined} onClick={onClick}>
      {children}
    </button>
  )
}
