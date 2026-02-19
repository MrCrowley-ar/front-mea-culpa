# Mea Culpa DM - Documento de Diseño Funcional

> Documento pensado para el equipo de frontend. Describe QUE hace la aplicacion, COMO funciona el juego,
> y COMO se comunica el front con el back, sin entrar en detalles de implementacion del backend.

---

## 1. Que es Mea Culpa DM

Es una aplicacion web para gestionar **expediciones de dungeon crawling** jugadas via Discord.
Un **Dungeon Master (DM)** usa la web para administrar toda la sesion de juego: crear la expedicion,
agregar jugadores, generar pisos con salas, tirar dados para enemigos y recompensas, repartir loot
y oro, y al final liquidar todo para saber cuanto gano cada jugador.

Los **jugadores** participan via Discord. Solo el DM interactua con la web.

---

## 2. Roles y Autenticacion

### Roles del sistema (multi-rol)

Un usuario puede tener **multiples roles simultaneamente**. Los roles son acumulativos.

| Rol | Quien es | Se puede loguear | Que puede hacer |
|-----|----------|:----------------:|-----------------|
| `player` | Jugador registrado por un DM | No (no tiene password) | Participar en expediciones con sus personajes |
| `dm` | Dungeon Master | Si | Crear/gestionar expediciones, gameplay, agregar jugadores |
| `admin` | Administrador | Si | Todo lo del DM + CRUD items, promover a DM, whitelist |

> **Multi-rol:** Un usuario puede ser `player` + `dm` a la vez. Si un jugador es promovido a DM,
> conserva su rol `player` y se le agrega `dm`. Un admin tambien puede ser `player` + `dm` + `admin`.
> El JWT contiene `roles: string[]` (array, no string singular).

### Flujo de registro (solo DMs)

1. Un ADMIN agrega el `discord_id` del futuro DM a la whitelist (`allowed_discord_ids`)
2. El usuario se registra con su `discord_id`, nombre y password
3. El sistema verifica que el `discord_id` este en la whitelist
4. Si pasa → se crea la cuenta con rol `DM` automaticamente
5. Recibe `access_token` (JWT) y `refresh_token`

**Caso especial - jugador promovido a DM:**
- Si el usuario ya existia como `player` (sin password, agregado por otro DM)
- Y un ADMIN agrego su `discord_id` a la whitelist
- Al registrarse, su cuenta se actualiza: se le asigna password y se le agrega el rol `DM` (conserva `player`)

### Flujo de login

1. El usuario envia `discord_id` + `password`
2. El sistema verifica que el `discord_id` siga en la whitelist
3. Si pasa → verifica password y genera tokens
4. Si el Discord ID fue removido de la whitelist → 403 (no puede loguearse)

> **Para el front:** Solo DMs y ADMINs pueden loguearse. Los players NO tienen password.
> Guardar ambos tokens. Interceptar 401 y hacer refresh automatico.
> El `discord_id` es un string de hasta 32 caracteres (ej: "123456789012345678").

### Flujo de jugadores (players)

1. Un DM o ADMIN agrega un jugador via `POST /api/usuarios/jugadores`
2. Solo se necesita `discord_id` y `nombre` (sin password)
3. El jugador queda registrado con rol `player` y puede ser agregado a expediciones
4. Los jugadores NO se loguean en la web, participan via Discord

### Flujo de promocion (player → DM)

1. Un ADMIN usa `POST /api/usuarios/promover-dm` con el `discord_id` del jugador
2. Esto agrega su ID a la whitelist (`allowed_discord_ids`)
3. El jugador ahora puede registrarse en la web (`POST /auth/register`)
4. Al registrarse, configura su password y se le agrega el rol `DM` (conserva rol `player`)

---

## 3. Concepto del Juego

### La dungeon

La dungeon tiene **20 pisos**. Cada piso pertenece a un **tier** (nivel de dificultad/recompensa):

| Tier | Pisos | Modificador Armas | Modificador Armaduras | Descripcion |
|------|-------|-------------------|-----------------------|-------------|
| 1 | 1-5 | +0 | +0 | Principiante |
| 2 | 6-10 | +1 | +1 | Intermedio |
| 3 | 11-15 | +2 | +2 | Avanzado |
| 4 | 16-20 | +3 | +3 | Experto |

> Los modificadores se aplican automaticamente a las armas/armaduras encontradas.
> Ejemplo: Si en piso 12 (Tier 3) cae una "Espada larga", el sistema la entrega como "Espada larga +2".

### Bonus de recompensa por piso

Cada piso tiene un **bonus que se suma a la tirada de recompensas**. Se reinicia en cada tier:

| Posicion en el tier | Pisos | Bonus |
|---------------------|-------|-------|
| 1er piso | 1, 6, 11, 16 | +0 |
| 2do piso | 2, 7, 12, 17 | +2 |
| 3er piso | 3, 8, 13, 18 | +4 |
| 4to piso | 4, 9, 14, 19 | +6 |
| 5to piso | 5, 10, 15, 20 | +8 |

