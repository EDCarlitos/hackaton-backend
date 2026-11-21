# Genera docs/entidad-relacion.svg (mismo estilo que docs/arquitectura.svg).
import sys
from html import escape
OUT = sys.argv[1]

RH, HH = 24, 40
BOLD = ' font-weight="700" style="fill:#14243a"'
SEMI = ' font-weight="600"'  # alto de fila y de encabezado
T = {}  # nombre -> dict(x,y,w,rows)

def table(name, x, y, w, rows, kind='tenant', note=None):
    T[name] = dict(x=x, y=y, w=w, rows=rows, kind=kind, note=note)

def bottom(n): t = T[n]; return t['y'] + HH + len(t['rows']) * RH
def cx(n): t = T[n]; return t['x'] + t['w'] / 2
def rowy(n, col):
    t = T[n]
    for i, r in enumerate(t['rows']):
        if r[1] == col: return t['y'] + HH + i * RH + RH / 2
    raise KeyError(col)

# ---------- public ----------
table('instituciones', 60, 200, 290, [
    ('PK', 'id', 'int'), ('', 'nombre', 'varchar(150)'), ('UQ', 'schema_nombre', 'varchar(63)'),
    ('', 'activo', 'bool'), ('', 'creado_en', 'timestamptz')], 'public')
table('dominios_permitidos', 60, 450, 290, [
    ('PK', 'id', 'int'), ('FK', 'institucion_id', 'int'), ('UQ', 'dominio', 'citext'),
    ('', 'activo', 'bool'), ('', 'creado_en', 'timestamptz')], 'public')

# ---------- tenant ----------
X0, W, GAP, MID = 450, 270, 50, 520
xs = [X0 + i * (W + GAP) for i in range(5)]
table('usuarios', xs[2] - 15, 150, W + 30, [
    ('PK', 'id', 'int'), ('UQ', 'correo', 'citext'), ('', 'password_hash', 'varchar(255)'),
    ('', 'nombre_visible', 'varchar(100)'), ('', 'rol', 'rol_usuario'), ('', 'acepto_terminos_en', 'timestamptz'),
    ('', 'activo', 'bool'), ('', 'creado_en', 'timestamptz')])
table('trayectos', xs[0], MID, W, [
    ('PK', 'id', 'int'), ('FK', 'conductor_id', 'int'), ('FK', 'vehiculo_id', 'int'), ('', 'nombre', 'varchar(80)'),
    ('', 'origen_lat · lng', 'numeric(9,6)'), ('', 'origen_texto', 'varchar(200)'), ('', 'destino_lat · lng', 'numeric(9,6)'),
    ('', 'destino_texto', 'varchar(200)'), ('', 'polilinea', 'text'), ('', 'distancia_km', 'numeric(6,2)'),
    ('', 'duracion_min', 'int'), ('', 'asientos', 'smallint'), ('', 'hora_habitual', 'time'), ('', 'creado_en', 'timestamptz')])
table('vehiculos', xs[1], MID, W, [
    ('PK', 'id', 'int'), ('FK', 'usuario_id', 'int'), ('', 'placa_o_descripcion', 'varchar(100)'),
    ('', 'asientos', 'smallint 1–4'), ('', 'activo', 'bool')])
table('reservas', xs[2], MID, W, [
    ('PK', 'id', 'int'), ('FK', 'viaje_id', 'int'), ('FK', 'pasajero_id', 'int'), ('', 'recogida_lat · lng', 'numeric(9,6)'),
    ('', 'recogida_texto', 'varchar(200)'), ('', 'bajada_lat · lng', 'numeric(9,6)'), ('', 'distancia_pie_m', 'int'),
    ('', 'estado', 'estado_reserva'), ('', 'solicitada_en', 'timestamptz'), ('', 'respondida_en', 'timestamptz')])
table('mensajes', xs[3], MID, W, [
    ('PK', 'id', 'int'), ('FK', 'viaje_id', 'int'), ('FK', 'autor_id', 'int'), ('', 'texto', 'varchar(500)'),
    ('', 'enviado_en', 'timestamptz')])
