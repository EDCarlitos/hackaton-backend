import { useState } from 'react'
import { LoginForm } from '../components/auth/LoginForm'
import { PhoneFrame } from '../components/layout/PhoneFrame'
import { ErrorBanner } from '../components/ui/Feedback'
import { useAuth } from '../context/AuthContext'

// Cuentas de los datos demo del backend (contraseña: secreta123). Solo se muestran en desarrollo.
const CUENTAS_DEMO = [
  { correo: 'valeria.pasajera@ucaribe.edu.mx', nombre: 'Valeria (pasajera)' },
  { correo: 'carla.conductora@ucaribe.edu.mx', nombre: 'Carla (conductora)' },
  { correo: 'ana.conductora@ucaribe.edu.mx', nombre: 'Ana (conductora)' },
  { correo: 'sofia.pasajera@ucaribe.edu.mx', nombre: 'Sofía (pasajera)' },
]

export function LoginPage() {
  const { iniciarSesion, registrarse } = useAuth()
  const [modo, setModo] = useState('login')
  const [errorDemo, setErrorDemo] = useState(null)
  const registro = modo === 'registro'

  const enviar = (datos) => (registro ? registrarse(datos) : iniciarSesion(datos.correo, datos.password))

  const entrarDemo = async (correo) => {
    setErrorDemo(null)
    try {
      await iniciarSesion(correo, 'secreta123')
    } catch (err) {
      setErrorDemo(err)
    }
  }

  return (
    <PhoneFrame className="login-screen">
      <section className="login-content">
        <img className="login-logo" src="/logo.png" alt="Yendo" width="131" height="28" />
        <h1>{registro ? 'Crea tu cuenta' : 'Bienvenido'}</h1>
        <LoginForm key={modo} modo={modo} onSubmit={enviar} />
        {import.meta.env.DEV && !registro && (
          <div className="demo-accounts">
            Cuentas demo (contraseña <b>secreta123</b>):
            <div>
              {CUENTAS_DEMO.map((c) => (
                <button key={c.correo} type="button" onClick={() => entrarDemo(c.correo)}>
                  {c.nombre}
                </button>
              ))}
            </div>
            <ErrorBanner error={errorDemo} className="mt-2" />
          </div>
        )}
      </section>
      <p className="account">
        {registro ? '¿Ya tienes cuenta? ' : '¿No tienes cuenta? '}
        <button type="button" onClick={() => setModo(registro ? 'login' : 'registro')}>
          {registro ? 'Inicia sesión' : 'Crea una cuenta'}
        </button>
      </p>
    </PhoneFrame>
  )
}
