import TopBar from "@/components/layout/TopBar";
import MonitorAsistenciaEquipo from "@/components/jefatura/MonitorAsistenciaEquipo";

export default function JefaturaAsistenciaPage() {
  return (
    <div className="flex flex-col">
      <TopBar />

      <div className="flex flex-col px-8 py-8">
        <header className="mb-6 border-b border-brand-dark/10 pb-3">
          <h1 className="font-serif text-3xl font-black text-gray-900">
            Monitor de Asistencia
          </h1>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
            REGISTROS DE ENTRADA, DESCANSO, SALIDA Y RETARDOS DE TUS SUBORDINADOS DIRECTOS.
          </p>
        </header>

        <MonitorAsistenciaEquipo />
      </div>
    </div>
  );
}
