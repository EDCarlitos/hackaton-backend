import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { MessageCircle, Send, User } from 'lucide-react'

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
          Chat del viaje
        </div>
        <div className="chat-people" aria-label={chat.participantes.map((p) => p.nombre_visible).join(', ')}>
          {chat.participantes.map((p) => (
            <span key={`${p.papel}-${p.id}`} title={`${p.nombre_visible}${p.papel === 'conductor' ? ' (conductor)' : ''}`}>
              <User size={24} />
            </span>
          ))}
        </div>
      </header>
      <div className="chat-messages" ref={lista}>
        {chat.mensajes.length === 0 && <small>Aún no hay mensajes.</small>}
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
            aria-label="Mensaje"
          />
          <button type="submit" aria-label="Enviar mensaje">
            <Send size={18} />
          </button>
        </form>
      ) : (
        <small>El chat está cerrado para este viaje.</small>
      )}
      {chat.error && <small className="mt-1 text-coral">{chat.error}</small>}
    </section>
  )
}

function ChatBubble({ message }) {
  return (
    <motion.p
      className={message.mio ? 'bubble bubble--mine' : 'bubble'}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      {!message.mio && <b>{message.autor.nombre_visible}</b>}
      {message.texto}
    </motion.p>
  )
}
