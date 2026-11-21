-- Ubicación en vivo del conductor durante un viaje.
-- Privacidad (RNF-03): se guarda SOLO la última posición (una fila por viaje, sin historial),
-- la comparte el conductor a propósito y con la app abierta, y se borra al dejar de compartir
-- o cuando el viaje se cierra o se cancela (job de cierre).

CREATE TABLE ubicaciones_viaje (
  viaje_id       integer      PRIMARY KEY REFERENCES viajes (id) ON DELETE CASCADE,
  lat            numeric(9,6) NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng            numeric(9,6) NOT NULL CHECK (lng BETWEEN -180 AND 180),
  precision_m    integer      CHECK (precision_m BETWEEN 0 AND 100000),
  actualizada_en timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE ubicaciones_viaje IS 'Última posición que compartió el conductor; la ven solo él y sus pasajeros confirmados';
