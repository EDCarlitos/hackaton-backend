// Cliente HTTP del backend. Todas las llamadas pasan por aquí: agrega el token y convierte
// los errores del API ({ error: { codigo, mensaje, detalles } }) en ApiError.

const BASE = import.meta.env.VITE_API_URL || '/api'
const TOKEN_KEY = 'rutacaribe.token'

export class ApiError extends Error {
  constructor({ status, codigo, mensaje, detalles }) {
    super(mensaje)
    this.status = status
    this.codigo = codigo
    this.detalles = detalles
  }

  /** Mensaje para mostrar: el general más el detalle por campo, si hay. */
  get textoCompleto() {
    const extra = this.detalles ? Object.values(this.detalles).join(' · ') : ''
    return extra ? `${this.message}: ${extra}` : this.message
  }
}

// localStorage puede fallar (modo privado, bloqueado): la app sigue funcionando sin recordar la sesión.
export const tokenGuardado = {
  leer() {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  guardar(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token)
      else localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* sin almacenamiento: solo dura la sesión */
    }
  },
}

let alExpirarSesion = () => {}
export function onSesionExpirada(fn) {
  alExpirarSesion = fn
}

async function request(method, path, { body, query } = {}) {
  const url = new URL(`${BASE}${path}`, window.location.origin)
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v)
  }

  const token = tokenGuardado.leer()
  let res
  try {
    res = await fetch(url, {
      method,
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError({ status: 0, codigo: 'SIN_CONEXION', mensaje: 'No hay conexión con el servidor' })
  }

  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const e = data?.error || {}
    const error = new ApiError({
      status: res.status,
      codigo: e.codigo || 'ERROR',
      mensaje: e.mensaje || `Error ${res.status}`,
      detalles: e.detalles,
    })
    if (res.status === 401 && token) alExpirarSesion(error)
    throw error
  }
  return data
}

export const api = {
  get: (path, query) => request('GET', path, { query }),
  post: (path, body) => request('POST', path, { body: body ?? {} }),
  delete: (path) => request('DELETE', path),
}
