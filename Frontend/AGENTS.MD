RutaCaribe MVP: 

Versión 1.0 · Track: Medio ambiente · Estado: borrador para el equipo 

1. Descripción del proyecto 

RutaCaribe es una aplicación web donde estudiantes verificados con auto publican el trayecto que ya hacen a diario (commute), y compañeros verificados encuentran viajes cuya ruta pasa cerca de su punto de recogida, solicitan un asiento y viajan juntos. 

1.1 Problema 

En horas pico, muchos autos circulan con un solo ocupante por las mismas avenidas, mientras otras personas esperan transporte público saturado. Los asientos vacíos existen, pero no hay una forma simple de que conductor y pasajero coincidan en ruta y horario. 

1.2 Propuesta 

    Comunidad cerrada: acceso solo con correo institucional. 

    Rutas flexibles: el conductor marca su trayecto real y el pasajero camina hasta un punto sobre esa ruta. El conductor no hace desvíos. 

    Publicar en un toque: como el commute se repite, el conductor reutiliza su trayecto con "Salgo hoy". 

    Impacto medible: contador de asientos compartidos y CO₂ evitado (estimación con fórmula visible). 

1.3 Contexto y trabajo relacionado 

La idea no es nueva ​Fuente especificada no válida.​. Antes de afirmar diferenciadores, el equipo debe verificar estas fuentes: 

Solución 
	

Qué hace 
	

Lección para el proyecto 

PumaDrive / PumaCar (UNAM) 
	

Carpool entre estudiantes con rutas predefinidas y verificación de identidad 
	

La comunidad cerrada ya existe; el matching por ruta flexible es una diferencia posible 

Hoop Carpool 
	

Plataforma de carpool que contrata con instituciones (España, Colombia, México, Portugal) 
	

El modelo B2B ya existe; no es un diferenciador por sí solo 

Waze Carpool 
	

Carpool integrado a Waze, cerrado en 2022 
	

Una app bien hecha puede fallar por falta de masa crítica 

Diferenciadores a probar: rutas flexibles por traslape, publicación en un toque, enfoque local en Cancún. 

2. Objetivos y alcance 

2.2 Objetivos específicos 

    Permitir que un conductor publique un viaje en menos de un minuto (y en un toque si ya tiene trayecto guardado). 

    Permitir que un pasajero encuentre viajes compatibles por cercanía a la ruta, orden de recorrido y horario. 

    Gestionar solicitudes y confirmaciones sin sobreventa de asientos. 

    Mostrar un contador de impacto con supuestos transparentes. 

3. Actores 

Actor 
	

Descripción 

Conductor 
	

Usuario verificado con auto que publica un trayecto que ya realiza 

Pasajero 
	

Usuario verificado que busca y solicita un asiento 

Administrador de plataforma 
	

Cuenta global, independiente de cualquier institución, que crea instituciones, registra dominios y aprovisiona su schema. 

Administrador institucional 
	

Usuario del tenant con rol admin que gestiona la operación de su institución después del aprovisionamiento inicial. 

Una misma cuenta puede actuar como conductor o pasajero. El rol es por viaje, no permanente. 

4. Requisitos funcionales 

4.1 Autenticación y perfil 

ID 
	

Requisito 

RF-01 
	

El sistema solo permite iniciar sesión con correo institucional (lista de dominios permitidos, p. ej. @unicaribe.edu.mx). 

RF-02 
	

En el primer inicio de sesión, el usuario captura su nombre visible y acepta los términos (costo de referencia no vinculante, la app no procesa pagos, participación bajo propio riesgo). 

RF-03 
	

El usuario que desea conducir registra placa o descripcion del vehiculo y número de asientos (campos de texto; no se verifican en el MVP). 

RF-04 
	

A otros usuarios solo se les muestra el nombre visible y datos compartidos 

RF-ADM-01 
	

El administrador de plataforma inicia sesión en un portal global que no depende del dominio institucional ni de tenant.usuarios. 

RF-ADM-02 
	

El administrador de plataforma puede registrar una institución con nombre, schema_nombre único, uno o más dominios permitidos y el correo del primer administrador institucional. 

