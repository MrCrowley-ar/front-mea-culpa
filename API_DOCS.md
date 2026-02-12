# Mea Culpa DM - Documentación API para Frontend

> Base URL: `http://localhost:3000/api`
> Todas las rutas (excepto Auth) requieren header: `Authorization: Bearer <token>`
> Roles permitidos: `dm` y `admin`

---

## Tabla de Contenidos

1. [Autenticación](#1-autenticación)
2. [Flujo Completo de una Expedición](#2-flujo-completo-de-una-expedición)
3. [Configuración (tablas base)](#3-configuración)
4. [Usuarios](#4-usuarios)
5. [Expediciones y Participaciones](#5-expediciones-y-participaciones)
6. [Encuentros (cargar tablas)](#6-encuentros)
7. [Recompensas (cargar tablas)](#7-recompensas)
8. [Gameplay (resolver tiradas)](#8-gameplay)
9. [Historial](#9-historial)
10. [Enums y Valores](#10-enums-y-valores)

---

## 1. Autenticación

### Registrar usuario

```
POST /api/auth/register
```

```json
{
  "discord_id": "123456789012345678",
  "nombre": "Juan Perez",
  "email": "juan@mail.com",
  "password": "miPassword123"
}
```

**Response 201:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

### Login

```
POST /api/auth/login
```

```json
{
  "email": "juan@mail.com",
  "password": "miPassword123"
}
```

**Response 200:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

### Refresh Token

```
POST /api/auth/refresh
```

```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response 200:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

> **Nota:** A partir de aquí, todos los endpoints requieren el header:
> ```
> Authorization: Bearer <access_token>
> ```

---

## 2. Flujo Completo de una Expedición

Este es el orden en que un DM usaría la API para ejecutar una sesión de juego completa:

### Paso 1: Crear la expedición

```
POST /api/expediciones
```

```json
{
  "fecha": "2026-02-15",
  "notas": "Expedición al piso 3"
}
```

**Response 201:**
```json
{
  "id": 1,
  "organizador_id": "123456789012345678",
  "organizador_nombre": "Juan Perez",
  "fecha": "2026-02-15T00:00:00.000Z",
  "estado": "pendiente",
  "piso_actual": 1,
  "notas": "Expedición al piso 3",
  "created_at": "2026-02-12T15:00:00.000Z",
  "updated_at": "2026-02-12T15:00:00.000Z"
}
```

### Paso 2: Agregar los 5 participantes

```
POST /api/expediciones/1/participaciones
```

Repetir para cada jugador:

```json
{ "usuario_id": "111111111111111111", "nombre_personaje": "Aldric el Guerrero" }
```
```json
{ "usuario_id": "222222222222222222", "nombre_personaje": "Lyra la Maga" }
```
```json
{ "usuario_id": "333333333333333333", "nombre_personaje": "Theron el Pícaro" }
```
```json
{ "usuario_id": "444444444444444444", "nombre_personaje": "Sera la Clériga" }
```
```json
{ "usuario_id": "555555555555555555", "nombre_personaje": "Kael el Ranger" }
```

**Response 201 (cada uno):**
```json
{
  "id": 1,
  "expedicion_id": 1,
  "usuario_id": "111111111111111111",
  "usuario_nombre": "Player1",
  "nombre_personaje": "Aldric el Guerrero",
  "oro_acumulado": 0,
  "created_at": "2026-02-12T15:01:00.000Z"
}
```

### Paso 3: Elegir piso y arrancar la expedición

```
PUT /api/expediciones/1
```

```json
{
  "estado": "en_curso",
  "piso_actual": 3
}
```

### Paso 4: Entrar a una habitación - Resolver encuentro de enemigos

El DM tira 1d20 y usa el resultado para consultar qué enemigos aparecen:

```
POST /api/gameplay/resolver-encuentro
```

```json
{
  "piso": 3,
  "tipo_habitacion_id": 1,
  "tirada": 14
}
```

**Response 200:**
```json
{
  "piso": 3,
  "tipo_habitacion_id": 1,
  "tirada": 14,
  "cantidad_total": 4,
  "enemigos": [
    { "nombre": "Esqueleto", "max_cantidad": 2 },
    { "nombre": "Zombie", "max_cantidad": 2 }
  ]
}
```

> El DM sabe que puede colocar hasta 4 enemigos totales: máximo 2 Esqueletos y máximo 2 Zombies.

### Paso 5: Registrar la habitación en el historial

```
POST /api/historial/habitaciones
```

```json
{
  "expedicion_id": 1,
  "piso_numero": 3,
  "tipo_habitacion_id": 1,
  "orden": 1,
  "tirada_encuentro": 14,
  "enemigos_derrotados": 4,
  "completada": true,
  "notas": "2 Esqueletos + 2 Zombies derrotados"
}
```

**Response 201:**
```json
{
  "id": 1,
  "expedicion_id": 1,
  "piso_numero": 3,
  "tipo_habitacion_id": 1,
  "tipo_habitacion_nombre": "comun",
  "orden": 1,
  "tirada_encuentro": 14,
  "enemigos_derrotados": 4,
  "completada": true,
  "notas": "2 Esqueletos + 2 Zombies derrotados",
  "created_at": "2026-02-12T15:10:00.000Z",
  "recompensas": []
}
```

### Paso 6: Dar recompensas a cada participante

El DM tira 1d20 para cada jugador. Ejemplo para Aldric (tirada = 14):

```
POST /api/gameplay/resolver-recompensa
```

```json
{
  "piso": 3,
  "tipo_habitacion_id": 1,
  "tirada_d20": 14
}
```

**Response 200 (ejemplo: resultado "oro"):**
```json
{
  "piso": 3,
  "tipo_habitacion_id": 1,
  "tirada_original": 14,
  "bonus_recompensa": 4,
  "tirada_con_bonus": 18,
  "tipo_resultado": "oro",
  "dados_oro": "2d6",
  "descripcion": "Bolsa de monedas",
  "requiere_subtabla": false
}
```

> El piso 3 tiene bonus +4, así que 14 + 4 = 18. Esa tirada cayó en el rango de "oro". El DM tira 2d6 para determinar cuánto oro.

**Response 200 (ejemplo: resultado "nada", tirada baja):**
```json
{
  "piso": 3,
  "tipo_habitacion_id": 1,
  "tirada_original": 2,
  "bonus_recompensa": 4,
  "tirada_con_bonus": 6,
  "tipo_resultado": "nada",
  "descripcion": "No hay recompensa",
  "requiere_subtabla": false
}
```

**Response 200 (ejemplo: resultado "subtabla" - requiere segunda tirada):**
```json
{
  "piso": 3,
  "tipo_habitacion_id": 1,
  "tirada_original": 16,
  "bonus_recompensa": 4,
  "tirada_con_bonus": 20,
  "tipo_resultado": "subtabla",
  "subtabla_nombre": "armas",
  "descripcion": "Arma encontrada",
  "requiere_subtabla": true
}
```

> La API indica que toca ir a la tabla de armas. El DM tira otro d20 y vuelve a llamar con `tirada_subtabla`:

### Paso 7: Resolver subtabla (segunda tirada)

```
POST /api/gameplay/resolver-recompensa
```

```json
{
  "piso": 3,
  "tipo_habitacion_id": 1,
  "tirada_d20": 16,
  "tirada_subtabla": 7
}
```

**Response 200:**
```json
{
  "piso": 3,
  "tipo_habitacion_id": 1,
  "tirada_original": 16,
  "bonus_recompensa": 4,
  "tirada_con_bonus": 20,
  "tipo_resultado": "subtabla",
  "subtabla_nombre": "armas",
  "tirada_subtabla": 7,
  "requiere_subtabla": false,
  "item_nombre": "Espada larga",
  "item_id": 5,
  "modificador_tier": 0,
  "descripcion": "Arma encontrada"
}
```

> Piso 3 es Tier 1 → mod_armas = +0. Si fuera piso 8 (Tier 2), sería "Espada larga +1".

**Ejemplo en Tier 3 (piso 12, mod_armas = +2):**
```json
{
  "piso": 12,
  "tipo_habitacion_id": 1,
  "tirada_original": 16,
  "bonus_recompensa": 2,
  "tirada_con_bonus": 18,
  "tipo_resultado": "subtabla",
  "subtabla_nombre": "armas",
  "tirada_subtabla": 7,
  "requiere_subtabla": false,
  "item_nombre": "Espada larga",
  "item_id": 5,
  "modificador_tier": 2,
  "item_con_modificador": "Espada larga +2"
}
```

### Paso 8: Guardar la recompensa en el historial

```
POST /api/historial/recompensas
```

```json
{
  "historial_habitacion_id": 1,
  "participacion_id": 1,
  "tirada_original": 16,
  "tirada_subtabla": 7,
  "item_id": 5,
  "modificador_tier": 0,
  "oro_obtenido": 0,
  "vendido": false
}
```

**Response 201:**
```json
{
  "id": 1,
  "historial_habitacion_id": 1,
  "participacion_id": 1,
  "participacion_personaje": "Aldric el Guerrero",
  "tirada_original": 16,
  "tirada_subtabla": 7,
  "item_id": 5,
  "item_nombre": "Espada larga",
  "modificador_tier": 0,
  "oro_obtenido": 0,
  "vendido": false,
  "precio_venta": null,
  "created_at": "2026-02-12T15:12:00.000Z"
}
```

### Paso 9: Si el personaje vende el item

```
PUT /api/historial/recompensas/1
```

```json
{
  "vendido": true,
  "precio_venta": 25
}
```

### Paso 10: Actualizar oro del participante

```
PUT /api/expediciones/participaciones/1/oro
```

> **Nota:** Este endpoint no existe aún en los controllers actuales. El oro se maneja directamente desde el servicio. Para el front, se puede consultar las participaciones y ver el oro_acumulado.

### Paso 11: Completar la expedición

```
PUT /api/expediciones/1
```

```json
{
  "estado": "completada"
}
```

---

## 3. Configuración

### Tiers

```
GET /api/configuracion/tiers
```

**Response 200:**
```json
[
  { "id": 1, "numero": 1, "piso_min": 1, "piso_max": 5, "mod_armas": 0, "mod_armaduras": 0, "descripcion": null },
  { "id": 2, "numero": 2, "piso_min": 6, "piso_max": 10, "mod_armas": 1, "mod_armaduras": 1, "descripcion": null },
  { "id": 3, "numero": 3, "piso_min": 11, "piso_max": 15, "mod_armas": 2, "mod_armaduras": 2, "descripcion": null },
  { "id": 4, "numero": 4, "piso_min": 16, "piso_max": 20, "mod_armas": 3, "mod_armaduras": 3, "descripcion": null }
]
```

```
GET /api/configuracion/tiers/:id
```

### Pisos

```
GET /api/configuracion/pisos
```

**Response 200:**
```json
[
  { "numero": 1, "tier_id": 1, "tier_numero": 1, "bonus_recompensa": 0, "num_habitaciones_comunes": 3 },
  { "numero": 2, "tier_id": 1, "tier_numero": 1, "bonus_recompensa": 2, "num_habitaciones_comunes": 3 },
  { "numero": 3, "tier_id": 1, "tier_numero": 1, "bonus_recompensa": 4, "num_habitaciones_comunes": 3 },
  { "numero": 4, "tier_id": 1, "tier_numero": 1, "bonus_recompensa": 6, "num_habitaciones_comunes": 3 },
  { "numero": 5, "tier_id": 1, "tier_numero": 1, "bonus_recompensa": 8, "num_habitaciones_comunes": 3 },
  { "numero": 6, "tier_id": 2, "tier_numero": 2, "bonus_recompensa": 0, "num_habitaciones_comunes": 3 }
]
```

> Patrón bonus: 0, 2, 4, 6, 8 — se reinicia en cada tier.

```
GET /api/configuracion/pisos/:numero
```

### Tipos de Habitación

```
GET /api/configuracion/tipos-habitacion
```

**Response 200:**
```json
[
  { "id": 1, "nombre": "comun", "usa_tabla_boss": false, "descripcion": "Habitación común" },
  { "id": 2, "nombre": "bonus", "usa_tabla_boss": false, "descripcion": "Habitación bonus" },
  { "id": 3, "nombre": "jefe", "usa_tabla_boss": true, "descripcion": "Habitación del jefe" },
  { "id": 4, "nombre": "evento", "usa_tabla_boss": false, "descripcion": "Evento especial" }
]
```

```
GET /api/configuracion/tipos-habitacion/:id
```

### Items (CRUD)

```
GET /api/configuracion/items
GET /api/configuracion/items/:id
```

```
POST /api/configuracion/items
```

```json
{
  "nombre": "Espada larga",
  "tipo": "arma",
  "precio_base": 15,
  "dados_precio": "1d6+10",
  "es_base_modificable": true
}
```

```
PUT /api/configuracion/items/:id
```

```json
{
  "precio_base": 20
}
```

```
DELETE /api/configuracion/items/:id
```

---

## 4. Usuarios

```
GET /api/usuarios
```

**Response 200:**
```json
[
  {
    "discord_id": "123456789012345678",
    "nombre": "Juan Perez",
    "email": "juan@mail.com",
    "rol": "dm",
    "created_at": "2026-02-12T14:00:00.000Z"
  }
]
```

```
GET /api/usuarios/:discordId
```

---

## 5. Expediciones y Participaciones

### CRUD Expediciones

```
GET    /api/expediciones            → Lista todas
GET    /api/expediciones/:id        → Detalle
POST   /api/expediciones            → Crear
PUT    /api/expediciones/:id        → Actualizar
DELETE /api/expediciones/:id        → Eliminar
```

**Crear:**
```json
{
  "fecha": "2026-02-15",
  "notas": "Opcional"
}
```

**Actualizar:**
```json
{
  "estado": "en_curso",
  "piso_actual": 5,
  "notas": "Cambiando de piso"
}
```

> `estado` valores posibles: `pendiente`, `en_curso`, `completada`, `cancelada`

### Participaciones

```
GET    /api/expediciones/:id/participaciones              → Listar participantes
POST   /api/expediciones/:id/participaciones              → Agregar participante
DELETE /api/expediciones/participaciones/:participacionId  → Quitar participante
```

**Agregar:**
```json
{
  "usuario_id": "123456789012345678",
  "nombre_personaje": "Aldric el Guerrero"
}
```

---

## 6. Encuentros

### Tipos de Enemigo

```
GET    /api/encuentros/tipos-enemigo                    → Todos
GET    /api/encuentros/tipos-enemigo/:id                → Por ID
GET    /api/encuentros/tipos-enemigo/piso/:pisoNumero   → Por piso
POST   /api/encuentros/tipos-enemigo                    → Crear
PUT    /api/encuentros/tipos-enemigo/:id                → Actualizar
DELETE /api/encuentros/tipos-enemigo/:id                → Eliminar
```

**Crear tipo enemigo:**
```json
{
  "nombre": "Esqueleto",
  "piso_id": 3,
  "descripcion": "Enemigo no-muerto básico"
}
```

### Tabla de Encuentros

```
GET    /api/encuentros/tabla                                                   → Todas las entradas
GET    /api/encuentros/tabla/:id                                               → Por ID
GET    /api/encuentros/tabla/tirada/:pisoNumero/:tipoHabitacionId/:tirada      → Buscar por tirada
POST   /api/encuentros/tabla                                                   → Crear entrada
DELETE /api/encuentros/tabla/:id                                               → Eliminar
```

**Crear entrada en tabla encuentros:**
```json
{
  "piso_numero": 3,
  "tipo_habitacion_id": 1,
  "rango_min": 11,
  "rango_max": 15,
  "cantidad_total": 4
}
```

> Esto significa: en piso 3, habitación común, si la tirada cae entre 11-15, aparecen 4 enemigos.

### Asignar enemigos a una entrada de la tabla

```
POST   /api/encuentros/tabla/:tablaEncuentroId/enemigos   → Agregar enemigo
GET    /api/encuentros/tabla/:tablaEncuentroId/enemigos    → Ver enemigos
DELETE /api/encuentros/enemigos/:id                        → Quitar enemigo
```

**Agregar enemigo a entrada:**
```json
{
  "tabla_encuentro_id": 1,
  "tipo_enemigo_id": 1,
  "max_cantidad": 2
}
```

> La suma de max_cantidad de todos los enemigos debería coincidir con cantidad_total.

---

## 7. Recompensas

### Tabla Principal de Recompensas

```
GET    /api/recompensas/tabla       → Todas
POST   /api/recompensas/tabla       → Crear
PUT    /api/recompensas/tabla/:id   → Actualizar
DELETE /api/recompensas/tabla/:id   → Eliminar
```

**Crear entrada (resultado "nada"):**
```json
{
  "piso_numero": 3,
  "tipo_habitacion_id": 1,
  "rango_min": 1,
  "rango_max": 6,
  "tipo_resultado": "nada",
  "descripcion": "No se encuentra nada"
}
```

**Crear entrada (resultado "oro"):**
```json
{
  "piso_numero": 3,
  "tipo_habitacion_id": 1,
  "rango_min": 7,
  "rango_max": 12,
  "tipo_resultado": "oro",
  "dados_oro": "2d6",
  "descripcion": "Bolsa de monedas"
}
```

**Crear entrada (resultado "subtabla" → armas):**
```json
{
  "piso_numero": 3,
  "tipo_habitacion_id": 1,
  "rango_min": 18,
  "rango_max": 19,
  "tipo_resultado": "subtabla",
  "subtabla_nombre": "armas",
  "descripcion": "Arma encontrada"
}
```

> `tipo_resultado` valores: `nada`, `oro`, `subtabla`
>
> `subtabla_nombre` valores posibles: `armas`, `armaduras`, `objetos_curiosos`, `items_boss`, `pociones`, `tesoro_menor`, `critico`

### Subtabla: Armas

```
GET    /api/recompensas/armas       → Todas
POST   /api/recompensas/armas       → Crear
DELETE /api/recompensas/armas/:id   → Eliminar
```

```json
{ "tirada": 7, "item_id": 5 }
```

> Una sola tabla global. El modificador de tier se aplica automáticamente en gameplay.

### Subtabla: Armaduras

```
GET    /api/recompensas/armaduras       → Todas
POST   /api/recompensas/armaduras       → Crear
DELETE /api/recompensas/armaduras/:id   → Eliminar
```

```json
{ "tirada": 3, "item_id": 10 }
```

### Subtabla: Objetos Curiosos

```
GET    /api/recompensas/objetos-curiosos       → Todos
POST   /api/recompensas/objetos-curiosos       → Crear
DELETE /api/recompensas/objetos-curiosos/:id   → Eliminar
```

```json
{
  "piso_numero": 3,
  "tipo_habitacion_id": 1,
  "tirada": 5,
  "item_id": 20
}
```

> Varía por piso Y habitación.

### Subtabla: Items de Boss

```
GET    /api/recompensas/items-boss       → Todos
POST   /api/recompensas/items-boss       → Crear
DELETE /api/recompensas/items-boss/:id   → Eliminar
```

```json
{
  "piso_numero": 3,
  "tirada": 12,
  "item_id": 30
}
```

> Varía por piso solamente.

### Subtabla: Pociones

```
GET    /api/recompensas/pociones       → Todas
POST   /api/recompensas/pociones       → Crear
DELETE /api/recompensas/pociones/:id   → Eliminar
```

```json
{
  "piso_numero": 3,
  "tirada": 8,
  "item_id": 15
}
```

> `piso_numero` es opcional. Si no se indica, la poción aplica a todos los pisos.

### Subtabla: Tesoro Menor

```
GET    /api/recompensas/tesoro-menor       → Todos
POST   /api/recompensas/tesoro-menor       → Crear
DELETE /api/recompensas/tesoro-menor/:id   → Eliminar
```

```json
{
  "tirada": 4,
  "item_id": 25,
  "efecto_especial": "Brilla en la oscuridad"
}
```

> `item_id` y `efecto_especial` son opcionales. Puede tener solo efecto sin item.

### Subtabla: Crítico

```
GET    /api/recompensas/critico       → Todos
POST   /api/recompensas/critico       → Crear
DELETE /api/recompensas/critico/:id   → Eliminar
```

```json
{
  "tirada": 20,
  "item_id": 50,
  "piso_numero": 3
}
```

---

## 8. Gameplay (Endpoints Inteligentes)

### Resolver Encuentro

Dado un piso, tipo de habitación y el resultado de 1d20, retorna qué enemigos aparecen.

```
POST /api/gameplay/resolver-encuentro
```

```json
{
  "piso": 3,
  "tipo_habitacion_id": 1,
  "tirada": 14
}
```

**Response 200:**
```json
{
  "piso": 3,
  "tipo_habitacion_id": 1,
  "tirada": 14,
  "cantidad_total": 4,
  "enemigos": [
    { "nombre": "Esqueleto", "max_cantidad": 2 },
    { "nombre": "Zombie", "max_cantidad": 2 }
  ]
}
```

### Resolver Recompensa

Resuelve toda la cadena de recompensa automáticamente.

#### Caso 1: Solo tirada principal (sin saber si necesita subtabla)

```
POST /api/gameplay/resolver-recompensa
```

```json
{
  "piso": 3,
  "tipo_habitacion_id": 1,
  "tirada_d20": 14
}
```

Si cae en "nada" o "oro", devuelve el resultado final directamente.

Si cae en "subtabla", devuelve `requiere_subtabla: true`:

```json
{
  "piso": 3,
  "tipo_habitacion_id": 1,
  "tirada_original": 14,
  "bonus_recompensa": 4,
  "tirada_con_bonus": 18,
  "tipo_resultado": "subtabla",
  "subtabla_nombre": "armas",
  "descripcion": "Arma encontrada",
  "requiere_subtabla": true
}
```

#### Caso 2: Con ambas tiradas (resuelve todo de una)

```json
{
  "piso": 3,
  "tipo_habitacion_id": 1,
  "tirada_d20": 14,
  "tirada_subtabla": 7
}
```

**Response 200:**
```json
{
  "piso": 3,
  "tipo_habitacion_id": 1,
  "tirada_original": 14,
  "bonus_recompensa": 4,
  "tirada_con_bonus": 18,
  "tipo_resultado": "subtabla",
  "subtabla_nombre": "armas",
  "tirada_subtabla": 7,
  "requiere_subtabla": false,
  "item_nombre": "Espada larga",
  "item_id": 5,
  "modificador_tier": 0,
  "descripcion": "Arma encontrada"
}
```

> Si `tirada_subtabla` viene vacío y se necesita subtabla, la API responde con `requiere_subtabla: true` para que el front pida al DM que tire de nuevo.

---

## 9. Historial

### Habitaciones visitadas

```
GET    /api/historial/expedicion/:expedicionId    → Historial completo de una expedición
GET    /api/historial/habitaciones/:id            → Detalle de una habitación
POST   /api/historial/habitaciones                → Registrar habitación
PUT    /api/historial/habitaciones/:id            → Actualizar
DELETE /api/historial/habitaciones/:id            → Eliminar
```

**Registrar habitación:**
```json
{
  "expedicion_id": 1,
  "piso_numero": 3,
  "tipo_habitacion_id": 1,
  "orden": 1,
  "tirada_encuentro": 14,
  "enemigos_derrotados": 4,
  "completada": true,
  "notas": "2 Esqueletos + 2 Zombies"
}
```

### Recompensas por habitación

```
GET    /api/historial/habitaciones/:habitacionId/recompensas   → Recompensas de una habitación
GET    /api/historial/recompensas/:id                          → Detalle de una recompensa
POST   /api/historial/recompensas                              → Registrar recompensa
PUT    /api/historial/recompensas/:id                          → Actualizar (ej: marcar vendido)
DELETE /api/historial/recompensas/:id                          → Eliminar
```

**Registrar recompensa:**
```json
{
  "historial_habitacion_id": 1,
  "participacion_id": 1,
  "tirada_original": 16,
  "tirada_subtabla": 7,
  "item_id": 5,
  "modificador_tier": 0,
  "oro_obtenido": 0,
  "vendido": false
}
```

**Marcar como vendido:**
```json
{
  "vendido": true,
  "precio_venta": 25
}
```

---

## 10. Enums y Valores

### EstadoExpedicion
| Valor | Descripción |
|-------|-------------|
| `pendiente` | Expedición creada, no iniciada |
| `en_curso` | Expedición en progreso |
| `completada` | Expedición finalizada |
| `cancelada` | Expedición cancelada |

### TipoItem
| Valor | Descripción |
|-------|-------------|
| `consumible` | Item de un solo uso |
| `equipo` | Equipamiento general |
| `arma` | Arma |
| `armadura` | Armadura |
| `material` | Material de crafting |
| `otro` | Otro tipo |

### TipoResultadoRecompensa
| Valor | Descripción |
|-------|-------------|
| `nada` | Sin recompensa |
| `oro` | Monedas (tirar dados_oro) |
| `subtabla` | Ir a una subtabla |

### RolUsuario
| Valor | Descripción |
|-------|-------------|
| `player` | Jugador (sin acceso a gestión) |
| `dm` | Dungeon Master (acceso completo) |
| `admin` | Administrador (acceso completo) |

### Subtablas disponibles
| Nombre | Varía por piso | Varía por habitación | Aplica mod tier |
|--------|:--------------:|:--------------------:|:--------------:|
| `armas` | No | No | Si (+armas) |
| `armaduras` | No | No | Si (+armaduras) |
| `objetos_curiosos` | Si | Si | No |
| `items_boss` | Si | No | No |
| `pociones` | Opcional | No | No |
| `tesoro_menor` | Opcional | No | No |
| `critico` | Opcional | No | No |

### Bonus de recompensa por piso
| Piso | Tier | Bonus |
|------|------|-------|
| 1, 6, 11, 16 | 1/2/3/4 | +0 |
| 2, 7, 12, 17 | 1/2/3/4 | +2 |
| 3, 8, 13, 18 | 1/2/3/4 | +4 |
| 4, 9, 14, 19 | 1/2/3/4 | +6 |
| 5, 10, 15, 20 | 1/2/3/4 | +8 |

### Modificadores de tier
| Tier | Pisos | Mod Armas | Mod Armaduras |
|------|-------|-----------|---------------|
| 1 | 1-5 | +0 | +0 |
| 2 | 6-10 | +1 | +1 |
| 3 | 11-15 | +2 | +2 |
| 4 | 16-20 | +3 | +3 |

---

## Manejo de Errores

Todos los errores siguen el formato estándar de NestJS:

```json
{
  "statusCode": 404,
  "message": "Piso 25 no encontrado",
  "error": "Not Found"
}
```

| Código | Cuándo |
|--------|--------|
| 400 | Validación de DTO fallida (campos requeridos, rangos) |
| 401 | Token JWT inválido o expirado |
| 403 | Rol insuficiente (player intentando acceder a DM endpoints) |
| 404 | Recurso no encontrado (piso, item, encuentro, etc.) |
| 409 | Conflicto (email duplicado, participación duplicada) |
