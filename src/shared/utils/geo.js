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

module.exports = { distanciaKm, codificarPolilinea, decodificarPolilinea };
