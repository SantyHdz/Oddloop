# Odd Loop

Gestor de trabajo para un equipo de 2 a 10 personas. Qué se construye y por qué está en `REQUISITOS.md`; el contrato de la API está en `docs/API.md`.

## Requisitos

Docker Desktop (motor Linux). Nada más: Node y pnpm corren dentro de los contenedores.
Para trabajar fuera de Docker (pruebas, lint) hace falta Node y pnpm 12.

## Primera vez

```powershell
copy .env.example .env      # y cambia POSTGRES_PASSWORD por una contraseña propia
docker compose up -d --build
```

Abre http://localhost:3000. Si todo va bien, la tarjeta "Estado del sistema" dice que el servidor y la base de datos están conectados.

## Día a día

```powershell
docker compose up -d --build   # levantar todo (reconstruye si cambió el código)
docker compose logs -f backend # ver los registros del backend (Ctrl+C para salir)
docker compose ps              # ver qué está corriendo
docker compose down            # parar. Los datos se conservan en el volumen db-data
```

**Nunca** uses `docker compose down -v`: la opción `-v` borra el volumen y con él toda la base de datos.

## Pruebas y lint

```powershell
pnpm --dir backend test
pnpm --dir frontend test
pnpm --dir backend lint     # ESLint + tipos
pnpm --dir frontend lint
```

## Cómo está armado

- `db`: PostgreSQL 17. Sus datos viven en el volumen `db-data`, fuera del contenedor.
- `backend`: API con Fastify en el puerto interno 3001. Al arrancar aplica las migraciones pendientes.
- `frontend`: nginx sirve la interfaz y reenvía `/api` al backend. Es el único puerto expuesto (3000), así que todo es del mismo origen y no hay CORS.
- En desarrollo (`pnpm --dir frontend dev`, puerto 5173) Vite hace de proxy de `/api` hacia `localhost:3001`.

## Estructura

```
backend/   API, reglas de negocio y base de datos (Drizzle, migraciones en backend/drizzle)
frontend/  interfaz web (Vite, React, Tailwind, shadcn/ui)
scripts/   respaldos y utilidades
docs/      API.md y guías
```
