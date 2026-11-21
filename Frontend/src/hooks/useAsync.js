import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Corre `fn` (async) al montar y cada vez que cambia `clave`; `reload()` la vuelve a correr.
 * Mientras recarga conserva los datos anteriores (sin parpadeo).
 * Con `intervaloMs` se refresca sola (polling), solo con la pestaña visible.
 */
export function useAsync(fn, clave = '', { intervaloMs = 0 } = {}) {
  const [estado, setEstado] = useState({ data: null, error: null, cargando: true })
  const [version, setVersion] = useState(0)
  const fnRef = useRef(fn)

  useEffect(() => {
    fnRef.current = fn
  })

  useEffect(() => {
    let vigente = true
    fnRef
      .current()
      .then((data) => vigente && setEstado({ data, error: null, cargando: false }))
      .catch((error) => vigente && setEstado((e) => ({ data: e.data, error, cargando: false })))
    return () => {
      vigente = false
    }
  }, [clave, version])

  useEffect(() => {
    if (!intervaloMs) return undefined
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') setVersion((v) => v + 1)
    }, intervaloMs)
    return () => clearInterval(id)
  }, [intervaloMs])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { ...estado, reload }
}
