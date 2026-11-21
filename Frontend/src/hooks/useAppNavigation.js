import { useCallback, useState } from 'react'
import { PAGES } from '../constants/pages'

/** Pantalla actual y sus parámetros (ej. { viajeId }). Sin router: es una app de una sola vista. */
export function useAppNavigation(initialPage = PAGES.HOME) {
  const [ruta, setRuta] = useState({ page: initialPage, params: {} })

  const navigate = useCallback((page, params = {}) => {
    setRuta({ page, params })
    window.scrollTo({ top: 0 })
  }, [])

  return { page: ruta.page, params: ruta.params, navigate }
}
