import { AnimatePresence, motion } from 'motion/react'

// Cambio de pantalla: corto y con ease-out fuerte; se ve muchas veces al día.
const transition = { duration: 0.18, ease: [0.23, 1, 0.32, 1] }

/** Anima el cambio entre pantallas; `screenKey` identifica la pantalla actual. */
export function ScreenTransition({ screenKey, children }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        className="screen-transition"
        key={screenKey}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, transition: { duration: 0.12 } }}
        transition={transition}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
