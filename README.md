# RutaCaribe

Desde la raíz del repositorio, con Docker y el plugin Compose instalados:

```bash
docker compose up
```

Abre [RutaCaribe](http://localhost:8080). Compose levanta PostgreSQL, espera a que la API aplique las migraciones y cargue los datos de demostración, y arranca el servidor de desarrollo de Vite. Puedes entrar con `ana.conductora@ucaribe.edu.mx` o `valeria.pasajera@ucaribe.edu.mx`. La contraseña de ambas cuentas es `secreta123`.

Vite aplica los cambios del frontend al guardar mediante HMR. Node reinicia la API al editar sus módulos. Solo Vite publica un puerto en el host y envía las peticiones de `/api/` al backend. PostgreSQL guarda sus datos en el volumen `rutacaribe_postgres_data`, independiente del Compose de solo PostgreSQL de `Backend/`. `docker compose down` detiene el conjunto y conserva el volumen.

El archivo `.env` en la raíz es opcional. Puedes definir `APP_PORT` para cambiar el puerto o las llaves `GOOGLE_MAPS_API_KEY` (Routes API) y `VITE_GOOGLE_MAPS_API_KEY` (Maps JavaScript y Places) para habilitar los mapas de Google. Sin llaves se usan rutas simuladas y mapas esquemáticos.

Si cambias dependencias o un Dockerfile, ejecuta `docker compose up --build`. Si cambias el `.env` de la raíz, vuelve a ejecutar `docker compose up` para aplicar los nuevos valores.
