# API de Odd Loop

Todas las rutas empiezan con `/api`. Entradas y salidas en JSON. Este archivo se actualiza con cada etapa.

## Salud

### `GET /api/health`

Comprueba que el backend responde y que puede consultar la base de datos. No requiere sesión.

| Caso | Código | Respuesta |
| --- | --- | --- |
| Backend y base de datos funcionan | 200 | `{ "status": "ok", "db": "up" }` |
| No hay conexión con la base de datos | 503 | `{ "status": "error", "db": "down" }` |

## Errores

Todo error responde `{ "error": { "code": "...", "message": "..." } }`. El `code` es estable (el frontend lo traduce); el `message` es solo para depurar.

| Código HTTP | `code` | Cuándo |
| --- | --- | --- |
| 400 | `invalid_input` | El cuerpo no cumple el formato esperado |
| 400 | `invalid_password` | Contraseña vacía (o de más de 1024 caracteres) |
| 400 | `wrong_password` | La contraseña actual no coincide |
| 400 | `same_password` | La nueva contraseña es igual a la actual |
| 401 | `unauthenticated` | No hay sesión válida |
| 401 | `invalid_credentials` | Correo o contraseña incorrectos, o cuenta desactivada (el mensaje es el mismo a propósito) |
| 403 | `forbidden` | Tu rol no permite esta acción |
| 403 | `password_change_required` | Tienes una contraseña temporal: cámbiala antes de usar la app |
| 404 | `not_found` | El usuario no existe |
| 409 | `email_taken` | Ya hay una cuenta con ese correo |
| 400 | `invalid_project_key` | La clave del proyecto no son 2 a 5 letras |
| 400 | `invalid_member` / `invalid_mention` | Usuario desconocido, desactivado, o mencionado sin ser miembro del proyecto |
| 400 | `state_not_found` / `label_not_found` / `parent_invalid` / `link_invalid` | Estado, etiqueta, tarea padre o enlace que no pertenece al proyecto o no es válido |
| 404 | `project_not_found` | El proyecto no existe **o no puedes verlo** (RN-11: no se revela su existencia) |
| 404 | `task_not_found` / `attachment_not_found` / `link_not_found` | No existe |
| 409 | `project_key_taken` / `state_name_taken` / `label_taken` / `link_exists` | Ya existe |
| 409 | `project_archived` | El proyecto está archivado: solo lectura |
| 409 | `state_in_use` / `last_state` | No se puede borrar un estado con tareas ni el último estado |
| 409 | `version_conflict` | RN-13: alguien guardó la tarea antes que tú. Recarga y vuelve a intentar |
| 413 | `file_too_large` | El adjunto pesa más de 10 MB |
| 409 | `last_admin` | RN-10: no se puede desactivar ni degradar al último administrador activo |

## Sesión

La sesión va en la cookie `oddloop_session` (`HttpOnly`, `SameSite=Lax`, 7 días, sin `Secure` porque la app corre por `http` en la red local). Solo se guarda el hash SHA-256 del token. Todas las rutas siguientes, salvo el login, requieren esa cookie.

Mientras `mustChangePassword` sea `true`, solo responden `GET /api/me`, `POST /api/me/password` y `POST /api/auth/logout`; el resto da `403 password_change_required`.

Un usuario tiene esta forma (nunca incluye el hash): `{ id, email, name, role, active, mustChangePassword, soundEnabled }`, con `role` igual a `admin`, `leader` o `member`.

### `POST /api/auth/login`
Entrada: `{ "email", "password" }`. Salida 200: `{ "user" }` y la cookie de sesión.

### `POST /api/auth/logout`
Salida 204. Cierra la sesión actual y borra la cookie.

### `GET /api/me`
Salida 200: `{ "user" }`.

### `PATCH /api/me`
Entrada (todo opcional): `{ "name", "soundEnabled" }`. Salida 200: `{ "user" }`.

### `POST /api/me/password`
Entrada: `{ "currentPassword", "newPassword" }`. Quita la marca de contraseña temporal, conserva la sesión actual y cierra las demás de esa persona. Salida 200: `{ "user" }`.

## Equipo (solo administrador)

### `GET /api/users`
Salida 200: `{ "users": [user] }`, ordenados por nombre.

### `POST /api/users`
Entrada: `{ "email", "name", "role", "password" }`. La contraseña es temporal: la persona deberá cambiarla al entrar. Salida 201: `{ "user" }`.

### `PATCH /api/users/:id`
Entrada: `{ "role"?, "active"? }` (al menos uno). Desactivar cierra todas las sesiones de esa persona. Salida 200: `{ "user" }`.

### `POST /api/users/:id/password`
Entrada: `{ "password" }`. Restablece la contraseña: queda como temporal y se cierran las sesiones de esa persona. Salida 204.

Las acciones de crear, cambiar rol, activar o desactivar y restablecer contraseña quedan en la tabla `audit_log`.

## Proyectos

Los administradores y líderes ven todos los proyectos; un miembro solo los suyos (RN-11). En una ruta con `:key`, la clave no distingue mayúsculas.

Un proyecto: `{ id, key, name, description, wipLimit, archived }`. Un proyecto archivado es de solo lectura.

### `GET /api/projects`
Salida 200: `{ "projects": [project] }` (los que puedes ver, por nombre).

### `GET /api/directory` (administrador o líder)
Personas activas para elegir miembros de un proyecto. Un líder no puede listar cuentas (`/api/users` es del administrador), así que esta ruta solo expone lo necesario para elegir. Salida 200: `{ "people": [{ id, name, email, role }] }`.

