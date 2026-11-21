import { CarFront, House, Leaf, Plus } from 'lucide-react'
import { PAGES } from '../../constants/pages'

export function BottomNav({ activePage, navigate }) {
  return (
    <nav className="bottom-nav">
      <NavButton active={activePage === PAGES.HOME} onClick={() => navigate(PAGES.HOME)}>
        <House size={24} />
        <span>Inicio</span>
      </NavButton>
      <NavButton active={activePage === PAGES.HISTORY} onClick={() => navigate(PAGES.HISTORY)}>
        <CarFront size={24} />
        <span>Mis viajes</span>
      </NavButton>
      <button type="button" className="publish" onClick={() => navigate(PAGES.PUBLISH)}>
        <i>
          <Plus size={24} />
        </i>
        <span>Publicar</span>
      </button>
      <NavButton active={activePage === PAGES.IMPACT} onClick={() => navigate(PAGES.IMPACT)}>
        <Leaf size={24} />
        <span>Impacto</span>
      </NavButton>
    </nav>
  )
}

function NavButton({ active, children, onClick }) {
  return (
    <button type="button" className={active ? 'active' : ''} onClick={onClick}>
      {children}
    </button>
  )
}
