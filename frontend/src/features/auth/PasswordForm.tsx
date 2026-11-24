import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useFeedback } from "@/lib/feedback";
import type { User } from "@/lib/types";
import { messages } from "@/messages";
import { meKey } from "./useMe";

// Used both for the forced change of a temporary password and in "Mi cuenta".
export function PasswordForm() {
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [mismatch, setMismatch] = useState(false);

  const change = useMutation({
    mutationFn: () =>
      api<{ user: User }>("/api/me/password", { method: "POST", body: { currentPassword: current, newPassword: next } }),
    onSuccess: ({ user }) => {
      queryClient.setQueryData(meKey, user);
      setCurrent("");
      setNext("");
      setRepeat("");
      feedback.success(messages.password.done);
    },
    onError: feedback.fail,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const differs = next !== repeat;
    setMismatch(differs);
    if (!differs) change.mutate();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="current-password">{messages.password.current}</Label>
        <Input id="current-password" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-password">{messages.password.new}</Label>
        <Input id="new-password" type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="repeat-password">{messages.password.confirm}</Label>
        <Input
          id="repeat-password"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={mismatch}
          aria-describedby={mismatch ? "password-mismatch" : undefined}
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
        />
        {mismatch && (
          <p id="password-mismatch" role="alert" className="text-destructive text-sm">
            {messages.password.mismatch}
          </p>
        )}
      </div>
      <Button type="submit" disabled={change.isPending}>
        {messages.password.submit}
      </Button>
    </form>
  );
}
