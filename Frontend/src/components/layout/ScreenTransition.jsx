import { AnimatePresence, motion } from 'motion/react'

const transition = { duration: 0.22, ease: 'easeOut' }

/** Anima el cambio entre pantallas; `screenKey` identifica la pantalla actual. */
export function ScreenTransition({ screenKey, children }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={screenKey}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={transition}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
