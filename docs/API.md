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