> Esto hace que las recompensas mejoren a medida que se avanza en cada tier.
> El bonus se suma al d20 de recompensa, NO al de encuentro.

### Salas por piso

Cada piso tiene un numero fijo de **salas comunes** (actualmente 4 para todos los pisos, configurable en la DB).

Ademas, al elegir un piso el DM puede optar por incluir:
- **Sala bonus** (opcional, se elige con un checkbox/toggle)
- **Sala evento** (opcional, se elige con un checkbox/toggle)
- **Sala jefe** (siempre se incluye automaticamente)

Entonces un piso tipico tiene: **4 comunes + [bonus] + [evento] + 1 jefe**

### Tipos de sala

| ID | Nombre | Siempre presente | Descripcion |
|----|--------|------------------|-------------|
| 1 | `comun` | Si (N salas) | Encuentros y recompensas estandar |
| 2 | `bonus` | No (opcional) | Recompensas adicionales |
| 3 | `jefe` | Si (siempre 1) | Usa tabla de items de boss |
| 4 | `evento` | No (opcional) | Evento especial |

---

## 4. Flujo Completo de una Expedicion

### Diagrama de estados

```
[PENDIENTE] → [EN_CURSO] → [COMPLETADA]
     ↓
 [CANCELADA]
```

### Flujo paso a paso

```
1. LOGIN
   └→ El DM se autentica

2. CREAR EXPEDICION (estado: pendiente)
   └→ Se crea con fecha y notas opcionales

3. AGREGAR PARTICIPANTES
   └→ Se agregan los 5 jugadores con su discord_id y nombre de personaje
   └→ Cada uno arranca con oro_acumulado = 0 y activo = true

4. INICIAR EXPEDICION (estado: en_curso)
   └→ Se cambia el estado a "en_curso"

5. POR CADA PISO:
   │
   ├→ 5a. GENERAR LAYOUT DEL PISO
   │   └→ El DM elige el piso (1-20)
   │   └→ Marca checkbox si quiere bonus y/o evento
   │   └→ El sistema genera las salas automaticamente
   │   └→ Retorna la lista de salas con su tipo y orden
   │
   ├→ 5b. POR CADA SALA DEL PISO:
   │   │
   │   ├→ i. RESOLVER ENCUENTRO
   │   │   └→ El DM tira 1d20
   │   │   └→ El sistema dice que enemigos aparecen y cuantos
   │   │   └→ Se guarda la tirada en el historial de la sala
   │   │
   │   ├→ ii. COMBATE (se resuelve fuera de la app, en Discord)
   │   │
   │   ├→ iii. RESOLVER RECOMPENSAS (1d20 por enemigo derrotado)
   │   │   └→ El DM tira 1d20 por cada enemigo
   │   │   └→ El sistema resuelve cada tirada:
   │   │       - "nada": no hay recompensa
   │   │       - "oro": dados de oro a tirar (ej: "2d6")
   │   │       - "subtabla": item encontrado (puede requerir 2da tirada)
   │   │   └→ Retorna lista de items pendientes de asignar + dados de oro
   │   │
   │   ├→ iv. ASIGNAR ITEMS (manual)
   │   │   └→ El DM decide que jugador se queda con cada item
   │   │   └→ Se llama una vez por item, indicando participacion_id
   │   │
   │   ├→ v. REPARTIR ORO (automatico)
   │   │   └→ El DM tira los dados de oro, informa el total
   │   │   └→ El sistema reparte equitativamente entre los ACTIVOS
   │   │   └→ Sobrante: los primeros reciben 1 extra
   │   │
   │   ├→ vi. COMPLETAR SALA
   │   │   └→ Se marca la sala como completada
   │   │
   │   └→ vii. (OPCIONAL) JUGADOR SE VA / ENTRA REEMPLAZO
   │       └→ Si un jugador se va: se desactiva → no recibe mas oro
   │       └→ Si entra reemplazo: se agrega nuevo participante (activo)
   │       └→ El que se fue NO puede volver (pero si un reemplazante)
   │
   └→ (repetir para el siguiente piso si corresponde)

6. VER RESUMEN
   └→ Lista todos los items y oro por personaje

7. LIQUIDAR RECOMPENSAS
   └→ El DM decide que items se venden y a que precio
   └→ El sistema calcula: oro_total = oro_bruto + oro_ventas
   └→ Actualiza oro_acumulado de cada participante

8. COMPLETAR EXPEDICION (estado: completada)
```

---

## 5. Pantallas Sugeridas para el Frontend

### 5.1 Login / Registro

- Formulario de login (discord_id + password) - solo DMs/ADMINs
- Formulario de registro (discord_id, nombre, password) - solo si el ID esta en whitelist
- Guardar tokens en localStorage/sessionStorage
- Mostrar error claro si el Discord ID no esta autorizado (403)
- Despues del login, redirigir segun rol:
  - `dm` → Dashboard de expediciones
  - `admin` → Dashboard de expediciones + acceso a panel de admin

