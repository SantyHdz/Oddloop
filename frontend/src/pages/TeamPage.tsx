import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMe } from "@/features/auth/useMe";
import { api } from "@/lib/api";
import { useFeedback } from "@/lib/feedback";
import type { Role, User } from "@/lib/types";
import { messages } from "@/messages";

const roleList: Role[] = ["admin", "leader", "member"];
const usersKey = ["users"] as const;

function RoleSelect({ value, onChange, label }: { value: Role; onChange: (role: Role) => void; label: string }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Role)}>
      <SelectTrigger aria-label={label} className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {roleList.map((role) => (
          <SelectItem key={role} value={role}>
            {messages.roles[role]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const [form, setForm] = useState({ name: "", email: "", role: "member" as Role, password: "" });

  const create = useMutation({
    mutationFn: () => api("/api/users", { method: "POST", body: form }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: usersKey });
      feedback.success(messages.team.created);
      setForm({ name: "", email: "", role: "member", password: "" });
      onClose();
    },
    onError: feedback.fail,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{messages.team.createTitle}</DialogTitle>
            <DialogDescription>{messages.team.createHelp}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-name">{messages.team.name}</Label>
            <Input id="new-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-email">{messages.team.email}</Label>
            <Input id="new-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>{messages.team.role}</Label>
            <RoleSelect label={messages.team.role} value={form.role} onChange={(role) => setForm({ ...form, role })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">{messages.team.tempPassword}</Label>
            {/* Visible on purpose: the admin has to tell it to the person. */}
            <Input id="new-password" required autoComplete="off" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {messages.team.cancel}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {messages.team.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetDialog({ user, onClose }: { user: User | null; onClose: () => void }) {
  const feedback = useFeedback();
  const [password, setPassword] = useState("");

  const reset = useMutation({
    mutationFn: () => api(`/api/users/${user!.id}/password`, { method: "POST", body: { password } }),
    onSuccess: () => {
      feedback.success(messages.team.resetDone);
      setPassword("");
      onClose();
    },
    onError: feedback.fail,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    reset.mutate();
  }

  return (
    <Dialog open={user !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{messages.team.resetTitle.replace("{name}", user?.name ?? "")}</DialogTitle>
            <DialogDescription>{messages.team.createHelp}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reset-password">{messages.team.tempPassword}</Label>
            <Input id="reset-password" required autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {messages.team.cancel}
            </Button>
            <Button type="submit" disabled={reset.isPending}>
              {messages.team.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TeamPage() {
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<User | null>(null);

  const { data } = useQuery({ queryKey: usersKey, queryFn: () => api<{ users: User[] }>("/api/users") });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: { role?: Role; active?: boolean } }) =>
      api(`/api/users/${id}`, { method: "PATCH", body: patch }),
    onSuccess: () => feedback.success(messages.team.updated),
    onError: feedback.fail,
    // Refetch either way: after an error (e.g. last admin) the select goes back to the real value.
    onSettled: () => queryClient.invalidateQueries({ queryKey: usersKey }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{messages.team.title}</h1>
        <Button onClick={() => setCreating(true)}>{messages.team.create}</Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{messages.team.columns.name}</TableHead>
              <TableHead>{messages.team.columns.email}</TableHead>
              <TableHead>{messages.team.columns.role}</TableHead>
              <TableHead>{messages.team.columns.status}</TableHead>
              <TableHead>{messages.team.columns.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">
                  {user.name}
                  {user.id === me?.id && <span className="text-muted-foreground ml-2 text-xs">({messages.team.you})</span>}
                </TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <RoleSelect
                    label={`${messages.team.role}: ${user.name}`}
                    value={user.role}
                    onChange={(role) => update.mutate({ id: user.id, patch: { role } })}
                  />
                </TableCell>
                <TableCell>
                  <Badge variant={user.active ? "default" : "secondary"}>{user.active ? messages.team.active : messages.team.inactive}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setResetting(user)}>
                      {messages.team.resetPassword}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => update.mutate({ id: user.id, patch: { active: !user.active } })}>
                      {user.active ? messages.team.deactivate : messages.team.activate}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <CreateDialog open={creating} onClose={() => setCreating(false)} />
      <ResetDialog user={resetting} onClose={() => setResetting(null)} />
    </div>
  );
}
