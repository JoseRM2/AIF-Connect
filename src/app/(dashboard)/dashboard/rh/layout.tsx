import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { obtenerSesionYRol } from "@/lib/auth/session";

export default async function RhProtectedLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const perfil = await obtenerSesionYRol();

  if (!perfil) {
    redirect("/login");
  }

  if (perfil.rolSistema !== "Recursos Humanos") {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
