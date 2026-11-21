/** Origen y destino unidos por la línea de recorrido. */
export function Route({ origen, destino }) {
  return (
    <div className="route">
      <span className="route-line">
        <i />
        <b />
      </span>
      <div>
        <strong>{origen?.texto || 'Origen'}</strong>
        <strong>{destino?.texto || 'Destino'}</strong>
      </div>
    </div>
  )
}