### `POST /api/projects` (administrador o líder)
Entrada: `{ "key", "name", "description"?, "memberIds"? }`. `key`: 2 a 5 letras, se guarda en mayúsculas y **no cambia después**. Se crean los estados Por hacer, En progreso, En revisión y Hecho. Salida 201: `{ "project" }`.

### `GET /api/projects/:key`
Salida 200: `{ "project", "states": [{ id, name, position, category }], "labels": [{ id, name, color }], "members": [{ id, name, email, role, active }] }`. `category` es `todo`, `doing` o `done`.

### `PATCH /api/projects/:key` (administrador o líder)
Entrada (todo opcional): `{ "name", "description", "wipLimit" (1 a 100), "archived" }`. Salida 200: `{ "project" }`.

### Miembros (administrador o líder)
- `POST /api/projects/:key/members` con `{ "userId" }` → 204. Repetir no hace nada.
- `DELETE /api/projects/:key/members/:userId` → 204.

### Estados (administrador o líder)
- `POST /api/projects/:key/states` con `{ "name", "category" }` → 201 `{ "state" }`.
- `PATCH /api/projects/:key/states/:id` con `{ "name"?, "category"? }` → 200 `{ "state" }`.
- `PUT /api/projects/:key/states/order` con `{ "ids": [...] }` (todos los estados, en el nuevo orden) → 204.
- `DELETE /api/projects/:key/states/:id` → 204. Falla si tiene tareas o es el último.

### Etiquetas (administrador o líder)
- `POST /api/projects/:key/labels` con `{ "name", "color" }` (`#rrggbb`) → 201 `{ "label" }`.
- `PATCH /api/projects/:key/labels/:id` con `{ "name"?, "color"? }` → 200 `{ "label" }`.
- `DELETE /api/projects/:key/labels/:id` → 204 (se quita también de las tareas).

## Tareas

En esta etapa cualquier miembro del proyecto puede crear, editar, mover y comentar sus tareas; administradores y líderes, las de cualquier proyecto. Las reglas por responsable (RN-08) llegan con la asignación, en la etapa 4.

La clave de una tarea es `CLAVE-número` (por ejemplo `WEB-42`). Los valores posibles: `type` = `task`, `story`, `bug`, `epic`; `priority` = `low`, `medium`, `high`, `urgent`. `dueDate` es un día `AAAA-MM-DD`, sin hora ni zona horaria.

Resumen de tarea: `{ id, key, number, title, type, priority, stateId, dueDate, parentId, position, version, labelIds }`.

### `GET /api/projects/:key/tasks`
Filtros opcionales en la URL: `stateId`, `type`, `priority`, `labelId`, `q` (texto en título y descripción), `dueFrom`, `dueTo`, `sort` (`number`, `priority`, `dueDate`, `created`, `updated`) y `dir` (`asc`, `desc`). Salida 200: `{ "tasks": [resumen] }`. Con `sort=dueDate` las tareas sin fecha van al final.

### `POST /api/projects/:key/tasks`
Entrada: `{ "title", "description"?, "type"?, "priority"?, "dueDate"?, "stateId"?, "labelIds"?, "parentId"? }`. Sin `stateId` va al primer estado. `parentId` crea una subtarea (un solo nivel). Salida 201: `{ "task" }`.

### `GET /api/tasks/:taskKey`
Salida 200: `{ "task", "parent", "subtasks", "links", "comments", "attachments", "events" }`.
- `links`: `[{ id, type, direction ("out" o "in"), key, title }]`.
- `comments`: `[{ id, body, createdAt, authorId, authorName, mentions: [{ userId, name }] }]`.
- `events` es el historial (RN-12): `[{ id, type, payload, createdAt, actorId, actorName }]`, con `type` = `created`, `updated`, `state_changed`, `commented`, `link_added`, `link_removed` o `attachment_added`.

### `PATCH /api/tasks/:taskKey`
Entrada: `{ "version", "title"?, "description"?, "type"?, "priority"?, "dueDate"? (null la borra), "labelIds"? }`. `version` es la que tenía la tarea cuando la abriste. Si alguien guardó en medio responde **409 `version_conflict`** y no se pisa nada (RN-13). Salida 200: igual que `GET`.

### `POST /api/tasks/:taskKey/move`
Entrada: `{ "version", "stateId", "index" }`. `index` es la posición en la columna de destino (0 = arriba). Mover entre columnas sube la versión y queda en el historial; reordenar dentro de la misma columna no. Salida 200: `{ "task" }`.

### `POST /api/tasks/:taskKey/comments`
Entrada: `{ "body", "mentionUserIds"? }`. Solo se puede mencionar a miembros del proyecto. Salida 201: `{ "comment" }`.

### Relaciones
- `POST /api/tasks/:taskKey/links` con `{ "toKey", "type" }` (`blocks`, `depends_on`, `relates_to`) → 204. Solo entre tareas del mismo proyecto.
- `DELETE /api/tasks/:taskKey/links/:id` → 204.

### Adjuntos
- `POST /api/tasks/:taskKey/attachments`: `multipart/form-data` con un campo `file`, hasta 10 MB. Salida 201: `{ "attachment": { id, filename, mimeType, size } }`.
- `GET /api/attachments/:id/download`: descarga el archivo. Siempre como descarga (`Content-Disposition: attachment`, tipo `application/octet-stream`), nunca se muestra dentro de la página.