### 5.1b Panel de Administracion (solo ADMIN)

- **Gestion de jugadores:**
  - Lista de todos los jugadores (rol `player`)
  - Boton "Promover a DM" por jugador → agrega a whitelist
- **Whitelist de Discord IDs:**
  - Lista de IDs permitidos con nota
  - Boton "Agregar" y "Eliminar"
- **Gestion de items:**
  - CRUD completo de items (crear, editar, eliminar)
  - Solo visible para ADMIN

### 5.1c Gestion de Jugadores (DM y ADMIN)

- Lista de jugadores registrados
- Formulario "Agregar Jugador" (discord_id + nombre)
- Los jugadores agregados aqui pueden ser seleccionados al crear participaciones en expediciones

### 5.2 Dashboard / Lista de Expediciones

- Tabla con todas las expediciones
- Columnas: ID, fecha, estado, piso_actual, organizador, acciones
- Boton "Nueva Expedicion"
- Filtros por estado (pendiente, en_curso, completada, cancelada)

### 5.3 Detalle de Expedicion

- Info general (fecha, estado, piso_actual, notas)
- Lista de participantes con:
  - Nombre de personaje
  - Estado (activo/inactivo)
  - Oro acumulado
  - Sala de salida (si se fue)
- Botones: "Agregar Participante", "Iniciar Expedicion"
- Si esta en_curso: boton "Generar Piso"

### 5.4 Pantalla de Piso (la mas compleja)

Esta es la pantalla principal de juego. Debe mostrar:

**Barra lateral / header:**
- Piso actual con su info (tier, bonus recompensa)
- Lista de participantes activos

**Area principal - Lista de salas:**
- Cada sala como una card/accordion con:
  - Tipo (comun/bonus/jefe/evento) con icono/color
  - Estado (pendiente/en progreso/completada)
  - Al expandir: detalle del encuentro y recompensas

**Flujo dentro de cada sala:**

```
┌─────────────────────────────────────────────┐
│ Sala 1 - Comun                    [Expandir]│
├─────────────────────────────────────────────┤
│                                             │
│ 1. ENCUENTRO                                │
│    [Input: tirada d20] [Boton: Tirar]       │
│    Resultado: 4 enemigos                    │
│    - Esqueleto (max 2)                      │
│    - Zombie (max 2)                         │
│                                             │
│ 2. RECOMPENSAS (1 tirada por enemigo)       │
│    Enemigo 1: [d20: __] [subtabla: __]      │
│    Enemigo 2: [d20: __] [subtabla: __]      │
│    Enemigo 3: [d20: __] [subtabla: __]      │
│    Enemigo 4: [d20: __] [subtabla: __]      │
│    [Boton: Procesar Recompensas]            │
│                                             │
│ 3. RESULTADOS                               │
│    Items encontrados:                       │
│    - Espada larga → Asignar a: [Dropdown]   │
│    - Escudo roble → Asignar a: [Dropdown]   │
│                                             │
│    Oro: tirar 2d6 → Total: [Input] → [Repa] │
│                                             │
│ [Boton: Completar Sala]                     │
└─────────────────────────────────────────────┘
```

**Nota sobre subtablas:**
- Cuando una tirada de recompensa cae en "subtabla", el sistema puede requerir una SEGUNDA tirada
- El front detecta esto con `requiere_subtabla: true` en la respuesta
- Debe mostrar un segundo input para esa tirada
- Si el DM ya provee ambas tiradas de entrada, se resuelve todo de una

### 5.5 Panel de Participantes (dentro del piso)

- Lista de jugadores activos con foto/avatar Discord
- Boton "Desactivar" por jugador (pide numero de sala de salida)
- Boton "Agregar Reemplazo" (formulario con discord_id + nombre personaje)
- Indicador visual de quienes estan activos

### 5.6 Pantalla de Resumen

- Al final de la expedicion (o consultable en cualquier momento)
- Tabla por participante:
  - Items obtenidos (habitacion, tirada, item, modificador)
  - Oro bruto acumulado
  - Columna "Vender?" con checkbox + precio de venta
  - Oro por ventas
  - Oro total

### 5.7 Pantalla de Liquidacion

- Viene despues del resumen
- El DM marca que items se venden y a que precio
- Boton "Liquidar" que procesa todo
- Resultado: tabla final con oro definitivo por jugador

---

## 6. Modelo de Datos (lo que el front necesita saber)

### Entidades principales y sus campos

#### Usuario
```
discord_id: string (PK, el ID de Discord)
nombre: string
password_hash: string | null (null para players, tiene valor para DMs/ADMINs)
roles: string[] (array de roles: "player", "dm", "admin" - un usuario puede tener varios)
created_at: Date
```

