const VARIANTES = {
  primario: 'bg-coral text-white',
  secundario: 'border border-line bg-white text-ink',
  peligro: 'border border-coral bg-white text-coral',
}

export function PrimaryButton({ children, className = '', type = 'button', onClick, disabled = false, variante = 'primario' }) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={`h-12 w-full rounded-xl text-[15px] font-semibold transition-[opacity,transform] duration-150 ease-out active:scale-[0.98] disabled:opacity-50 ${VARIANTES[variante]} ${className}`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
