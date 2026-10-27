import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { obtenerSesionYRol } from "@/lib/auth/session";

export default async function JefaturaProtectedLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const perfil = await obtenerSesionYRol();

  if (!perfil) {
    redirect("/login");
  }

  if (
    perfil.rolSistema !== "Jefatura" &&
    !perfil.esJefatura &&
    perfil.rolSistema !== "Recursos Humanos"
  ) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