> **Nota:** Los roles se almacenan en tabla separada `usuario_roles` (many-to-many).
> El response de la API devuelve `roles: ["player", "dm"]` como array.
> Los players NO tienen password. Solo DMs y ADMINs pueden loguearse.

#### UsuarioRol (tabla intermedia)
```
id: number (PK, auto)
usuario_id: string (FK → Usuario.discord_id)
rol: "player" | "dm" | "admin"
UNIQUE(usuario_id, rol)
```

#### Personaje (personajes de cada jugador)
```
id: number (PK, auto)
usuario_id: string (FK → Usuario.discord_id)
nombre: string (ej: "Aldric el Guerrero")
created_at: Date
```

> **Nota:** Cada jugador puede tener multiples personajes. Al crear una participacion
> en una expedicion, se elige un personaje_id especifico (no se escribe el nombre a mano).

#### AllowedDiscordId (whitelist de IDs autorizados para registrarse)
```
discord_id: string (PK)
nota: string | null (nota descriptiva, ej: "Jugador principal")
created_at: Date
```

#### Expedicion
```
id: number (PK, auto)
organizador_id: string (FK → Usuario.discord_id)
fecha: Date
estado: "pendiente" | "en_curso" | "completada" | "cancelada"
piso_actual: number (1-20, se actualiza al generar layout)
notas: string | null
created_at: Date
updated_at: Date
```

#### Participacion (un jugador en una expedicion)
```
id: number (PK, auto)
expedicion_id: number (FK → Expedicion)
usuario_id: string (FK → Usuario.discord_id)
personaje_id: number (FK → Personaje.id)
oro_acumulado: number (se actualiza al liquidar)
activo: boolean (true = participa, false = se fue)
sala_salida: number | null (en que sala se fue, null si sigue activo)
created_at: Date
```

> **Constraint:** Un usuario solo puede participar UNA vez por expedicion (unique: expedicion_id + usuario_id)
> **Nota:** Al agregar participante ahora se envia `personaje_id` en vez de `nombre_personaje`.
> El response incluye `nombre_personaje` (extraido de la relacion con Personaje).

#### Piso (precargado en DB, 20 registros)
```
numero: number (PK, 1-20)
tier_id: number (FK → Tier)
bonus_recompensa: number (0, 2, 4, 6, 8)
num_habitaciones_comunes: number (actualmente 4 para todos)
```

#### Tier (precargado en DB, 4 registros)
```
id: number (PK, auto)
numero: number (1-4)
piso_min: number
piso_max: number
mod_armas: number (0, 1, 2, 3)
mod_armaduras: number (0, 1, 2, 3)
```

#### TipoHabitacion (precargado en DB, 4 registros)
```
id: 1 → "comun" (usa_tabla_boss: false)
id: 2 → "bonus" (usa_tabla_boss: false)
id: 3 → "jefe" (usa_tabla_boss: true)
id: 4 → "evento" (usa_tabla_boss: false)
```

#### Item
```
id: number (PK, auto)
nombre: string (ej: "Espada larga")
tipo: "consumible" | "equipo" | "arma" | "armadura" | "material" | "otro"
precio_base: number | null
dados_precio: string | null (ej: "1d6+10")
descripcion: string | null
es_base_modificable: boolean (si aplica mod de tier)
```

#### HistorialHabitacion (cada sala visitada en una expedicion)
```
id: number (PK, auto)
expedicion_id: number (FK → Expedicion)
piso_numero: number
tipo_habitacion_id: number (FK → TipoHabitacion)
orden: number (orden secuencial global en la expedicion)
tirada_encuentro: number | null (el d20 del encuentro)
enemigos_derrotados: number
completada: boolean
notas: string | null
created_at: Date
```

#### HistorialRecompensa (cada item/oro asignado a un jugador)
```
id: number (PK, auto)
historial_habitacion_id: number (FK → HistorialHabitacion)
participacion_id: number (FK → Participacion)
tirada_original: number (el d20 de recompensa)
tirada_subtabla: number | null (la 2da tirada si fue subtabla)
item_id: number | null (FK → Item, null si es solo oro)
modificador_tier: number | null (ej: +2 para arma en tier 3)
oro_obtenido: number (oro bruto asignado)
vendido: boolean (decision de venta)
precio_venta: number | null (precio si se vendio)
created_at: Date
```

---

## 7. Cadena de Resolucion de Recompensas (como funciona internamente)

Esto es lo que pasa cuando el DM tira 1d20 para una recompensa:

```
1. El DM tira 1d20 → resultado: 14

2. Se suma el bonus del piso → 14 + 4 (piso 3) = 18

3. Se busca en tabla_recompensas para piso 3, tipo habitacion comun, tirada 18
   El sistema busca la fila donde 18 esta entre rango_min y rango_max

4. Segun el tipo_resultado de esa fila:

   a) "nada" → No hay recompensa. Listo.

   b) "oro" → Hay oro. La fila tiene dados_oro (ej: "2d6").
      El DM tira esos dados fisicamente y el total se reparte.

   c) "subtabla" → Hay un item. La fila indica subtabla_nombre (ej: "armas").
      Se necesita una 2da tirada (otro d20).
      Con esa tirada se busca en la subtabla correspondiente.

      Si es arma/armadura → se aplica modificador de tier.
      Ejemplo: Tier 3, arma → item_nombre + "+2"

5. El resultado se devuelve al front para que el DM lo asigne.
```