table('notificaciones', xs[4], MID, W, [
    ('PK', 'id', 'int'), ('FK', 'usuario_id', 'int'), ('FK', 'viaje_id', 'int'), ('', 'tipo', 'varchar(40)'),
    ('', 'titulo', 'varchar(120)'), ('', 'mensaje', 'varchar(1000)'), ('', 'leida_en', 'timestamptz'), ('', 'creada_en', 'timestamptz')])
mid_bottom = max(bottom(n) for n in ['trayectos', 'vehiculos', 'reservas', 'mensajes', 'notificaciones'])
JY = mid_bottom + 120
table('viajes', xs[2] - 15, JY, W + 30, [
    ('PK', 'id', 'int'), ('FK', 'conductor_id', 'int'), ('FK', 'vehiculo_id', 'int'), ('FK', 'trayecto_id', 'int · null'),
    ('', 'origen_lat · lng', 'numeric(9,6)'), ('', 'origen_texto', 'varchar(200)'), ('', 'destino_lat · lng', 'numeric(9,6)'),
    ('', 'destino_texto', 'varchar(200)'), ('', 'polilinea', 'text'), ('', 'distancia_km', 'numeric(6,2)'),
    ('', 'duracion_min', 'int'), ('', 'salida_en', 'timestamptz'), ('', 'asientos_ofrecidos', 'smallint 1–4'),
    ('', 'asientos_disponibles', 'smallint'), ('', 'costo_referencia', 'numeric(8,2)'), ('', 'estado', 'estado_viaje'),
    ('', 'iniciado_en', 'timestamptz'), ('', 'reservas_cierran_en', 'timestamptz'), ('', 'finalizado_en', 'timestamptz'),
    ('', 'cancelado_en', 'timestamptz'), ('', 'motivo_cancelacion', 'varchar(300)'), ('', 'creado_en', 'timestamptz')])
table('ubicaciones_viaje', xs[3] + 60, JY + 40, W, [
    ('PK FK', 'viaje_id', 'int'), ('', 'lat · lng', 'numeric(9,6)'), ('', 'precision_m', 'int'), ('', 'actualizada_en', 'timestamptz')])

H = bottom('viajes') + 90
Wc = xs[4] + W + 60

# ---------- relaciones (hijo → padre) ----------
# card: 'many' (0..N), 'one' (1), 'zone' (0..1)
rels = []
def rel(pts, start, end, label=None, lpos=None, anchor='middle'):
    rels.append((pts, start, end, label, lpos, anchor))

# dominios → instituciones
rel([(cx('dominios_permitidos'), T['dominios_permitidos']['y']), (cx('instituciones'), bottom('instituciones'))],
    'many', 'one', 'institucion_id', (cx('instituciones') + 10, (bottom('instituciones') + T['dominios_permitidos']['y']) / 2 + 4), 'start')

U = T['usuarios']; Ub = bottom('usuarios')
ua = {'trayectos': U['x'] + 40, 'vehiculos': U['x'] + 95, 'reservas': cx('usuarios'), 'mensajes': U['x'] + U['w'] - 95, 'notificaciones': U['x'] + U['w'] - 40}
lanes_top = {'trayectos': Ub + 40, 'vehiculos': Ub + 80, 'mensajes': Ub + 80, 'notificaciones': Ub + 40}
fk_u = {'trayectos': 'conductor_id', 'vehiculos': 'usuario_id', 'reservas': 'pasajero_id', 'mensajes': 'autor_id', 'notificaciones': 'usuario_id'}
for n, a in ua.items():
    top = T[n]['y']; c = cx(n)
    if n == 'reservas':
        rel([(c, top), (a, Ub)], 'many', 'one', fk_u[n], (c + 8, top - 14), 'start')
    else:
        L = lanes_top[n]
        rel([(c, top), (c, L), (a, L), (a, Ub)], 'many', 'one', fk_u[n], (c + 8, top - 14), 'start')

