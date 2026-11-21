// Conversión de filas de pg a la forma que ve el frontend.
// Las columnas numeric llegan como string: aquí se pasan a number.

const aNumero = (v) => (v === null || v === undefined ? null : Number(v));

const aPunto = (lat, lng, texto) => ({ lat: aNumero(lat), lng: aNumero(lng), texto: texto ?? null });

const aRuta = (fila) => ({
  polilinea: fila.polilinea,
  distancia_km: aNumero(fila.distancia_km),
  duracion_min: fila.duracion_min ?? null,
});

// time de pg llega como "07:30:00"; se expone como "07:30".
const aHora = (t) => (t ? t.slice(0, 5) : null);

module.exports = { aNumero, aPunto, aRuta, aHora };
