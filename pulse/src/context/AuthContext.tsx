// ARNÉS: stub de PULSE, no fusionar
import { createContext, useContext, useMemo, type ReactNode } from "react";

export type UserRole = "Admin" | "QR Producción" | "Operador";

export interface ActiveUser {
  id: string;
  name: string;
  roles: UserRole[];
}

interface AuthValue {
  activeUser: ActiveUser | null;
  isAdmin: boolean;
  userRoles: UserRole[];
  hasRole: (role: UserRole) => boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

// Usuario de desarrollo: en PULSE lo provee el AuthProvider real.
const DEV_USER: ActiveUser = { id: "dev", name: "Desarrollo", roles: ["Admin", "QR Producción"] };

export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useMemo<AuthValue>(
    () => ({
      activeUser: DEV_USER,
      isAdmin: DEV_USER.roles.includes("Admin"),
      userRoles: DEV_USER.roles,
      hasRole: (role) => DEV_USER.roles.includes(role),
    }),
    [],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