J = T['viajes']; Jt = J['y']
ja = {'trayectos': J['x'] + 40, 'vehiculos': J['x'] + 95, 'reservas': cx('viajes'), 'mensajes': J['x'] + J['w'] - 95, 'notificaciones': J['x'] + J['w'] - 40}
lanes_bot = {'trayectos': Jt - 30, 'vehiculos': Jt - 65, 'mensajes': Jt - 65, 'notificaciones': Jt - 30}
for n, a in ja.items():
    b = bottom(n); c = cx(n)
    if n in ('trayectos', 'vehiculos'):  # viajes es el hijo
        lab = {'trayectos': 'trayecto_id (opcional)', 'vehiculos': 'vehiculo_id + conductor_id'}[n]
        L = lanes_bot[n]
        rel([(a, Jt), (a, L), (c, L), (c, b)], 'many', 'zone' if n == 'trayectos' else 'one', lab, (c + 8, b + 18), 'start')
    elif n == 'reservas':
        rel([(c, b), (a, Jt)], 'many', 'one', 'viaje_id', (c + 8, b + 18), 'start')
    else:
        L = lanes_bot[n]
        lab = 'viaje_id (opcional)' if n == 'notificaciones' else 'viaje_id'
        rel([(c, b), (c, L), (a, L), (a, Jt)], 'many', 'zone' if n == 'notificaciones' else 'one', lab, (c + 8, b + 18), 'start')

# viajes.conductor_id → usuarios: por fuera, a la izquierda
LX = X0 - 24
uy = U['y'] + HH + 1.5 * RH; jy = J['y'] + HH + 1.5 * RH
rel([(J['x'], jy), (LX, jy), (LX, uy), (U['x'], uy)], 'many', 'one', 'conductor_id', (J['x'] - 30, jy - 8), 'end')
# trayectos.vehiculo_id → vehiculos
ty = rowy('trayectos', 'vehiculo_id')
rel([(T['trayectos']['x'] + W, ty), (T['vehiculos']['x'], ty)], 'many', 'one')
# ubicaciones_viaje → viajes (1 : 0..1)
L_ = T['ubicaciones_viaje']; ly = L_['y'] + HH + RH / 2
rel([(L_['x'], ly), (J['x'] + J['w'], ly)], 'zone', 'one', 'viaje_id', (J['x'] + J['w'] + 10, ly - 8), 'start')

# ---------- SVG ----------
o = []
o.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {Wc} {H}" width="{Wc}" height="{H}" role="img" aria-labelledby="title desc">')
o.append('<title id="title">Modelo entidad-relación</title>')
o.append('<desc id="desc">Schema public con instituciones y dominios permitidos; cada institución tiene su propio schema con usuarios, vehículos, trayectos, viajes, reservas, mensajes, notificaciones y ubicaciones del viaje.</desc>')
o.append('''<defs>
<marker id="many" viewBox="0 0 22 20" refX="22" refY="10" markerWidth="22" markerHeight="20" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
  <path d="M22 2 L12 10 L22 18 M12 10 H22" fill="none" stroke="#54708e" stroke-width="1.6"/>
  <circle cx="6" cy="10" r="4" fill="#fff" stroke="#54708e" stroke-width="1.6"/></marker>
<marker id="one" viewBox="0 0 22 20" refX="22" refY="10" markerWidth="22" markerHeight="20" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
  <path d="M12 3 V17 M17 3 V17" fill="none" stroke="#54708e" stroke-width="1.6"/></marker>
<marker id="zone" viewBox="0 0 22 20" refX="22" refY="10" markerWidth="22" markerHeight="20" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
  <path d="M17 3 V17" fill="none" stroke="#54708e" stroke-width="1.6"/>
  <circle cx="8" cy="10" r="4" fill="#fff" stroke="#54708e" stroke-width="1.6"/></marker>
<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10Z" fill="#54708e"/></marker>
<style>
  text{font-family:Inter,"DejaVu Sans",system-ui,sans-serif;fill:#14243a}
  .subtitle{font-size:17px;fill:#465c73}
  .label{font-size:12px;font-weight:700;letter-spacing:1.4px;fill:#3b5d80}
  .heading{font-size:22px;font-weight:700}
  .tname{font-size:14px;font-weight:700;fill:#fff}
  .col{font-size:12.5px}
  .type{font-size:11.5px;fill:#6b7f94}
  .badge{font-size:9.5px;font-weight:700;letter-spacing:.4px}
  .rel{fill:none;stroke:#54708e;stroke-width:1.6;marker-start:url(#start);}
  .rlabel{font-size:11px;fill:#465c73;paint-order:stroke;stroke:#f4f7fb;stroke-width:4px}
  .note{font-size:12.5px;fill:#465c73}
</style></defs>''')
o.append(f'<rect width="{Wc}" height="{H}" rx="24" fill="#f4f7fb"/>')
o.append('<rect x="32" y="31" width="4" height="52" rx="2" fill="#426889"/>')
o.append('<text x="50" y="52" class="heading">Modelo entidad-relación</text>')
o.append('<text x="50" y="77" class="subtitle">PostgreSQL 16 · un schema por institución (multi-tenant)</text>')