### Subtablas disponibles

| Subtabla | Varia por piso | Varia por habitacion | Aplica mod tier | Tirada subtabla |
|----------|:--------------:|:--------------------:|:--------------:|:---------------:|
| `armas` | No | No | Si (+armas) | Si (d20) |
| `armaduras` | No | No | Si (+armaduras) | Si (d20) |
| `objetos_curiosos` | Si | Si | No | Si (d20) |
| `items_boss` | Si | No | No | Si (d20) |
| `pociones` | Opcional | No | No | Si (d20) |
| `tesoro_menor` | Opcional | No | No | Si (d20) |
| `critico` | Opcional | No | No | Si (d20) |
| `especial` | Si (por tier) | No | No | **No** (al azar) |
| `botin_alternativo` | Si | Si | No | Si (d20) |

### Subtabla `especial` (seleccion al azar)

Algunas entradas de recompensa apuntan a `subtabla_nombre = 'especial'`. Estas NO requieren
una segunda tirada. En vez de eso, el sistema **elige un item al azar** de una lista de opciones
vinculadas a esa entrada.

**Como funciona:**

1. La tirada principal cae en una fila con `subtabla_nombre = 'especial'`
2. El sistema busca en la tabla `opciones_especiales` todas las opciones para esa entrada
3. Elige una al azar
4. Devuelve el **item real** (con `item_id` y `item_nombre`) directamente

**Ejemplo:** Si cae en "Equipo raro 1d4: Pergamino/Mapa/Gemas/Repite", el sistema tiene
3 opciones registradas (Pergamino, Mapa del dungeon, Gemas varias) y elige una al azar.

> **Para el front:** Cuando `subtabla_nombre = 'especial'`, NO se necesita segunda tirada.
> El endpoint devuelve el item directamente. El campo `requiere_subtabla` sera `false`.
> El front puede mostrar el resultado inmediatamente sin pedir tirada adicional.

**Opciones especiales por tier:**

| Tier 1 (Pisos 1-4) | Items posibles |
|---------------------|----------------|
| Tirada 17: Pocion de fortuna | Pocion de fortuna |
| Tirada 18: Saco de raciones | Saco de raciones |
| Tirada 19: Equipo raro | Pergamino viejo / Mapa del dungeon / Gemas varias |
| Tirada 20: Objeto magico menor | Piedra luminosa / Anillo +1 (menor) / Amuleto chispa (menor) |

| Tier 2 (Pisos 5-7) | Items posibles |
|---------------------|----------------|
| Tirada 16: Aleacion Tier 1 | Aleacion Tier 1 |
| Tirada 17: Ventaja dungeon | Mapa del dungeon / Pergamino viejo / Obsidiana Roja |
| Tirada 18: Racion magica grupal | Racion magica grupal |
| Tirada 19: Bomba | Bomba |

### Subtabla `botin_alternativo`

Cuando `subtabla_nombre = 'botin_alternativo'`, el sistema busca en la tabla `objetos_curiosos`
(la misma que usa `objetos_curiosos`). Funciona igual: requiere una segunda tirada (d20)
y devuelve un item de la tabla de objetos curiosos para ese piso y tipo de habitacion.

> **Para el front:** Tratar `botin_alternativo` igual que cualquier otra subtabla que requiere
> segunda tirada. El campo `requiere_subtabla` sera `true` si no se provee la tirada de subtabla.

---

## 8. Encuentros (como funciona internamente)

Cuando el DM entra a una sala y tira 1d20 para enemigos:

```
1. El DM tira 1d20 → resultado: 14

2. Se busca en tabla_encuentros para piso 3, tipo habitacion comun, tirada 14
   La fila que contenga 14 entre rango_min y rango_max

3. Esa fila tiene:
   - cantidad_total: 4 (total de enemigos)
   - enemigos: lista de tipos con max_cantidad cada uno
     Ej: Esqueleto (max 2), Zombie (max 2)

4. El DM distribuye esos 4 enemigos como quiera respetando los maximos.
```

> **Para el front:** Mostrar cantidad_total y la lista de enemigos con sus maximos.
> El DM decide la distribucion exacta en Discord durante el combate.

### Tipos de enemigo

Cada piso tiene sus propios tipos de enemigo. Un tipo_enemigo pertenece a un piso especifico:

```
id: number
nombre: string (ej: "Esqueleto")
piso_id: number (a que piso pertenece)
descripcion: string | null
```

---

## 9. Sistema de Oro

### Como se genera el oro

