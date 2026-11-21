import seatAvailable from '../../assets/figma/seat-available.svg'
import seatOccupied from '../../assets/figma/seat-occupied.svg'

/** Asientos ocupados (coral) y libres (negro), con el texto "3/4 ocupadas". */
export function SeatCount({ taken, total }) {
  return (
    <div className="seats" aria-label={`${taken} de ${total} plazas ocupadas`}>
      {Array.from({ length: total }, (_, index) => (
        <img key={index} src={index < taken ? seatOccupied : seatAvailable} width="16" height="16" alt="" />
      ))}
      <small>
        {taken}/{total} ocupadas
      </small>
    </div>
  )
}