# zonas
o.append(f'<rect x="30" y="120" width="350" height="{H-150}" rx="20" fill="#eaf0f7" stroke="#b9cadc"/>')
o.append('<text x="56" y="156" class="label">SCHEMA PUBLIC · GLOBAL</text>')
zx = X0 - 50
o.append(f'<rect x="{zx}" y="120" width="{Wc-zx-30}" height="{H-150}" rx="20" fill="#eef3f9" stroke="#b9cadc" stroke-dasharray="6 5"/>')
o.append(f'<text x="{zx+26}" y="156" class="label">SCHEMA DE CADA INSTITUCIÓN · ej. ucaribe</text>')
o.append(f'<text x="{zx+26}" y="176" class="note">Las mismas tablas en cada tenant (migraciones de src/db/tenant/)</text>')

# instituciones → schema del tenant
sy = rowy('instituciones', 'schema_nombre')
o.append(f'<path d="M{60+290} {sy} H{zx-2}" fill="none" stroke="#54708e" stroke-width="1.6" stroke-dasharray="5 4" marker-end="url(#arrow)"/>')

# enums y notas en la columna public
ey = bottom('dominios_permitidos') + 50
enums = [('rol_usuario', 'usuario · admin'),
         ('estado_viaje', 'abierto · lleno · en_curso ·', 'finalizado · cancelado'),
         ('estado_reserva', 'solicitada · confirmada · rechazada ·', 'cancelada · completada · expirada')]
eh = 40 + sum(22 + 18 * (len(e) - 1) for e in enums) + 34
o.append(f'<rect x="60" y="{ey}" width="290" height="{eh}" rx="12" fill="#fff" stroke="#c5d4e3" stroke-width="1.3"/>')
o.append(f'<path d="M60 {ey+12} a12 12 0 0 1 12 -12 h266 a12 12 0 0 1 12 12 v28 h-290z" fill="#5b7a99"/>')
o.append(f'<text x="76" y="{ey+26}" class="tname">Tipos y extensiones</text>')
yy = ey + 62
for e in enums:
    o.append(f'<text x="76" y="{yy}" class="col" font-weight="700">{e[0]}</text>'); yy += 18
    for v in e[1:]:
        o.append(f'<text x="86" y="{yy}" class="type">{escape(v)}</text>'); yy += 18
    yy += 4
o.append(f'<text x="76" y="{yy+6}" class="col" font-weight="700">citext</text>')
o.append(f'<text x="128" y="{yy+6}" class="type">correos y dominios sin mayúsculas</text>')

# leyenda
gy = ey + eh + 40
o.append(f'<text x="60" y="{gy}" class="label">LEYENDA</text>')
def leg(y, m, txt):
    o.append(f'<path d="M70 {y} H130" fill="none" stroke="#54708e" stroke-width="1.6" marker-end="url(#{m})"/>')
    o.append(f'<text x="144" y="{y+4}" class="note">{txt}</text>')
leg(gy + 26, 'one', 'exactamente uno')
leg(gy + 54, 'zone', 'cero o uno')
leg(gy + 82, 'many', 'cero o muchos')
o.append(f'<path d="M70 {gy+110} H130" fill="none" stroke="#54708e" stroke-width="1.6" stroke-dasharray="5 4" marker-end="url(#arrow)"/>')
o.append(f'<text x="144" y="{gy+114}" class="note">un schema por institución</text>')
for i, (b, txt, fg, bg) in enumerate([('PK', 'llave primaria', '#9a3d12', '#fde6d8'), ('FK', 'llave foránea', '#2d5a85', '#e1ecf7'), ('UQ', 'única', '#3d6b3a', '#e3f1e1')]):
    y = gy + 140 + i * 26
    o.append(f'<rect x="70" y="{y-11}" width="34" height="16" rx="4" fill="{bg}"/><text x="87" y="{y+1}" class="badge" fill="{fg}" text-anchor="middle">{b}</text>')
    o.append(f'<text x="144" y="{y+1}" class="note">{txt}</text>')

