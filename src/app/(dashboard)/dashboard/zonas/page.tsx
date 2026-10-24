import ZoneManager from "@/components/zonas/ZoneManager";
import { COLABORADORES_MOCK, ZONAS_MOCK } from "@/lib/mock/zonas";

/**
 * TODO(supabase): cargar zonas y colaboradores desde la base de datos y
 * pasarlos en lugar de los mocks.
 */
export default function ZonasPage() {
  return (
    <div className="flex flex-col px-12 py-8">
      <ZoneManager
        zonasIniciales={ZONAS_MOCK}
        colaboradores={COLABORADORES_MOCK}
        encabezado={
          <div className="flex flex-col gap-1.5">
            <div className="inline-flex items-center gap-2.5">
              <span className="rounded-sm bg-brand-dark px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white">
                GEOCERCAS &amp; CONTROL GPS
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                REGLA DE 15 MIN &amp; VALIDACIÓN DE RADIO
              </span>
            </div>
            <h1 className="font-serif text-3xl font-black text-gray-900">
              Localizaciones Autorizadas (Home Office)
            </h1>
            <p className="max-w-2xl text-xs font-medium text-gray-500">
              Configura y administra las ubicaciones y radios en metros
              permitidos para el registro de asistencia de los colaboradores,
              tanto en home office como en sedes corporativas.
            </p>
          </div>
        }
      />
    </div>
  );
}
