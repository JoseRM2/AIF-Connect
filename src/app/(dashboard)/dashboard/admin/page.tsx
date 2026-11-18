import { redirect } from "next/navigation";
import { obtenerReportesErroresAction } from "@/app/actions/errores";
import AdminWorkspace from "@/components/admin/AdminWorkspace";
import TopBar from "@/components/layout/TopBar";
import { obtenerSesionYRol } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const sesion = await obtenerSesionYRol();

  // Exclusivo para el Administrador del Sistema (jrealmedina@gmail.com)
  if (!sesion || !sesion.esAdminSistema) {
    redirect("/dashboard");
  }

  const datos = await obtenerReportesErroresAction();

  return (
    <div className="flex min-h-full flex-col bg-brand-beige">
      <TopBar />
      <AdminWorkspace
        todosLosReportesIniciales={datos.todosLosReportes}
        errorInicial={datos.ok ? undefined : datos.error}
      />
    </div>
  );
}