RF-ADM-03 
	

Al registrar una institución, el backend crea el schema desde migraciones, aplica tablas e índices y crea el primer usuario con rol admin dentro del nuevo tenant. 

RF-ADM-04 
	

El alta es idempotente: si falla el aprovisionamiento, la institución queda en estado error y puede reintentarse sin duplicar schemas, dominios ni usuarios. 

4.2 Conductor: publicar viajes 

ID 
	

Requisito 

RF-05 
	

El conductor elige origen y destino en un mapa o mediante búsqueda. 

RF-06 
	

El conductor define fecha, hora de salida y asientos ofrecidos (1 a 4). 

RF-07 
	

El sistema consulta la ruta de manejo una sola vez al publicar y la guarda junto con distancia y duración. 

RF-08 
	

Publicar de nuevo: desde "Mis viajes", el conductor clona un viaje anterior (origen, destino, ruta, asientos) y solo elige fecha y hora. 

RF-09 
	

Mi trayecto (si el tiempo lo permite): el conductor guarda una plantilla y publica con el botón "Salgo hoy". Antes de publicar se muestra un resumen (fecha, hora, ruta, asientos) para confirmar. 

RF-10 
	

El conductor ve "Mis viajes" con estado y solicitudes entrantes. 

RF-11 
	

El conductor puede cancelar un viaje; los pasajeros confirmados reciben aviso dentro de la app. 

4.3 Pasajero: buscar y solicitar 

ID 
	

Requisito 

RF-12 
	

El pasajero elige punto de recogida  

RF-13 
	

El sistema devuelve los viajes compatibles según las reglas de la sección 5, ordenados por distancia a pie al punto de recogida y luego por diferencia de hora. 

RF-14 
	

Cada resultado muestra hora de salida, asientos disponibles, distancia a pie a la ruta y el costo de referencia. 

RF-15 
	

El pasajero solicita un asiento (uno por solicitud) y puede cancelar antes de la salida. 

4.4 Reservas 

ID 
	

Requisito 

RF-16 
	

El conductor acepta o rechaza cada solicitud. 

RF-17 
	

Al aceptar, se descuenta un asiento. El sistema nunca permite más reservas confirmadas que asientos ofrecidos. 

RF-18 
	

Ambas partes ven el estado de la reserva y el punto de recogida acordado. 

RF-19 
	

Los viajes sin asientos disponibles dejan de aparecer en la búsqueda. 

RF-20 
	

Los viajes se cierran automáticamente después de la hora de salida más un margen. 

RF-21 
	

Si un viaje se llena, las solicitudes pendientes restantes se rechazan automáticamente. 

RF-22 
	

Un pasajero no puede tener dos reservas activas en la misma ventana de tiempo. 

RF-23 
	

Chat de grupo para comunicación 

4.5 Impacto ambiental 

ID 
	

Requisito 

RF-23 
	

Una pantalla muestra viajes compartidos, asientos ocupados, kilómetros compartidos y CO₂ evitado estimado. 

RF-24 
	

La fórmula, el factor de emisión (con su fuente) y los supuestos son visibles en pantalla y etiquetados como "estimación". 

5. Reglas de coincidencia (matching) 

Un viaje es compatible con la búsqueda de un pasajero cuando se cumple todo lo siguiente: 

    El punto de recogida está a menos de R metros de la ruta (valor inicial: 400 m; se ajusta probando en rutas reales de Cancún). 

    La salida está dentro de ±15 minutos de la hora deseada. 

    Quedan al menos 1 asiento y el conductor no es el pasajero. 

6. Requisitos no funcionales 

ID 
	

Área 
	

Requisito 

RNF-01 
	

Seguridad 
	

Row Level Security en todas las tablas; cada usuario solo modifica sus propios datos; los viajes son visibles solo para usuarios autenticados. 

RNF-02 
	

Seguridad 
	

Claves de API restringidas por dominio; ningún secreto en el cliente. 

RNF-03 
	

Privacidad 
	

