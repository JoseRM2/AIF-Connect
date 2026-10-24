import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AuthRoleProvider } from "@/components/auth/AuthRoleContext";
import Sidebar from "@/components/layout/Sidebar";
import { obtenerSesionYRol } from "@/lib/auth/session";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const perfil = await obtenerSesionYRol();

  if (!perfil) {
    redirect("/login");
  }

  return (
    <AuthRoleProvider perfil={perfil}>
      <div className="flex h-screen w-full bg-brand-beige">
        <Sidebar rolSistema={perfil.rolSistema} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </AuthRoleProvider>
  );
}
