// All user-facing text lives here (RNF-15), so other languages can be added later.
export const messages = {
  appName: "Odd Loop",
  home: {
    title: "Odd Loop",
    subtitle: "Gestor de trabajo para tu equipo",
  },
  health: {
    title: "Estado del sistema",
    checking: "Comprobando conexión…",
    ok: "Conectado: servidor y base de datos funcionan.",
    error: "Sin conexión con el servidor o la base de datos.",
    retry: "Reintentar",
  },
  toast: {
    button: "Probar aviso",
    text: "Los avisos aparecen aquí.",
  },
} as const;
