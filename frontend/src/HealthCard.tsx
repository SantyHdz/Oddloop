import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { messages } from "@/messages";

async function fetchHealth() {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(`health ${res.status}`);
  return (await res.json()) as { status: string; db: string };
}

export function HealthCard() {
  const { isPending, isError, refetch } = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    retry: false,
  });
  const text = isPending ? messages.health.checking : isError ? messages.health.error : messages.health.ok;

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{messages.health.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Motion sample: the result fades in; it changes when the state changes. */}
        <motion.p
          key={text}
          role="status"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className={isError ? "text-destructive" : "text-foreground"}
        >
          {text}
        </motion.p>
        <div className="flex gap-2">
          <Button onClick={() => toast(messages.toast.text)}>{messages.toast.button}</Button>
          <Button variant="secondary" onClick={() => void refetch()}>
            {messages.health.retry}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
