/** Asientos ocupados de un total (llenos en coral, libres en gris). */
export function SeatCount({ taken, total }) {
  const seats = Array.from({ length: total }, (_, index) => index < taken)

  return (
    <div className="seats">
      {seats.map((isTaken, index) => (
        <span key={index} className={isTaken ? undefined : 'empty'}>
          ♟
        </span>
      ))}
      <small>
        {total - taken} {total - taken === 1 ? 'libre' : 'libres'}
      </small>
    </div>
  )
}
