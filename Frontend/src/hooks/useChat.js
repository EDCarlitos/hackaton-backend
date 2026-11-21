import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'

const INTERVALO_MS = 4000

/**
 * Chat de grupo del viaje (RF-23) con polling: cada 4 s pide solo los mensajes nuevos.
 * `disponible` es false si el usuario no participa (403) o el viaje no existe.
 */
export function useChat(viajeId) {
  const [mensajes, setMensajes] = useState([])
  const [participantes, setParticipantes] = useState([])
  const [puedeEscribir, setPuedeEscribir] = useState(false)
  const [disponible, setDisponible] = useState(true)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState(null)
  const ultimoId = useRef(0)

  const traer = useCallback(async () => {
    try {
      const r = await api.get(`/viajes/${viajeId}/mensajes`, { despues_de: ultimoId.current })
      if (r.mensajes.length) {
        ultimoId.current = r.mensajes.at(-1).id
        setMensajes((prev) => {
          const ids = new Set(prev.map((m) => m.id))
          return [...prev, ...r.mensajes.filter((m) => !ids.has(m.id))]
        })
      }
      setParticipantes(r.participantes)
      setPuedeEscribir(r.puede_escribir)
      setDisponible(true)
    } catch (err) {
      if (err.status === 403 || err.status === 404) setDisponible(false)
    }
  }, [viajeId])

  useEffect(() => {
    ultimoId.current = 0
    let vivo = true
    const tick = () => vivo && document.visibilityState === 'visible' && traer()
    traer()
    const id = setInterval(tick, INTERVALO_MS)
    return () => {
      vivo = false
      clearInterval(id)
      setMensajes([])
    }
  }, [traer])

  const sendDraft = async () => {
    const texto = draft.trim()
    if (!texto) return
    setError(null)
    try {
      const { mensaje } = await api.post(`/viajes/${viajeId}/mensajes`, { texto })
      setDraft('')
      ultimoId.current = Math.max(ultimoId.current, mensaje.id)
      setMensajes((prev) => (prev.some((m) => m.id === mensaje.id) ? prev : [...prev, mensaje]))
    } catch (err) {
      setError(err.textoCompleto || err.message)
    }
  }

  return { mensajes, participantes, puedeEscribir, disponible, draft, setDraft, sendDraft, error }
}
