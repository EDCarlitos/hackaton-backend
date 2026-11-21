// Tests unitarios de las reglas de compatibilidad (sin BD).
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { codificarPolilinea, proyectarEnRuta } = require('../src/shared/utils/geo');
const { REGLAS, evaluarRuta, esReservable } = require('../src/shared/utils/emparejamiento');

// Ruta en "L": de A sube al norte hasta B y luego va al este hasta C.
const A = { lat: 21.18, lng: -86.87 };
const B = { lat: 21.2, lng: -86.87 };
const C = { lat: 21.2, lng: -86.82 };
const RUTA = [A, B, C];
const POLILINEA = codificarPolilinea(RUTA);
const metrosLng = (grados, lat) => grados * 111_195 * Math.cos((lat * Math.PI) / 180);

describe('proyectarEnRuta', () => {
  it('mide la distancia perpendicular al tramo más cercano', () => {
    const p = { lat: 21.19, lng: -86.869 }; // 0.001° al este del tramo A→B
    const r = proyectarEnRuta(RUTA, p);
    assert.ok(Math.abs(r.distanciaM - metrosLng(0.001, 21.19)) < 2, String(r.distanciaM));
    assert.ok(Math.abs(r.punto.lat - 21.19) < 1e-6);
    assert.ok(Math.abs(r.punto.lng - -86.87) < 1e-9);
  });

  it('el avance crece en el sentido de la ruta', () => {
    const inicio = proyectarEnRuta(RUTA, { lat: 21.181, lng: -86.8705 });
    const final = proyectarEnRuta(RUTA, { lat: 21.2005, lng: -86.83 });
    assert.ok(final.avanceM > inicio.avanceM);
  });

  it('fuera de los extremos mide contra el punto final', () => {
    const r = proyectarEnRuta(RUTA, { lat: 21.17, lng: -86.87 }); // antes de A
    assert.ok(Math.abs(r.distanciaM - 1112) < 5, String(r.distanciaM));
    assert.equal(r.avanceM, 0);
  });
});

describe('evaluarRuta', () => {
  const cerca = { lat: 21.19, lng: -86.869 };
  const finalCerca = { lat: 21.2005, lng: -86.83 };

  it('compatible si la recogida está a menos de MAX_DISTANCIA_PIE_M', () => {
    const ev = evaluarRuta(POLILINEA, cerca);
    assert.equal(ev.compatible, true);
    assert.ok(ev.distanciaPieM < REGLAS.MAX_DISTANCIA_PIE_M);
  });

  it('RECOGIDA_LEJOS / BAJADA_LEJOS', () => {
    const lejos = { lat: 21.19, lng: -86.85 };
    assert.equal(evaluarRuta(POLILINEA, lejos).motivo, 'RECOGIDA_LEJOS');
    assert.equal(evaluarRuta(POLILINEA, cerca, lejos).motivo, 'BAJADA_LEJOS');
  });

  it('SENTIDO_CONTRARIO si la bajada queda antes que la recogida', () => {
    assert.equal(evaluarRuta(POLILINEA, cerca, finalCerca).compatible, true);
    assert.equal(evaluarRuta(POLILINEA, finalCerca, cerca).motivo, 'SENTIDO_CONTRARIO');
  });
});

describe('esReservable', () => {
  const ahora = Date.now();
  const en = (min) => new Date(ahora + min * 60_000);

  it('abierto y antes de la salida', () => {
    assert.equal(esReservable({ estado: 'abierto', salida_en: en(10) }, ahora), true);
    assert.equal(esReservable({ estado: 'abierto', salida_en: en(-1) }, ahora), false);
  });

  it('en curso solo hasta reservas_cierran_en; lleno/cancelado/finalizado nunca', () => {
    assert.equal(esReservable({ estado: 'en_curso', reservas_cierran_en: en(2) }, ahora), true);
    assert.equal(esReservable({ estado: 'en_curso', reservas_cierran_en: en(-1) }, ahora), false);
    assert.equal(esReservable({ estado: 'en_curso', reservas_cierran_en: null }, ahora), false);
    for (const estado of ['lleno', 'cancelado', 'finalizado']) {
      assert.equal(esReservable({ estado, salida_en: en(30) }, ahora), false, estado);
    }
  });
});