Recolectar lo mínimo: correo, nombre, placa. No mostrar el domicilio exacto del conductor (origen aproximado o punto de encuentro). No rastrear ubicación en segundo plano. 

RNF-04 
	

Privacidad 
	

Aviso de privacidad visible y plantillas de ruta guardadas con origen aproximado. 

RNF-05 
	

Integridad 
	

El descuento de asientos debe ser atómico (función o transacción en base de datos) para evitar sobreventa por aceptaciones simultáneas. 

RNF-06 
	

Rendimiento 
	

Resultados de búsqueda en unos 2 s con decenas de viajes activos; una consulta de ruta por viaje publicado, nunca por renderizado; entradas de búsqueda con debounce. 

RNF-07 
	

Usabilidad 
	

Diseño móvil primero y responsivo; interfaz en español; publicar en menos de 1 minuto; flujo principal en 2 a 3 toques por paso. 

RNF-08 
	

Confiabilidad 
	

Datos de prueba listos para la demostración; video de respaldo; mensajes claros si falla la API de mapas. 

RNF-09 
	

Costo 
	

Capas gratuitas o costo casi nulo; monitorear el uso de la API de mapas. 

RNF-10 
	

Legal y ética 
	

Descargos visibles; el costo se muestra solo como referencia no vinculante; sin manejo de pagos; términos en lenguaje claro. La revisión legal y de seguros es un compromiso de fase 2. 

RNF-11 
	

Mantenibilidad 
	

Repositorio único, 3 a 4 tablas, README con pasos para que cualquier integrante lo ejecute. 

RNF-12 
	

Observabilidad 
	

Registro básico de errores y forma de inspeccionar reservas durante la demostración. 

7. Flujo de trabajo (workflow) 

7.1 Flujo principal 

    Conductor inicia sesión y publica un viaje (o usa "Publicar de nuevo" / "Salgo hoy"). Se guarda la ruta. 

    Pasajero inicia sesión y define punto de recogida, de bajada y hora. 

    El sistema muestra los viajes compatibles con distancia a pie y asientos libres. 

    El pasajero solicita un asiento. La reserva queda en estado solicitada. 

    El conductor ve la solicitud y la acepta o rechaza. 

    Si acepta: la reserva pasa a confirmada, se descuenta un asiento y ambos ven el punto de recogida y la hora. 

    Pasada la hora del viaje, el viaje se cierra y la reserva pasa a completada, lo que suma al contador de impacto. 

7.2 Estados de la reserva 

solicitada --acepta--> confirmada --pasa la hora--> completada 
    |                      | 
    |--rechaza--> rechazada 
    |                      \--cancela--> cancelada (el asiento se libera) 
    \--cancela--> cancelada 

7.3 Estados del viaje 

abierto → lleno (sin asientos) → cerrado (pasó la salida) o cancelado. 

7.4 Casos límite y reglas propuestas 

Caso 
	

Regla 

El conductor cancela con pasajeros confirmados 
	

Las reservas pasan a cancelada y los pasajeros ven un aviso 

El pasajero cancela tras confirmar 
	

El asiento se libera; el viaje se reabre si estaba lleno 

Solicitud pendiente cuando el viaje se llena 
	

Se rechaza automáticamente 

Pasajero solicita dos viajes que se traslapan 
	

Se bloquea la segunda solicitud 

El conductor no responde 
	

La solicitud expira antes de la salida (por ejemplo, 15 min antes) 

Conductor publicó con hora equivocada (clonado) 
	

Resumen de confirmación obligatorio antes de publicar 

Ausencias de pasajeros (no-show) 
	

No se gestionan en el MVP; se contemplan en fase 2 con calificaciones 

8. Arquitectura y modelo de datos 

8.1 Separación de administradores 

El rol admin de tenant.usuarios solo existe después de crear el schema de una institución; por tanto, no puede encargarse del alta de nuevas instituciones. El sistema debe tener un administrador de plataforma autenticado contra una tabla global en public. 

Modelo global recomendado: public.administradores_plataforma (id, correo único, password_hash o auth_user_id, nombre_visible, rol, activo, creado_en). Este usuario administra public.instituciones y public.dominios_permitidos, pero no pertenece a ningún tenant. 

