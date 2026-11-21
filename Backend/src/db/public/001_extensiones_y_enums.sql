CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

CREATE TYPE public.rol_usuario AS ENUM (
  'usuario',
  'admin'        -- admin de la institución
);

CREATE TYPE public.estado_viaje AS ENUM (
  'abierto',     -- acepta reservas
  'lleno',       -- sin asientos
  'en_curso',    -- iniciado; reservas solo hasta reservas_cierran_en
  'finalizado',
  'cancelado'
);

CREATE TYPE public.estado_reserva AS ENUM (
  'solicitada',
  'confirmada',
  'rechazada',
  'cancelada',
  'completada',
  'expirada'
);
