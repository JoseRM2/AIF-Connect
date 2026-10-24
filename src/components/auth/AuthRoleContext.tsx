"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { PerfilSesionActual, RolSistema } from "@/lib/auth/session";

interface AuthRoleContextValue {
  userId: string | null;
  email: string;
  nombreCompleto: string;
  empresa: string;
  rolSistema: RolSistema;
  esRecursosHumanos: boolean;
}

const DEFAULT_CONTEXT: AuthRoleContextValue = {
  userId: null,
  email: "",
  nombreCompleto: "Colaborador",
  empresa: "AIF",
  rolSistema: "Colaborador",
  esRecursosHumanos: false,
};

const AuthRoleContext = createContext<AuthRoleContextValue>(DEFAULT_CONTEXT);

export function AuthRoleProvider({
  perfil,
  children,
}: {
  perfil: PerfilSesionActual | null;
  children: ReactNode;
}) {
  const value: AuthRoleContextValue = perfil
    ? {
        userId: perfil.userId,
        email: perfil.email,
        nombreCompleto: perfil.nombreCompleto,
        empresa: perfil.empresa,
        rolSistema: perfil.rolSistema,
        esRecursosHumanos: perfil.rolSistema === "Recursos Humanos",
      }
    : DEFAULT_CONTEXT;

  return (
    <AuthRoleContext.Provider value={value}>
      {children}
    </AuthRoleContext.Provider>
  );
}

export function useAuthRole(): AuthRoleContextValue {
  return useContext(AuthRoleContext);
}
