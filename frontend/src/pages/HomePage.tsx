import { HealthCard } from "@/HealthCard";
import { messages } from "@/messages";

// Placeholder: "Mi trabajo" gets its real content in stage 4.
export function HomePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{messages.home.title}</h1>
      <p className="text-muted-foreground">{messages.home.empty}</p>
      <HealthCard />
    </div>
  );
}
