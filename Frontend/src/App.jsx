import { ScreenTransition } from './components/layout/ScreenTransition'
import { PhoneFrame } from './components/layout/PhoneFrame'
import { SideNav } from './components/layout/SideNav'
import { Loading } from './components/ui/Feedback'
import { PAGES } from './constants/pages'
import { useAuth } from './context/AuthContext'
import { useAppNavigation } from './hooks/useAppNavigation'
import { DriverDetailPage } from './pages/DriverDetailPage'
import { HistoryPage } from './pages/HistoryPage'
import { HomePage } from './pages/HomePage'
import { ImpactPage } from './pages/ImpactPage'
import { LoginPage } from './pages/LoginPage'
import { PublishPage } from './pages/PublishPage'
import { TripDetailPage } from './pages/TripDetailPage'
import './styles/index.css'

const SCREENS = {
  [PAGES.HOME]: HomePage,
  [PAGES.PUBLISH]: PublishPage,
  [PAGES.HISTORY]: HistoryPage,
  [PAGES.TRIP_DETAIL]: TripDetailPage,
  [PAGES.DRIVER_DETAIL]: DriverDetailPage,
  [PAGES.IMPACT]: ImpactPage,
}

function App() {
  const { estado } = useAuth()

  return (
    <div className="prototype">
      {estado === 'cargando' && (
        <PhoneFrame className="app-screen">
          <Loading texto="Abriendo Yendo…" />
        </PhoneFrame>
      )}
      {estado === 'anonimo' && <LoginPage />}
      {estado === 'autenticado' && <Pantallas />}
    </div>
  )
}

// Se monta solo con sesión: al cerrar sesión se reinicia la navegación.
function Pantallas() {
  const { page, params, navigate } = useAppNavigation()
  const Screen = SCREENS[page]
  // La clave incluye los parámetros: abrir otro viaje reinicia el estado de la pantalla.
  const clave = `${page}-${params.viajeId ?? ''}`

  // En escritorio, la barra lateral queda fija fuera de la transición (no parpadea al navegar).
  return (
    <div className="app-shell">
      <SideNav page={page} navigate={navigate} />
      <ScreenTransition screenKey={clave}>
        <Screen navigate={navigate} params={params} />
      </ScreenTransition>
    </div>
  )
}

export default App
