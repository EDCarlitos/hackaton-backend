import { CarFront, House, Plus } from 'lucide-react'
import { PAGES } from '../../constants/pages'

/** Inicio · Publicar · Mis viajes. Va al final de cada pantalla y se queda pegada abajo. */
export function BottomNav({ activePage, navigate }) {
  return (
    <>
      <div className="nav-spacer" />
      <nav className="bottom-nav">
        <NavButton active={activePage === PAGES.HOME} onClick={() => navigate(PAGES.HOME)}>
          <House size={24} />
          <span>Inicio</span>
        </NavButton>
        <button
          type="button"
          className={`publish ${activePage === PAGES.PUBLISH ? 'active' : ''}`}
          aria-current={activePage === PAGES.PUBLISH ? 'page' : undefined}
          onClick={() => navigate(PAGES.PUBLISH)}
        >
          <i>
            <Plus size={24} />
          </i>
          <span>Publicar</span>
        </button>
        <NavButton active={activePage === PAGES.HISTORY} onClick={() => navigate(PAGES.HISTORY)}>
          <CarFront size={24} />
          <span>Mis viajes</span>
        </NavButton>
      </nav>
    </>
  )
}

function NavButton({ active, children, onClick }) {
  return (
    <button type="button" className={active ? 'active' : ''} aria-current={active ? 'page' : undefined} onClick={onClick}>
      {children}
    </button>
  )
}
