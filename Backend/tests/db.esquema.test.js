const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { pool, prepararBD, cerrarBD, crearInstitucion, crearUsuario, unico } = require('./helpers');

before(prepararBD);
after(cerrarBD);

const TABLAS_TENANT = [
  'usuarios',
  'vehiculos',
  'trayectos',
  'viajes',
  'reservas',
  'mensajes',
  'notificaciones',
  'ubicaciones_viaje',
];

async function tablasDe(schema) {
  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name`,
    [schema],
  );
  return rows.map((r) => r.table_name);
}

// Inserta y devuelve la fila; los tests usan el schema ucaribe calificado.
async function insertar(sql, params) {
  const { rows } = await pool.query(sql, params);
  return rows[0];
}

const crearVehiculo = (usuarioId, asientos = 4) =>
  insertar(
    `INSERT INTO ucaribe.vehiculos (usuario_id, placa_o_descripcion, asientos) VALUES ($1, 'ABC-123', $2) RETURNING *`,
    [usuarioId, asientos],
  );

function crearViaje({ conductorId, vehiculoId, ...extra }) {
  const v = {
    asientos_ofrecidos: 3,
    asientos_disponibles: 3,
    estado: 'abierto',
    iniciado_en: null,
    finalizado_en: null,
    costo_referencia: null,
    ...extra,
  };
  return insertar(
    `INSERT INTO ucaribe.viajes
       (conductor_id, vehiculo_id, origen_lat, origen_lng, destino_lat, destino_lng, polilinea, salida_en,
        asientos_ofrecidos, asientos_disponibles, estado, iniciado_en, finalizado_en, costo_referencia)
     VALUES ($1, $2, 21.16, -86.85, 21.20, -86.82, 'abc', now() + interval '1 hour',
             $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      conductorId,
      vehiculoId,
      v.asientos_ofrecidos,
      v.asientos_disponibles,
      v.estado,
      v.iniciado_en,
      v.finalizado_en,
      v.costo_referencia,
    ],
  );
}

const crearReserva = (viajeId, pasajeroId, estado = 'solicitada') =>
  insertar(
    `INSERT INTO ucaribe.reservas (viaje_id, pasajero_id, recogida_lat, recogida_lng, estado)
     VALUES ($1, $2, 21.17, -86.84, $3) RETURNING *`,
    [viajeId, pasajeroId, estado],
  );

async function conductorConVehiculo() {
  const { usuario } = await crearUsuario();
  const vehiculo = await crearVehiculo(usuario.id);
  return { conductor: usuario, vehiculo };
}

// Verifica que la promesa falle con el código de Postgres (y la constraint, si se da).
async function rechaza(promesa, code, constraint) {
  await assert.rejects(promesa, (err) => {
    assert.equal(err.code, code, err.message);
    if (constraint) assert.equal(err.constraint, constraint);
    return true;
  });
}

describe('esquema de la BD', () => {
  it('usuarios ya no tiene columna de verificación de correo', async () => {
    const { rowCount } = await pool.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'ucaribe' AND table_name = 'usuarios' AND column_name = 'correo_verificado_en'`,
    );
    assert.equal(rowCount, 0);
  });

  it('ucaribe (migrado al arrancar) tiene todas las tablas del tenant', async () => {
    const tablas = await tablasDe('ucaribe');
    for (const t of TABLAS_TENANT) assert.ok(tablas.includes(t), `falta ${t}`);
  });

  it('una institución nueva (POST /instituciones) recibe las mismas tablas', async () => {
    const schema = `nueva_${unico()}`;
    await crearInstitucion({ nombre: 'Nueva', schema_nombre: schema }).expect(201);
    const tablas = await tablasDe(schema);
    for (const t of TABLAS_TENANT) assert.ok(tablas.includes(t), `falta ${t}`);
  });

  it('no existe ninguna tabla de tokens', async () => {
    const { rowCount } = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name LIKE '%token%'`,
    );
    assert.equal(rowCount, 0);
  });
});

describe('vehiculos', () => {
  it('asientos entre 1 y 4', async () => {
    const { usuario } = await crearUsuario();
    await rechaza(crearVehiculo(usuario.id, 0), '23514');
    await rechaza(crearVehiculo(usuario.id, 5), '23514');
  });
});

