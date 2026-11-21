import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { MessageCircle, Send } from 'lucide-react'

/** Chat de grupo del viaje (RF-23). Recibe el resultado de `useChat(viajeId)`. */
export function TripChat({ chat }) {
  const lista = useRef(null)

  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight, behavior: 'smooth' })
  }, [chat.mensajes.length])

  if (!chat.disponible) return null

  const handleSubmit = (event) => {
    event.preventDefault()
    chat.sendDraft()
  }

  return (
    <section className="chat">
      <header>
        <div>
          <MessageCircle size={20} />
          <b>Chat del viaje</b>
        </div>
        <div className="avatar-stack" title={chat.participantes.map((p) => p.nombre_visible).join(', ')}>
          {chat.participantes.map((p) => (
            <i key={`${p.papel}-${p.id}`} className={p.papel === 'conductor' ? 'avatar--conductor' : ''}>
              {p.nombre_visible.charAt(0)}
            </i>
          ))}
        </div>
      </header>
      <div className="chat-messages" ref={lista}>
        {chat.mensajes.length === 0 && <small className="text-muted">Aún no hay mensajes.</small>}
        <AnimatePresence initial={false}>
          {chat.mensajes.map((message) => (
            <ChatBubble key={message.id} message={message} />
          ))}
        </AnimatePresence>
      </div>
      {chat.puedeEscribir ? (
        <form onSubmit={handleSubmit}>
          <input
            value={chat.draft}
            maxLength={500}
            onChange={(event) => chat.setDraft(event.target.value)}
            placeholder="Escribe un mensaje…"
          />
          <button type="submit" aria-label="Enviar mensaje">
            <Send size={18} />
          </button>
        </form>
      ) : (
        <small className="text-muted">El chat está cerrado para este viaje.</small>
      )}
      {chat.error && <small className="mt-1 block text-coral">{chat.error}</small>}
    </section>
  )
}

function ChatBubble({ message }) {
  return (
    <motion.p
      className={message.mio ? 'bubble bubble--mine' : 'bubble'}
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4 }}
    >
      {!message.mio && <b className="block text-[11px]">{message.autor.nombre_visible}</b>}
      {message.texto}
    </motion.p>
  )
}
