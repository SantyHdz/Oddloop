import { Navigate, Route, Routes } from "react-router";
import { LoginPage } from "@/features/auth/LoginPage";
import { AdminOnly, RequireAuth } from "@/features/auth/guards";
import { BoardPage } from "@/features/projects/BoardPage";
import { ListPage } from "@/features/projects/ListPage";
import { ProjectLayout } from "@/features/projects/ProjectLayout";
import { SettingsPage } from "@/features/projects/SettingsPage";
import { AppLayout } from "@/layout/AppLayout";
import { AccountPage } from "@/pages/AccountPage";
import { HomePage } from "@/pages/HomePage";
import { TeamPage } from "@/pages/TeamPage";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="p/:key" element={<ProjectLayout />}>
            <Route index element={<BoardPage />} />
            <Route path="lista" element={<ListPage />} />
            <Route path="ajustes" element={<SettingsPage />} />
          </Route>
          {/* The task panel opens over the board and has its own address. */}
          <Route path="t/:taskKey" element={<ProjectLayout />}>
            <Route index element={<BoardPage />} />
          </Route>
          <Route path="cuenta" element={<AccountPage />} />
          <Route element={<AdminOnly />}>
            <Route path="equipo" element={<TeamPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