Para controlar reintentos, public.instituciones debe añadir estado_aprovisionamiento (aprovisionando, activo, error), aprovisionado_en y error_aprovisionamiento. 

El rol tenant.admin se conserva para el administrador institucional y solo opera dentro de su propio schema. 

8.2 Alta y aprovisionamiento de una institución 

1. El administrador de plataforma captura nombre, schema_nombre, dominios permitidos y correo del primer administrador institucional. 

2. El backend valida schema_nombre con una lista segura de caracteres, confirma que el nombre y los dominios no estén ocupados e inserta la institución con estado aprovisionando. 

3. Un servicio de aprovisionamiento crea el schema, ejecuta las migraciones de la plantilla tenant y registra los dominios en public.dominios_permitidos. 

4. El servicio crea o invita al primer tenant.usuarios con rol admin y cambia la institución a estado activo. 

5. Si cualquier paso falla, se registra estado error y detalle técnico para reintentar de forma idempotente. No se debe construir SQL con schema_nombre sin validación y quoting de identificadores. 

8.3 Fórmula de impacto 

CO₂ evitado ≈ distancia compartida (km) × factor de emisión (kg CO₂/km, con fuente citada) × pasajeros que de otro modo habrían viajado en otro vehículo. 

Supuesto declarado: cada pasajero habría hecho el trayecto en un vehículo separado o menos eficiente. Es una estimación, no una medición. 

10. Riesgos conocidos 

Riesgo 
	

Mitigación en el MVP 
	

Pendiente 

Masa crítica insuficiente (lección de Waze) 
	

Piloto en un solo grupo; medir H1 a H3 
	

Validar con datos reales 

Incentivo débil del conductor 
	

Mostrar costo de referencia; medir gasto real en la encuesta 
	

Confirmar con datos 

Seguros y regulación de transporte 
	

Sin pagos, costo no vinculante, términos claros 
	

Asesoría legal y de seguros antes de escalar 

Seguridad personal 
	

Solo correo institucional  
	

Verificación de documentos, SOS, calificaciones 

Privacidad (domicilio, ubicación) 
	

Origen aproximado; sin rastreo en segundo plano 
	

Aviso de privacidad formal 

Viajes publicados que no se realizan 
	

Resumen de confirmación; expiración de solicitudes 
	

Recurrencia con confirmación diaria 

Costos de la API de mapas 
	

Una consulta por viaje; debounce 
	

Revisar precios vigentes 

11. Criterios de aceptación del MVP 

    Un usuario con correo no institucional no puede iniciar sesión. 

    Un conductor puede publicar un viaje con ruta en el mapa en menos de un minuto. 

    Un viaje clonado solo requiere elegir fecha y hora. 

    La búsqueda devuelve un viaje solo si recogida y bajada están cerca de la ruta, en el orden correcto y dentro de la ventana de tiempo. 

    Solicitar y aceptar reduce los asientos disponibles; intentar sobrevender falla. 

    El contador de impacto se actualiza tras un viaje completado y muestra la fórmula. 

    El flujo completo corre en dos dispositivos. 

    Existe un video de respaldo de la demostración. 

13. Orden de construcción sugerido 

    Autenticación con filtro de dominio. 

    Publicar viaje con mapa y ruta guardada; listado de viajes. 

    Búsqueda con coincidencia por traslape de ruta. 

    Solicitud y confirmación con descuento atómico de asientos. 

    "Publicar de nuevo" (RF-08). 

    Contador de impacto. 

    Datos de prueba, video de respaldo y pulido. 

    Si sobra tiempo: "Salgo hoy" con plantillas (RF-09). 

 
STACK 

React 

Express - Javascript 

Supabase 

PostgreSQL 

Render (Deploy) 

Google Maps API 

 
 

​​Referencias 

​​No hay ninguna fuente en el documento actual.​​ 

Publicidad de pasajeros 

-targer, espera = win 
youre the fontend engineer for this check db.md to learn what it has, for now, no api calls just mock data ensure the data is in db