1. **Oro de recompensas:** Cuando una tirada de recompensa cae en "oro", se indican dados (ej: "2d6").
   El DM tira esos dados fisicamente y reporta el total.

2. **Reparto automatico:** El total de oro se divide equitativamente entre los participantes **activos**.
   Si no es divisible exacto, los primeros reciben 1 extra.

   Ejemplo: 9 de oro entre 5 jugadores → 2, 2, 2, 2, 1

3. **Oro de ventas:** Al final de la expedicion, el DM decide que items se venden.
   El oro de la venta se suma al oro del jugador que tenia ese item.

### Calculo final por jugador

```
oro_total = sum(oro_bruto de todas las salas) + sum(precio_venta de items vendidos)
```

### Jugador que se va

- Cuando un jugador se desactiva, deja de recibir oro desde la **siguiente** sala.
- El oro que ya recibio en salas anteriores lo conserva.
- Sus items tambien los conserva y entran en la liquidacion final.

---

## 10. Endpoints del Backend (resumen para el front)

### Base URL: `http://localhost:3000/api`

### Autenticacion
| Metodo | Ruta | Que hace | Rol requerido |
|--------|------|----------|---------------|
| POST | `/auth/register` | Registrar DM (discord_id debe estar en whitelist) | Publico |
| POST | `/auth/login` | Login (solo DMs/ADMINs con password) | Publico |
| POST | `/auth/refresh` | Renovar token | Publico |

### Usuarios y Jugadores
| Metodo | Ruta | Que hace | Rol requerido |
|--------|------|----------|---------------|
| GET | `/usuarios` | Listar todos los usuarios | DM, ADMIN |
| GET | `/usuarios/jugadores` | Listar solo jugadores (rol player) | DM, ADMIN |
| POST | `/usuarios/jugadores` | Agregar jugador (discord_id + nombre, sin password) | DM, ADMIN |
| GET | `/usuarios/:discordId` | Detalle de un usuario | DM, ADMIN |
| POST | `/usuarios/promover-dm` | Agregar discord_id a whitelist (promover a DM) | ADMIN |
| GET | `/usuarios/allowed` | Listar whitelist de IDs permitidos | ADMIN |
| DELETE | `/usuarios/allowed/:discordId` | Eliminar de whitelist | ADMIN |

### Personajes
| Metodo | Ruta | Que hace | Rol requerido |
|--------|------|----------|---------------|
| GET | `/usuarios/:discordId/personajes` | Listar personajes de un usuario | DM, ADMIN |
| POST | `/usuarios/:discordId/personajes` | Crear personaje para un usuario | DM, ADMIN |
| DELETE | `/usuarios/personajes/:personajeId` | Eliminar personaje | DM, ADMIN |

### Expediciones
| Metodo | Ruta | Que hace |
|--------|------|----------|
| GET | `/expediciones` | Listar todas |
| GET | `/expediciones/:id` | Detalle |
| POST | `/expediciones` | Crear nueva |
| PUT | `/expediciones/:id` | Actualizar (estado, piso, notas) |
| DELETE | `/expediciones/:id` | Eliminar |

### Participaciones
| Metodo | Ruta | Que hace |
|--------|------|----------|
| GET | `/expediciones/:id/participaciones` | Listar jugadores |
| POST | `/expediciones/:id/participaciones` | Agregar jugador |
| DELETE | `/expediciones/participaciones/:id` | Quitar jugador |
| PUT | `/expediciones/participaciones/:id/oro` | Ajustar oro manual |
| PUT | `/expediciones/participaciones/:id/desactivar` | Jugador se va |
| PUT | `/expediciones/participaciones/:id/reactivar` | Revertir salida |

### Gameplay (flujo integrado)
| Metodo | Ruta | Que hace |
|--------|------|----------|
| POST | `/gameplay/generar-layout-piso` | Genera las salas de un piso |
| POST | `/gameplay/resolver-encuentro-habitacion` | Que enemigos hay en una sala |
| POST | `/gameplay/procesar-recompensas-habitacion` | Preview de recompensas (no persiste) |
| POST | `/gameplay/asignar-item` | Asignar item a un jugador |
| POST | `/gameplay/repartir-oro-habitacion` | Repartir oro entre activos |
| POST | `/gameplay/completar-habitacion/:id` | Marcar sala como completada |
| GET | `/gameplay/participantes-activos/:expedId` | Jugadores activos |
| GET | `/gameplay/resumen-expedicion/:expedId` | Resumen total |
| POST | `/gameplay/liquidar-recompensas` | Aplicar ventas y calcular oro final |

### Gameplay (endpoints sueltos, bajo nivel)
| Metodo | Ruta | Que hace |
|--------|------|----------|
| POST | `/gameplay/resolver-encuentro` | Resolver encuentro por piso/tipo/tirada |
| POST | `/gameplay/resolver-recompensa` | Resolver recompensa individual |
| POST | `/gameplay/repartir-oro` | Repartir oro entre IDs especificos |

