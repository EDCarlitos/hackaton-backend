import { motion } from 'motion/react'
import { X } from 'lucide-react'

const sheetTransition = { type: 'spring', stiffness: 400, damping: 32 }

/** Hoja modal: se cierra al hacer clic en el fondo, no dentro del contenido. */
export function Modal({ children, onClose }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-end bg-ink/35 p-3 sm:place-items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={onClose}
    >
      <motion.section
        className="modal-sheet max-h-[92svh] w-full max-w-[382px] min-w-0 overflow-y-auto overscroll-contain rounded-[22px] bg-white p-5 pb-[calc(20px+env(safe-area-inset-bottom,0px))] shadow-2xl"
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 30, opacity: 0 }}
        transition={sheetTransition}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </motion.section>
    </motion.div>
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
