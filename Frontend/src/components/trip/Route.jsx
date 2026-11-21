import routeMarkers from '../../assets/figma/route-markers.svg'

/** Origen y destino unidos por el marcador de recorrido punteado. */
export function Route({ origen, destino }) {
  return (
    <div className="route">
      <img src={routeMarkers} width="8" height="44" alt="" />
      <div>
        <strong>{origen?.texto || 'Origen'}</strong>
        <strong>{destino?.texto || 'Destino'}</strong>
      </div>
    </div>
  )
}
