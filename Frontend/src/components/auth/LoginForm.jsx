import { useState } from 'react'
import { Eye, EyeOff, LockKeyhole, Mail, UserRound } from 'lucide-react'
import { ErrorBanner } from '../ui/Feedback'

/**
 * Inicio de sesión y registro con correo institucional (RF-01, RF-02).
 * modo: 'login' | 'registro'. onSubmit recibe los datos y devuelve una promesa.
 */
export function LoginForm({ modo, onSubmit }) {
  const [correo, setCorreo] = useState('')
  const [password, setPassword] = useState('')
  const [nombre, setNombre] = useState('')
  const [acepto, setAcepto] = useState(false)
  const [verPassword, setVerPassword] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [ayuda, setAyuda] = useState(false)
  const registro = modo === 'registro'

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      await onSubmit(
        registro
          ? { correo, password, nombre_visible: nombre, acepto_terminos: acepto }
          : { correo, password },
      )
    } catch (err) {
      setError(err)
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {registro && (
        <label>
          Nombre visible
          <span className="input">
            <UserRound size={20} />
            <input
              aria-label="Nombre visible"
              placeholder="Como te verán los demás"
              maxLength={100}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
            />
          </span>
        </label>
      )}
      <label>
        {registro ? 'Correo institucional' : 'Correo electrónico'}
        <span className="input">
          <Mail size={20} />
          <input
            aria-label="Correo electrónico"
            placeholder={registro ? 'tu@ucaribe.edu.mx' : 'tu@ejemplo.com'}
            type="email"
            autoComplete="email"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            required
          />
        </span>
      </label>
      <label>
        Contraseña
        <span className="input">
          <LockKeyhole size={20} />
          <input
            aria-label="Contraseña"
            placeholder={registro ? 'Mínimo 8 caracteres' : 'Introduce tu contraseña'}
            type={verPassword ? 'text' : 'password'}
            autoComplete={registro ? 'new-password' : 'current-password'}
            minLength={registro ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="button"
            aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            onClick={() => setVerPassword((v) => !v)}
          >
            {verPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </span>
      </label>
      {registro && (
        <label className="terms">
          <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} required />
          <span>
            Acepto los términos: el costo es solo una <b>referencia no vinculante</b>, la app <b>no procesa pagos</b> y
            participo <b>bajo mi propio riesgo</b>. Solo se muestra mi nombre visible a otros usuarios; no se guarda mi
            domicilio ni se rastrea mi ubicación.
          </span>
        </label>
      )}
      {!registro && (
        <button type="button" className="forgot" onClick={() => setAyuda((v) => !v)}>
          ¿Olvidaste tu contraseña?
        </button>
      )}
      {ayuda && !registro && (
        <p className="forgot-help">Pide a la administración de tu institución que restablezca tu acceso.</p>
      )}
      <ErrorBanner error={error} />
      <button className="primary" type="submit" disabled={enviando}>
        {enviando ? 'Un momento…' : registro ? 'Crear cuenta' : 'Iniciar sesión'}
      </button>
    </form>
  )
}