describe('viajes', () => {
  it('se crea un viaje válido con estado "abierto" por defecto', async () => {
    const { conductor, vehiculo } = await conductorConVehiculo();
    const viaje = await crearViaje({ conductorId: conductor.id, vehiculoId: vehiculo.id });
    assert.equal(viaje.estado, 'abierto');
  });

  it('FK compuesta: el vehículo tiene que ser del conductor', async () => {
    const { vehiculo } = await conductorConVehiculo();
    const { usuario: otro } = await crearUsuario();
    await rechaza(
      crearViaje({ conductorId: otro.id, vehiculoId: vehiculo.id }),
      '23503',
      'fk_viajes_vehiculo_conductor',
    );
  });

  it('valida asientos, costo e inicio/fin según el estado', async () => {
    const { conductor, vehiculo } = await conductorConVehiculo();
    const base = { conductorId: conductor.id, vehiculoId: vehiculo.id };

    await rechaza(crearViaje({ ...base, asientos_ofrecidos: 5, asientos_disponibles: 5 }), '23514', 'chk_asientos_ofrecidos');
    await rechaza(crearViaje({ ...base, asientos_disponibles: 4 }), '23514', 'chk_asientos_disponibles');
    await rechaza(crearViaje({ ...base, costo_referencia: -1 }), '23514', 'chk_costo');
    await rechaza(crearViaje({ ...base, estado: 'en_curso' }), '23514', 'chk_iniciado');
    await rechaza(crearViaje({ ...base, estado: 'finalizado', iniciado_en: new Date() }), '23514', 'chk_finalizado');
  });

  it('no se puede borrar un vehículo que tiene viajes (RESTRICT)', async () => {
    const { conductor, vehiculo } = await conductorConVehiculo();
    await crearViaje({ conductorId: conductor.id, vehiculoId: vehiculo.id });
    await rechaza(pool.query('DELETE FROM ucaribe.vehiculos WHERE id = $1', [vehiculo.id]), '23503');
  });
});

describe('reservas', () => {
  it('solo una reserva ACTIVA por pasajero y viaje, pero puede volver a pedir tras cancelar', async () => {
    const { conductor, vehiculo } = await conductorConVehiculo();
    const viaje = await crearViaje({ conductorId: conductor.id, vehiculoId: vehiculo.id });
    const { usuario: pasajero } = await crearUsuario();

    const primera = await crearReserva(viaje.id, pasajero.id);
    await rechaza(crearReserva(viaje.id, pasajero.id), '23505', 'ux_reserva_activa');

    await pool.query("UPDATE ucaribe.reservas SET estado = 'cancelada' WHERE id = $1", [primera.id]);
    const segunda = await crearReserva(viaje.id, pasajero.id);
    assert.equal(segunda.estado, 'solicitada');
  });

  it('el punto de bajada va completo o vacío', async () => {
    const { conductor, vehiculo } = await conductorConVehiculo();
    const viaje = await crearViaje({ conductorId: conductor.id, vehiculoId: vehiculo.id });
    const { usuario: pasajero } = await crearUsuario();

    await rechaza(
      pool.query(
        `INSERT INTO ucaribe.reservas (viaje_id, pasajero_id, recogida_lat, recogida_lng, bajada_lat)
         VALUES ($1, $2, 21.1, -86.8, 21.2)`,
        [viaje.id, pasajero.id],
      ),
      '23514',
      'chk_bajada_completa',
    );
  });

  it('al borrar el viaje se borran sus reservas y mensajes (CASCADE)', async () => {
    const { conductor, vehiculo } = await conductorConVehiculo();
    const viaje = await crearViaje({ conductorId: conductor.id, vehiculoId: vehiculo.id });
    const { usuario: pasajero } = await crearUsuario();
    await crearReserva(viaje.id, pasajero.id);
    await pool.query(`INSERT INTO ucaribe.mensajes (viaje_id, autor_id, texto) VALUES ($1, $2, 'hola')`, [
      viaje.id,
      conductor.id,
    ]);

    await pool.query('DELETE FROM ucaribe.viajes WHERE id = $1', [viaje.id]);

    const r = await pool.query('SELECT count(*)::int AS n FROM ucaribe.reservas WHERE viaje_id = $1', [viaje.id]);
    const m = await pool.query('SELECT count(*)::int AS n FROM ucaribe.mensajes WHERE viaje_id = $1', [viaje.id]);
    assert.equal(r.rows[0].n, 0);
    assert.equal(m.rows[0].n, 0);
  });
});

