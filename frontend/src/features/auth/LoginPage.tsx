import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import type { User } from "@/lib/types";
import { errorMessage, messages } from "@/messages";
import { meKey, useMe } from "./useMe";

export function LoginPage() {
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const login = useMutation({
    mutationFn: () => api<{ user: User }>("/api/auth/login", { method: "POST", body: { email, password } }),
    onSuccess: ({ user }) => {
      queryClient.setQueryData(meKey, user);
      navigate("/", { replace: true });
    },
  });

  if (me) return <Navigate to="/" replace />;

  function submit(event: FormEvent) {
    event.preventDefault();
    login.mutate();
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-4xl font-semibold tracking-tight">
        Odd <span className="text-primary">Loop</span>
      </h1>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{messages.login.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{messages.login.email}</Label>
              <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{messages.login.password}</Label>
              <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {login.isError && (
              <p role="alert" className="text-destructive text-sm">
                {errorMessage(login.error instanceof ApiError ? login.error.code : "unknown")}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={login.isPending}>
              {login.isPending ? messages.login.submitting : messages.login.submit}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
