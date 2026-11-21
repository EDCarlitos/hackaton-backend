// Tests unitarios del cliente de rutas: no usan BD ni red (fetch se simula).
const { describe, it, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const google = require('../src/shared/maps/google');
const simulado = require('../src/shared/maps/simulado');
const { codificarPolilinea, decodificarPolilinea } = require('../src/shared/utils/geo');

afterEach(() => mock.restoreAll());

const ORIGEN = { lat: 21.1826, lng: -86.8678 };
const DESTINO = { lat: 21.2004, lng: -86.8226 };

const respuesta = (status, body) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

describe('polilínea codificada', () => {
  it('coincide con el ejemplo de la documentación de Google', () => {
    const puntos = [
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ];
    assert.equal(codificarPolilinea(puntos), '_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    assert.deepEqual(decodificarPolilinea('_p~iF~ps|U_ulLnnqC_mqNvxq`@'), puntos);
  });
});

describe('proveedor simulado', () => {
  it('traza del origen al destino y estima distancia y duración', async () => {
    const ruta = await simulado.calcularRuta(ORIGEN, DESTINO);
    const puntos = decodificarPolilinea(ruta.polilinea);
    assert.deepEqual(puntos[0], ORIGEN);
    assert.deepEqual(puntos.at(-1), DESTINO);
    assert.ok(ruta.distanciaKm > 4 && ruta.distanciaKm < 10, String(ruta.distanciaKm));
    assert.ok(Number.isInteger(ruta.duracionMin) && ruta.duracionMin > 0);
  });
});

describe('Google Routes API', () => {
  it('manda la petición correcta y convierte la respuesta', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', () =>
      respuesta(200, {
        routes: [{ distanceMeters: 7012, duration: '905s', polyline: { encodedPolyline: 'abc123' } }],
      }),
    );

    const ruta = await google.calcularRuta(ORIGEN, DESTINO, { apiKey: 'llave-x' });

    assert.deepEqual(ruta, { polilinea: 'abc123', distanciaKm: 7.01, duracionMin: 15 });
    assert.equal(fetchMock.mock.callCount(), 1);
    const [url, opciones] = fetchMock.mock.calls[0].arguments;
    assert.equal(url, 'https://routes.googleapis.com/directions/v2:computeRoutes');
    assert.equal(opciones.method, 'POST');
    assert.equal(opciones.headers['X-Goog-Api-Key'], 'llave-x');
    assert.equal(
      opciones.headers['X-Goog-FieldMask'],
      'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
    );
    const body = JSON.parse(opciones.body);
    assert.deepEqual(body.origin, { location: { latLng: { latitude: 21.1826, longitude: -86.8678 } } });
    assert.deepEqual(body.destination, { location: { latLng: { latitude: 21.2004, longitude: -86.8226 } } });
    assert.equal(body.travelMode, 'DRIVE');
  });

  it('sin rutas (respuesta {}) → 400 RUTA_NO_ENCONTRADA', async () => {
    mock.method(globalThis, 'fetch', () => respuesta(200, {}));
    await assert.rejects(google.calcularRuta(ORIGEN, DESTINO, { apiKey: 'x' }), (err) => {
      assert.equal(err.status, 400);
      assert.equal(err.code, 'RUTA_NO_ENCONTRADA');
      return true;
    });
  });

  it('error de Google (ej. 403 llave inválida) → 502 MAPAS_NO_DISPONIBLE sin filtrar el detalle', async () => {
    mock.method(globalThis, 'fetch', () =>
      respuesta(403, { error: { code: 403, status: 'PERMISSION_DENIED', message: 'API key not valid' } }),
    );
    await assert.rejects(google.calcularRuta(ORIGEN, DESTINO, { apiKey: 'x' }), (err) => {
      assert.equal(err.status, 502);
      assert.equal(err.code, 'MAPAS_NO_DISPONIBLE');
      assert.doesNotMatch(err.message, /API key/);
      assert.match(err.cause.message, /PERMISSION_DENIED/);
      return true;
    });
  });

  it('red caída o timeout → 502 MAPAS_NO_DISPONIBLE', async () => {
    mock.method(globalThis, 'fetch', () => Promise.reject(new TypeError('fetch failed')));
    await assert.rejects(google.calcularRuta(ORIGEN, DESTINO, { apiKey: 'x' }), { code: 'MAPAS_NO_DISPONIBLE' });
  });
});
