// "{name}" placeholders in messages.ts.
export function fmt(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? ""));
}

// A due date is a calendar day (YYYY-MM-DD). It is read as UTC and shown as UTC, so it never
// moves to the previous or next day depending on the viewer's time zone (RNF-23).
export function formatDay(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

// A moment in time (comments, history) is stored in UTC and shown in the viewer's own time zone.
export function formatMoment(iso: string) {
  return new Date(iso).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" });
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
