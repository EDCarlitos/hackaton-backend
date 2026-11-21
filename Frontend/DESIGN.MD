sign Description — Ride-Sharing Mobile App
The design presents a modern, minimalist mobile application for a community-based ride-sharing platform. Its purpose is to connect passengers with nearby drivers, allow users to discover available rides, publish their own trips, and manage ongoing or completed journeys.

The interface prioritizes simplicity, clarity, and quick access to essential travel information, making the experience easy to navigate without overwhelming the user.
1. Visual identity

Primary accent — Coral red
#F15156


Background — White
#FFFFFF · Clean and spacious layout


Surface — Soft gray
#F5F5F5 · Cards and secondary containers


Typography — Dark charcoal
#1A1A1A · Headings and primary content


- Typography: Modern sans-serif fonts with clear weight differentiation.
- Buttons: Rounded corners, solid coral backgrounds for primary actions.
- Cards: Rounded edges, subtle borders and minimal shadows.
- Icons: Thin, simple line icons to maintain a clean appearance.
- Spacing: Generous whitespace and consistent margins to avoid visual clutter.
The overall aesthetic is lightweight, contemporary, and functional, with the coral accent color highlighting important actions, navigation states, trip statuses, and interactive elements.
## 2. Tokens implementados (`src/index.css`)

| Token | Valor | Uso |
|---|---|---|
| `coral` | `#F15156` | Primario: acción principal y lo que está **en marcha o pendiente** (abierto, en curso, solicitud enviada, solicitudes por responder). Texto **blanco** encima |
| `teal` | `#3C787E` | Terciario: **confirmado / listo** (confirmada, completada, finalizado, viaje lleno), punto de abordaje en el mapa e impacto ambiental. Texto blanco encima |
| `surface` | `#F7F6F5` | Tarjetas secundarias y estados **cerrados** (cancelada, rechazada, expirada) |
| `ink` / `muted` / `line` | `#191716` / `#696461` / `#E9E7E5` | Texto, texto secundario y bordes |

- El tono de un estado sale siempre de `tonoEstado(estado)` (`lib/format.js`): chip, borde izquierdo de la tarjeta y aviso de "qué sigue" usan el mismo.
- Cada detalle empieza con un aviso de **qué sigue** (`.next-step`), para que nadie tenga que adivinar el siguiente paso.
- Las horas se eligen con chips rápidos (`TimeChips`); el selector nativo solo aparece en "Otra hora".
- Las acciones destructivas (cancelar) son un enlace coral discreto al final, no un botón grande.
- Animación: `--ease-out` fuerte, cambios de pantalla de 180 ms, `:active` con `scale(0.96–0.98)` en lo pulsable, y `MotionConfig reducedMotion="user"`.