### Configuracion
| Metodo | Ruta | Que hace | Rol requerido |
|--------|------|----------|---------------|
| GET | `/configuracion/tiers` | Lista tiers | DM, ADMIN |
| GET | `/configuracion/pisos` | Lista pisos con bonus y tier | DM, ADMIN |
| GET | `/configuracion/tipos-habitacion` | Lista tipos de sala | DM, ADMIN |
| GET | `/configuracion/items` | Lista items | DM, ADMIN |
| GET | `/configuracion/items/:id` | Detalle de un item | DM, ADMIN |
| POST | `/configuracion/items` | Crear item | ADMIN |
| PUT | `/configuracion/items/:id` | Actualizar item | ADMIN |
| DELETE | `/configuracion/items/:id` | Eliminar item | ADMIN |

### Historial (bajo nivel, no necesario si se usa el flujo integrado)
| Metodo | Ruta | Que hace |
|--------|------|----------|
| GET | `/historial/expedicion/:expedId` | Todo el historial |
| GET | `/historial/habitaciones/:id` | Detalle de sala |
| GET | `/historial/habitaciones/:habId/recompensas` | Recompensas de una sala |

---

## 11. Respuestas Clave del Backend

### Al generar layout de piso

```json
{
  "expedicion_id": 1,
  "piso": 3,
  "total_habitaciones": 5,
  "habitaciones": [
    { "id": 1, "orden": 1, "tipo_habitacion_id": 1, "tipo_nombre": "comun", "completada": false },
    { "id": 2, "orden": 2, "tipo_habitacion_id": 1, "tipo_nombre": "comun", "completada": false },
    { "id": 3, "orden": 3, "tipo_habitacion_id": 1, "tipo_nombre": "comun", "completada": false },
    { "id": 4, "orden": 4, "tipo_habitacion_id": 2, "tipo_nombre": "bonus", "completada": false },
    { "id": 5, "orden": 5, "tipo_habitacion_id": 3, "tipo_nombre": "jefe", "completada": false }
  ]
}
```

### Al resolver encuentro

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

### Al procesar recompensas (preview)

```json
{
  "historial_habitacion_id": 1,
  "piso": 3,
  "tipo_habitacion_id": 1,
  "resultados": [ ... ],
  "items_pendientes": [
    {
      "indice": 0,
      "tirada_d20": 14,
      "tirada_subtabla": 7,
      "subtabla_nombre": "armas",
      "item_id": 5,
      "item_nombre": "Espada larga",
      "modificador_tier": 0
    }
  ],
  "oro_dados": ["2d6"]
}
```

> `items_pendientes` = items que el DM debe asignar a un jugador (mostrar dropdown)
> `oro_dados` = dados que el DM debe tirar para saber el oro total

### Al repartir oro

```json
{
  "repartos": [
    { "participacion_id": 1, "nombre_personaje": "Aldric", "oro": 2 },
    { "participacion_id": 2, "nombre_personaje": "Lyra", "oro": 2 },
    { "participacion_id": 3, "nombre_personaje": "Theron", "oro": 1 }
  ]
}
```

### Resumen de expedicion

```json
{
  "expedicion_id": 1,
  "estado": "en_curso",
  "piso_actual": 3,
  "total_habitaciones": 5,
  "participantes": [
    {
      "participacion_id": 1,
      "nombre_personaje": "Aldric el Guerrero",
      "usuario_id": "111111111111111111",
      "items": [
        {
          "recompensa_id": 1,
          "habitacion_orden": 1,
          "item_id": 5,
          "item_nombre": "Espada larga",
          "modificador_tier": 0,
          "oro_obtenido": 0,
          "vendido": false,
          "precio_venta": null
        }
      ],
      "total_oro_bruto": 4,
      "total_oro_ventas": 0,
      "total_oro": 4,
      "oro_acumulado_actual": 0
    }
  ],
  "oro_total_expedicion": 12
}
```

---

## 12. Codigos de Error

| Codigo | Significado | Ejemplo |
|--------|-------------|---------|
| 400 | Validacion fallida | Campos requeridos, rangos invalidos |
| 401 | No autenticado | Token JWT invalido o expirado |
| 403 | Sin permiso | Un "player" intentando crear expedicion, Discord ID no autorizado |
| 404 | No encontrado | Piso inexistente, participacion no existe |
| 409 | Conflicto | Layout ya generado para ese piso, Discord ID duplicado |

Formato estandar de error:
```json
{
  "statusCode": 404,
  "message": "Piso 25 no encontrado",
  "error": "Not Found"
}
```

---

## 13. Consideraciones para el Frontend

### Estado global sugerido

```
- usuario: { discord_id, nombre, roles[], tokens }
- expedicionActual: { id, estado, piso_actual, participantes[] }
- pisoActual: { numero, habitaciones[], participantesActivos[] }
- salaActual: { id, tipo, encuentro, recompensas, completada }
```

### Datos que se cargan una vez (cache)

