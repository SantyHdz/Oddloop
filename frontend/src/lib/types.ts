// Shape of a user as the API returns it (docs/API.md). Never includes the password hash.
export type Role = "admin" | "leader" | "member";

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  soundEnabled: boolean;
}
