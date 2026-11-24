# API de Odd Loop

Todas las rutas empiezan con `/api`. Entradas y salidas en JSON. Este archivo se actualiza con cada etapa.

## Salud

### `GET /api/health`

Comprueba que el backend responde y que puede consultar la base de datos. No requiere sesión.

| Caso | Código | Respuesta |
| --- | --- | --- |
| Backend y base de datos funcionan | 200 | `{ "status": "ok", "db": "up" }` |
| No hay conexión con la base de datos | 503 | `{ "status": "error", "db": "down" }` |
