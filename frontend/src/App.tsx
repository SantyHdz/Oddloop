import { HealthCard } from "@/HealthCard";
import { messages } from "@/messages";

export function App() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <header className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight">
          Odd <span className="text-primary">Loop</span>
        </h1>
        <p className="text-muted-foreground mt-2">{messages.home.subtitle}</p>
      </header>
      <HealthCard />
    </main>
  );
}