describe('mensajes', () => {
  it('rechaza texto vacío o solo espacios', async () => {
    const { conductor, vehiculo } = await conductorConVehiculo();
    const viaje = await crearViaje({ conductorId: conductor.id, vehiculoId: vehiculo.id });
    await rechaza(
      pool.query(`INSERT INTO ucaribe.mensajes (viaje_id, autor_id, texto) VALUES ($1, $2, '   ')`, [
        viaje.id,
        conductor.id,
      ]),
      '23514',
    );
  });
});

describe('trayectos', () => {
  it('al borrar el trayecto, el viaje queda con trayecto_id NULL (SET NULL)', async () => {
    const { conductor, vehiculo } = await conductorConVehiculo();
    const trayecto = await insertar(
      `INSERT INTO ucaribe.trayectos
         (conductor_id, vehiculo_id, asientos, nombre, origen_lat, origen_lng, destino_lat, destino_lng, polilinea)
       VALUES ($1, $2, 3, 'Casa → UCaribe', 21.1, -86.8, 21.2, -86.8, 'abc') RETURNING *`,
      [conductor.id, vehiculo.id],
    );
    const viaje = await crearViaje({ conductorId: conductor.id, vehiculoId: vehiculo.id });
    await pool.query('UPDATE ucaribe.viajes SET trayecto_id = $1 WHERE id = $2', [trayecto.id, viaje.id]);

    await pool.query('DELETE FROM ucaribe.trayectos WHERE id = $1', [trayecto.id]);

    const { rows } = await pool.query('SELECT trayecto_id FROM ucaribe.viajes WHERE id = $1', [viaje.id]);
    assert.equal(rows[0].trayecto_id, null);
  });

  it('valida rangos de latitud y longitud', async () => {
    const { conductor, vehiculo } = await conductorConVehiculo();
    await rechaza(
      pool.query(
        `INSERT INTO ucaribe.trayectos
           (conductor_id, vehiculo_id, asientos, nombre, origen_lat, origen_lng, destino_lat, destino_lng, polilinea)
         VALUES ($1, $2, 3, 'X', 91, 0, 0, 0, 'abc')`,
        [conductor.id, vehiculo.id],
      ),
      '23514',
    );
  });

  it('FK compuesta: el vehículo de la plantilla tiene que ser del conductor', async () => {
    const { vehiculo } = await conductorConVehiculo();
    const { usuario: otro } = await crearUsuario();
    await rechaza(
      pool.query(
        `INSERT INTO ucaribe.trayectos
           (conductor_id, vehiculo_id, asientos, nombre, origen_lat, origen_lng, destino_lat, destino_lng, polilinea)
         VALUES ($1, $2, 3, 'X', 21.1, -86.8, 21.2, -86.8, 'abc')`,
        [otro.id, vehiculo.id],
      ),
      '23503',
      'fk_trayectos_vehiculo_conductor',
    );
  });
});

describe('viajes cancelados y notificaciones', () => {
  it('un viaje cancelado exige cancelado_en (chk_cancelado)', async () => {
    const { conductor, vehiculo } = await conductorConVehiculo();
    await rechaza(
      crearViaje({ conductorId: conductor.id, vehiculoId: vehiculo.id, estado: 'cancelado' }),
      '23514',
      'chk_cancelado',
    );
  });

  it('al borrar el viaje se borran sus notificaciones (CASCADE)', async () => {
    const { conductor, vehiculo } = await conductorConVehiculo();
    const viaje = await crearViaje({ conductorId: conductor.id, vehiculoId: vehiculo.id });
    await pool.query(
      `INSERT INTO ucaribe.notificaciones (usuario_id, tipo, titulo, mensaje, viaje_id)
       VALUES ($1, 'viaje_cancelado', 'T', 'M', $2)`,
      [conductor.id, viaje.id],
    );
    await pool.query('DELETE FROM ucaribe.viajes WHERE id = $1', [viaje.id]);
    const { rowCount } = await pool.query('SELECT 1 FROM ucaribe.notificaciones WHERE viaje_id = $1', [viaje.id]);
    assert.equal(rowCount, 0);
  });
});