- Tiers (4 registros, nunca cambian)
- Pisos (20 registros, nunca cambian)
- Tipos de habitacion (4 registros, nunca cambian)
- Items (pueden crecer, pero se pueden cachear)

### Polling / refresh

- Participantes activos: consultar antes de cada reparticion de oro
- Estado de expedicion: consultar al volver al detalle

### UX importante

1. **El DM tira dados fisicamente** (en Discord). La app solo recibe el numero resultante.
2. **La asignacion de items es manual.** El DM decide quien se queda con cada item.
3. **El oro se reparte automaticamente** entre los activos. El DM solo informa el total.
4. **procesarRecompensasHabitacion es un PREVIEW.** No guarda nada. El front debe luego:
   - Llamar `asignar-item` por cada item
   - Llamar `repartir-oro-habitacion` con el total de oro tirado
5. **Un jugador que se va no puede volver.** Pero puede entrar un reemplazante como nueva participacion.

---

## 14. Diferenciacion de Vistas por Rol

### Vista DM (rol `dm`)

El DM ve y puede hacer:

| Seccion | Acceso |
|---------|--------|
| Login/Registro | Si |
| Dashboard expediciones | Ver todas, crear, editar, eliminar |
| Gameplay (pisos, salas, encuentros) | Acceso completo |
| Gestion de jugadores | Agregar jugadores (discord_id + nombre) |
| Lista de participantes | Agregar/quitar de expediciones |
| Configuracion (lectura) | Ver tiers, pisos, items, tipos habitacion |
| Configuracion (escritura) | NO puede crear/editar/eliminar items |
| Panel de admin | NO visible |

### Vista ADMIN (rol `admin`)

El ADMIN tiene todo lo del DM mas:

| Seccion | Acceso |
|---------|--------|
| Panel de administracion | Visible y accesible |
| Whitelist de Discord IDs | CRUD completo (agregar/eliminar IDs permitidos) |
| Promover jugador a DM | Agregar discord_id a whitelist |
| CRUD de items | Crear, editar, eliminar items y descripciones |

### Implementacion sugerida en el front

```
1. Al hacer login, guardar `roles[]` del JWT payload
2. Usar los roles para:
   - Mostrar/ocultar el menu de admin → roles.includes('admin')
   - Habilitar/deshabilitar botones de CRUD de items → roles.includes('admin')
   - Mostrar/ocultar el boton "Promover a DM" → roles.includes('admin')
   - Mostrar/ocultar la gestion de whitelist → roles.includes('admin')
3. Rutas protegidas:
   - /admin/* → solo si roles.includes('admin')
   - /expediciones/* → si roles.includes('dm') || roles.includes('admin')
   - /login, /register → publico
```

### Navegacion sugerida

```
DM:
├── /login
├── /dashboard (expediciones)
├── /expediciones/:id (detalle)
├── /expediciones/:id/piso (gameplay)
├── /jugadores (lista + agregar)
└── /configuracion (solo lectura)

ADMIN (agrega a lo del DM):
├── /admin/items (CRUD de items)
├── /admin/whitelist (gestion de IDs permitidos)
└── /admin/promover (promover jugador a DM)
```

### Body de los nuevos endpoints

**POST `/api/usuarios/jugadores`** (DM/ADMIN)
```json
{
  "discord_id": "123456789012345678",
  "nombre": "NombreJugador"
}
```
Respuesta:
```json
{
  "discord_id": "123456789012345678",
  "nombre": "NombreJugador",
  "roles": ["player"],
  "created_at": "2025-01-01T00:00:00.000Z"
}
```

**POST `/api/usuarios/:discordId/personajes`** (DM/ADMIN)
```json
{
  "nombre": "Aldric el Guerrero"
}
```
Respuesta:
```json
{
  "id": 1,
  "usuario_id": "123456789012345678",
  "nombre": "Aldric el Guerrero",
  "created_at": "2025-01-01T00:00:00.000Z"
}
```

**POST `/api/expediciones/:id/participaciones`** (DM/ADMIN)
```json
{
  "usuario_id": "123456789012345678",
  "personaje_id": 1
}
```

**POST `/api/usuarios/promover-dm`** (ADMIN)
```json
{
  "discord_id": "123456789012345678",
  "nota": "Promovido por buen desempeno"
}
```
Respuesta:
```json
{
  "message": "Discord ID 123456789012345678 agregado a la lista de permitidos. El jugador puede registrarse como DM."
}
```

**POST `/api/configuracion/items`** (ADMIN)
```json
{
  "nombre": "Espada de fuego",
  "tipo": "arma",
  "precio_base": 100,
  "descripcion": "Una espada envuelta en llamas",
  "es_base_modificable": true
}
```

**PUT `/api/configuracion/items/:id`** (ADMIN)
```json
{
  "nombre": "Espada de fuego mejorada",
  "descripcion": "Una espada envuelta en llamas azules",
  "precio_base": 150
}
```
