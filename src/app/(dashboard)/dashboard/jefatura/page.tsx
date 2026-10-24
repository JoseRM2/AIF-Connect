import TopBar from "@/components/layout/TopBar";
import GestionSolicitudesEquipo from "@/components/jefatura/GestionSolicitudesEquipo";

export default function JefaturaPage() {
  return (
    <div className="flex flex-col">
      <TopBar />

      <div className="flex flex-col px-8 py-8">
        <header className="mb-6 border-b border-brand-dark/10 pb-3">
          <h1 className="font-serif text-3xl font-black text-gray-900">
            Gestión de Solicitudes
          </h1>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
            SUPERVISIÓN Y RESOLUCIÓN DE VACACIONES Y PERMISOS DE TU EQUIPO DIRECTO.
          </p>
        </header>

        <GestionSolicitudesEquipo />
      </div>
    </div>
  );
}
