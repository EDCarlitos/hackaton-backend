-- Sin verificación de correo: el registro y el login no la usan.
ALTER TABLE usuarios DROP COLUMN correo_verificado_en;