# reglas que garantiza la BD (abajo a la izquierda del tenant)
ny = J['y'] + HH + 1.5 * RH + 70
notes = ['Reglas que garantiza la base de datos',
         '• (vehiculo_id, conductor_id) → vehiculos (id, usuario_id):',
         '   el vehículo del viaje o plantilla es del conductor',
         '• ux_reserva_activa: una sola reserva solicitada o',
         '   confirmada por pasajero y viaje',
         '• trg_reservas_cupo: nunca más confirmadas que',
         '   asientos_ofrecidos',
         '• ubicaciones_viaje: solo la última posición',
         '   (una fila por viaje, sin historial)',
         '• checks de asientos (1–4), coordenadas y estados']
o.append(f'<rect x="{xs[0]}" y="{ny-30}" width="{W+GAP+W-60}" height="{len(notes)*21+28}" rx="12" fill="#fff" stroke="#c5d4e3" stroke-width="1.3"/>')
for i, t in enumerate(notes):
    ind = 30 if t.startswith('   ') else 18
    o.append(f'<text x="{xs[0]+ind}" y="{ny+i*21}" class="note"{BOLD if i == 0 else ""}>{escape(t.strip())}</text>')

# relaciones (debajo de las tablas)
for pts, s, e, lab, lpos, anc in rels:
    d = 'M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in pts)
    o.append(f'<path d="{d}" fill="none" stroke="#54708e" stroke-width="1.6" marker-start="url(#{s})" marker-end="url(#{e})"/>')
for pts, s, e, lab, lpos, anc in rels:
    if lab:
        o.append(f'<text x="{lpos[0]:.1f}" y="{lpos[1]:.1f}" class="rlabel" text-anchor="{anc}">{escape(lab)}</text>')

# tablas
BADGE = {'PK': ('#9a3d12', '#fde6d8'), 'FK': ('#2d5a85', '#e1ecf7'), 'UQ': ('#3d6b3a', '#e3f1e1'), 'PK FK': ('#9a3d12', '#fde6d8')}
for n, t in T.items():
    x, y, w, rows = t['x'], t['y'], t['w'], t['rows']
    h = HH + len(rows) * RH
    head = '#426889' if t['kind'] == 'public' else '#3c787e'
    o.append(f'<g><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="#fff" stroke="#c5d4e3" stroke-width="1.3"/>')
    o.append(f'<path d="M{x} {y+12} a12 12 0 0 1 12 -12 h{w-24} a12 12 0 0 1 12 12 v{HH-12} h-{w}z" fill="{head}"/>')
    o.append(f'<text x="{x+16}" y="{y+26}" class="tname">{n}</text>')
    for i, (k, c, ty) in enumerate(rows):
        ry = y + HH + i * RH
        if i % 2: o.append(f'<rect x="{x+1}" y="{ry}" width="{w-2}" height="{RH}" fill="#f7f9fc"/>')
        if k:
            fg, bg = BADGE[k]; bw = 22 if len(k) == 2 else 40
            o.append(f'<rect x="{x+10}" y="{ry+5}" width="{bw}" height="14" rx="4" fill="{bg}"/>')
            o.append(f'<text x="{x+10+bw/2}" y="{ry+15.5}" class="badge" fill="{fg}" text-anchor="middle">{k}</text>')
        cxo = x + (56 if k == 'PK FK' else 40)
        o.append(f'<text x="{cxo}" y="{ry+16.5}" class="col"{SEMI if k.startswith("PK") else ""}>{escape(c)}</text>')
        o.append(f'<text x="{x+w-12}" y="{ry+16.5}" class="type" text-anchor="end">{escape(ty)}</text>')
    o.append('</g>')

o.append('</svg>')
open(OUT, 'w').write('\n'.join(o))
print(Wc, H)
