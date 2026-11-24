import { Navigate, Route, Routes } from "react-router";
import { LoginPage } from "@/features/auth/LoginPage";
import { AdminOnly, RequireAuth } from "@/features/auth/guards";
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
