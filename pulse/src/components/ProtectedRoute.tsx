// ARNÉS: stub de PULSE, no fusionar
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useAuth, type UserRole } from "@/context/AuthContext";

export default function ProtectedRoute({ allowedRoles, children }: { allowedRoles: UserRole[]; children: ReactNode }) {
  const { activeUser, isAdmin, hasRole } = useAuth();
  if (!activeUser) return <Navigate to="/" replace />;
  if (!isAdmin && !allowedRoles.some(hasRole)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
