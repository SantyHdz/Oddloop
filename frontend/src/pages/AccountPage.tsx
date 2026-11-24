import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PasswordForm } from "@/features/auth/PasswordForm";
import { meKey, useMe } from "@/features/auth/useMe";
import { api } from "@/lib/api";
import { useFeedback } from "@/lib/feedback";
import { playSound, type SoundName } from "@/lib/sounds";
import type { User } from "@/lib/types";
import { messages } from "@/messages";

const soundNames: SoundName[] = ["assigned", "mention", "done", "error"];

export function AccountPage() {
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const [name, setName] = useState(me?.name ?? "");

  const update = useMutation({
    mutationFn: (patch: { name?: string; soundEnabled?: boolean }) => api<{ user: User }>("/api/me", { method: "PATCH", body: patch }),
    onSuccess: ({ user }) => {
      queryClient.setQueryData(meKey, user);
      feedback.success(messages.account.saved);
    },
    onError: feedback.fail,
  });

  if (!me) return null;

  function saveName(event: FormEvent) {
    event.preventDefault();
    update.mutate({ name });
  }

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">{messages.account.title}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{messages.account.profile}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={saveName} className="space-y-2">
            <Label htmlFor="profile-name">{messages.account.name}</Label>
            <div className="flex gap-2">
              <Input id="profile-name" required value={name} onChange={(e) => setName(e.target.value)} />
              <Button type="submit" disabled={update.isPending || name.trim() === me.name}>
                {messages.account.saveName}
              </Button>
            </div>
          </form>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{messages.account.email}</dt>
            <dd>{me.email}</dd>
            <dt className="text-muted-foreground">{messages.account.role}</dt>
            <dd>{messages.roles[me.role]}</dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{messages.account.passwordTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{messages.account.soundTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="sound-enabled">{messages.account.soundLabel}</Label>
              <p id="sound-help" className="text-muted-foreground text-sm">
                {messages.account.soundHelp}
              </p>
            </div>
            <Switch
              id="sound-enabled"
              aria-describedby="sound-help"
              checked={me.soundEnabled}
              disabled={update.isPending}
              onCheckedChange={(soundEnabled) => update.mutate({ soundEnabled })}
            />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">{messages.account.soundTest}</p>
            <div className="flex flex-wrap gap-2">
              {soundNames.map((sound) => (
                <Button key={sound} type="button" variant="secondary" size="sm" onClick={() => playSound(sound, true)}>
                  {messages.account.sounds[sound]}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
