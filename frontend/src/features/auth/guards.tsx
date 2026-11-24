import { Navigate, Outlet } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { messages } from "@/messages";
import { PasswordForm } from "./PasswordForm";
import { useMe } from "./useMe";

// Everything behind the login. While the password is temporary, the only screen is the change form.
export function RequireAuth() {
  const { data: me, isPending } = useMe();
  if (isPending) return <p className="p-6 text-muted-foreground">{messages.loading}</p>;
  if (!me) return <Navigate to="/login" replace />;
  if (me.mustChangePassword) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>{messages.password.forcedTitle}</CardTitle>
            <p className="text-muted-foreground text-sm">{messages.password.forcedHelp}</p>
          </CardHeader>
          <CardContent>
            <PasswordForm />
          </CardContent>
        </Card>
      </main>
    );
  }
  return <Outlet />;
}

// Hiding the page is only convenience: the backend checks the role on every request.
export function AdminOnly() {
  const { data: me } = useMe();
  return me?.role === "admin" ? <Outlet /> : <Navigate to="/" replace />;
}
