import { motion } from 'motion/react'
import { X } from 'lucide-react'
import { createPortal } from 'react-dom'

const sheetTransition = { type: 'spring', stiffness: 400, damping: 32 }

/** Usa el viewport incluso mientras la pantalla que abrió el modal se está animando. */
export function Modal({ children, onClose }) {
  return createPortal(
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <motion.section
        className="modal-sheet min-w-0 rounded-[22px] bg-white p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 30, opacity: 0 }}
        transition={sheetTransition}
      >
        {children}
      </motion.section>
    </motion.div>,
    document.body,
  )
}

export function ModalHeader({ eyebrow, title, onClose }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <div>
        {eyebrow && <p className="text-sm text-muted">{eyebrow}</p>}
        <h2 className="text-xl font-semibold">{title}</h2>
      </div>
      <ModalCloseButton onClick={onClose} />
    </div>
  )
}

export function ModalCloseButton({ onClick }) {
  return (
    <button
      type="button"
      className="grid size-9 shrink-0 place-items-center rounded-full bg-surface"
      onClick={onClick}
      aria-label="Cerrar"
    >
      <X size={18} />
    </button>
  )
}
