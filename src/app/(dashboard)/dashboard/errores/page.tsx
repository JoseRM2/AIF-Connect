import { Suspense } from "react";
import { obtenerReportesErroresAction } from "@/app/actions/errores";
import ReporteErroresWorkspace from "@/components/errores/ReporteErroresWorkspace";
import TopBar from "@/components/layout/TopBar";

export const dynamic = "force-dynamic";

export default async function ReporteErroresPage() {
  const datos = await obtenerReportesErroresAction();

  return (
    <div className="flex min-h-full flex-col bg-brand-beige">
      <TopBar />
      <Suspense
        fallback={
          <div className="p-8 text-xs font-bold uppercase tracking-widest text-gray-400">
            Cargando módulo de reporte de errores...
          </div>
        }
      >
        <ReporteErroresWorkspace
          esAdminSistemaInicial={datos.esAdminSistema}
          misReportesIniciales={datos.misReportes}
          todosLosReportesIniciales={datos.todosLosReportes}
          errorInicial={datos.ok ? undefined : datos.error}
        />
      </Suspense>
    </div>
  );
}
