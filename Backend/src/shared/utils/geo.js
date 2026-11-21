// Utilidades geográficas sin dependencias.

const RADIO_TIERRA_KM = 6371;
const rad = (g) => (g * Math.PI) / 180;

// Distancia en línea recta (haversine) entre { lat, lng }.
function distanciaKm(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.sqrt(h));
}

// "Encoded Polyline Algorithm Format" de Google: el mismo formato que devuelve la Routes API
// y que el frontend decodifica con google.maps.geometry.encoding.decodePath.
function codificarValor(valor) {
  let v = valor < 0 ? ~(valor << 1) : valor << 1;
  let out = '';
  while (v >= 0x20) {
    out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  return out + String.fromCharCode(v + 63);
}

function codificarPolilinea(puntos) {
  let latPrev = 0;
  let lngPrev = 0;
  let out = '';
  for (const { lat, lng } of puntos) {
    const la = Math.round(lat * 1e5);
    const ln = Math.round(lng * 1e5);
    out += codificarValor(la - latPrev) + codificarValor(ln - lngPrev);
    latPrev = la;
    lngPrev = ln;
  }
  return out;
}

function decodificarPolilinea(texto) {
  const puntos = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  const leer = () => {
    let resultado = 0;
    let shift = 0;
    let b;
    do {
      b = texto.charCodeAt(i++) - 63;
      resultado |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return resultado & 1 ? ~(resultado >> 1) : resultado >> 1;
  };
  while (i < texto.length) {
    lat += leer();
    lng += leer();
    puntos.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return puntos;
}

// Punto de la ruta (lista de { lat, lng }) más cercano a `p`.
// Devuelve { distanciaM, punto, avanceM }: distancia en línea recta de p a la ruta, el punto
// más cercano sobre ella y cuántos metros de ruta hay desde el inicio hasta ese punto
// (sirve para saber si un punto queda antes o después que otro en el sentido del viaje).
// Usa una proyección plana local alrededor de p: a escala de ciudad el error es despreciable.
function proyectarEnRuta(puntos, p) {
  if (!puntos.length) return null;
  const k = Math.cos(rad(p.lat));
  const aXY = (q) => ({ x: rad(q.lng - p.lng) * k * RADIO_TIERRA_KM * 1000, y: rad(q.lat - p.lat) * RADIO_TIERRA_KM * 1000 });

  if (puntos.length === 1) {
    const a = aXY(puntos[0]);
    return { distanciaM: Math.hypot(a.x, a.y), punto: puntos[0], avanceM: 0 };
  }

  let mejor = null;
  let recorridoM = 0;
  for (let i = 0; i < puntos.length - 1; i++) {
    const [p1, p2] = [puntos[i], puntos[i + 1]];
    const a = aXY(p1);
    const b = aXY(p2);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const largo2 = dx * dx + dy * dy;
    // t = posición (0..1) de la proyección de p (el origen del plano) sobre el segmento a→b.
    const t = largo2 ? Math.min(1, Math.max(0, -(a.x * dx + a.y * dy) / largo2)) : 0;
    const distanciaM = Math.hypot(a.x + t * dx, a.y + t * dy);
    const tramoM = distanciaKm(p1, p2) * 1000;

    if (!mejor || distanciaM < mejor.distanciaM) {
      mejor = {
        distanciaM,
        punto: { lat: p1.lat + t * (p2.lat - p1.lat), lng: p1.lng + t * (p2.lng - p1.lng) },
        avanceM: recorridoM + t * tramoM,
      };
    }
    recorridoM += tramoM;
  }
  return mejor;
}

module.exports = { distanciaKm, codificarPolilinea, decodificarPolilinea, proyectarEnRuta };
