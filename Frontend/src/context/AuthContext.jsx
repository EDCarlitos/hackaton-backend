import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, onSesionExpirada, tokenGuardado } from '../lib/api'

const AuthContext = createContext(null)

/**
 * Sesión del usuario. Al cargar, si hay token guardado se valida con GET /auth/me.
 * estado: 'cargando' | 'anonimo' | 'autenticado'.
 */
export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null)
  const [estado, setEstado] = useState(() => (tokenGuardado.leer() ? 'cargando' : 'anonimo'))

  const cerrarSesion = useCallback(() => {
    tokenGuardado.guardar(null)
    setUsuario(null)
    setEstado('anonimo')
  }, [])

  useEffect(() => {
    onSesionExpirada(cerrarSesion)
    if (!tokenGuardado.leer()) return
    api
      .get('/auth/me')
      .then(({ usuario: u }) => {
        setUsuario(u)
        setEstado('autenticado')
      })
      .catch(cerrarSesion)
  }, [cerrarSesion])

  const entrar = useCallback(({ usuario: u, token }) => {
    tokenGuardado.guardar(token)
    setUsuario(u)
    setEstado('autenticado')
  }, [])

  const valor = useMemo(
    () => ({
      usuario,
      estado,
      iniciarSesion: async (correo, password) => entrar(await api.post('/auth/login', { correo, password })),
      registrarse: async (datos) => entrar(await api.post('/auth/register', datos)),
      cerrarSesion,
    }),
    [usuario, estado, entrar, cerrarSesion],
  )

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth se usó fuera de <AuthProvider>')
  return ctx
}
