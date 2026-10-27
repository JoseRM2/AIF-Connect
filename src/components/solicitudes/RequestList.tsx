import { FileTextIcon } from "@/components/ui/icons";
import { TIPO_SOLICITUD_LABELS } from "@/lib/solicitudes";
import type { EstatusSolicitud, Solicitud } from "@/types/solicitudes";

const COLUMNAS: { label: string; className: string }[] = [
  { label: "TIPO", className: "col-span-3" },
  { label: "PERÍODO", className: "col-span-3" },
  { label: "MOTIVO", className: "col-span-3" },
  { label: "ESTADO", className: "col-span-3 text-right" },
];

/**
 * Determina si una solicitud se resuelve en Recursos Humanos (RH) o con el Jefe Directo.
 * - RH resuelve: "Incapacidad" y "Vacaciones pagadas".
 * - Jefe Directo resuelve: "Vacaciones", "Permiso con goce de sueldo", "Permiso sin goce de sueldo".
 */
function esResolucionPorRH(solicitud: Solicitud): boolean {
  if (solicitud.tipo === "incapacidad") return true;
  const labelNorm = (solicitud.tipo_label ?? "").trim().toLowerCase();
  return (
    labelNorm.includes("incapacidad") || labelNorm.includes("vacaciones pagadas")
  );
}

function obtenerEstadoVisualDosFases(
  estatus: EstatusSolicitud,
  resuelveRH: boolean
): {
  label: string;
  chip: string;
  barras: [string, string];
  pasos: ["ENVIADA", "RH" | "JEFE"];
} {
  const segundoPaso: "RH" | "JEFE" = resuelveRH ? "RH" : "JEFE";
  const pasos: ["ENVIADA", "RH" | "JEFE"] = ["ENVIADA", segundoPaso];

  if (estatus === "Rechazado") {
    return {
      label: "Rechazado",
      chip: "border-status-danger bg-status-danger/10 text-status-danger-dark",
      barras: ["bg-status-danger", "bg-gray-200"],
      pasos,
    };
  }

  if (estatus === "Aprobado_Jefe" || estatus === "Completado") {
    return {
      label: resuelveRH ? "Aprobado (RH)" : "Aprobado (Jefe)",
      chip: "border-status-success bg-status-success/10 text-status-success-dark",
      barras: ["bg-status-success", "bg-status-success"],
      pasos,
    };
  }

  return {
    label: resuelveRH ? "Pendiente (RH)" : "Pendiente (Jefe)",
    chip: "border-status-warning bg-status-warning/10 text-status-warning-dark",
    barras: ["bg-status-warning", "bg-gray-200"],
    pasos,
  };
}

function EstadoCell({ solicitud }: { solicitud: Solicitud }) {
  const resuelveRH = esResolucionPorRH(solicitud);
  const { label, chip, barras, pasos } = obtenerEstadoVisualDosFases(
    solicitud.estatus,
    resuelveRH
  );

  return (
    <div role="cell" className="col-span-3 flex flex-col items-end gap-1.5">
      <span
        className={`rounded border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${chip}`}
      >
        {label}
      </span>
      <div className="w-28">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {barras.map((color, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full ${color}`} />
          ))}
        </div>
        <div
          className="mt-0.5 flex justify-between text-[7px] font-bold uppercase tracking-tighter text-gray-400"
          aria-hidden="true"
        >
          {pasos.map((paso) => (
            <span key={paso}>{paso}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function RequestList({
  solicitudes,
}: {
  solicitudes: Solicitud[];
}) {
  return (
    <section className="overflow-hidden rounded-md bg-brand-surface shadow-sm">
      <div className="overflow-x-auto">
        <div
          role="table"
          aria-label="Historial de solicitudes"
          className="min-w-[640px]"
        >
          <div role="rowgroup">
            <div
              role="row"
              className="grid grid-cols-12 items-center border-b border-gray-100 px-6 py-3.5"
            >
              {COLUMNAS.map(({ label, className }) => (
                <div
                  key={label}
                  role="columnheader"
                  className={`${className} text-[10px] font-bold uppercase tracking-widest text-gray-400`}
                >
                  {label}
                </div>
              ))}
            </div>
          </div>

          <div role="rowgroup">
            {solicitudes.length === 0 && (
              <p className="px-6 py-8 text-center text-xs text-gray-400">
                Aún no tienes solicitudes registradas.
              </p>
            )}
            {solicitudes.map((s) => (
              <div
                key={s.id}
                role="row"
                className="grid grid-cols-12 items-center border-b border-gray-100 px-6 py-4 hover:bg-gray-50/50"
              >
                <div
                  role="cell"
                  className="col-span-3 flex items-center gap-2.5"
                >
                  <FileTextIcon className="h-4 w-4 shrink-0 text-brand-gold" />
                  <span className="text-xs font-bold text-gray-900">
                    {s.tipo_label || TIPO_SOLICITUD_LABELS[s.tipo]}
                  </span>
                </div>
                <div
                  role="cell"
                  className="col-span-3 font-mono text-xs text-gray-600"
                >
                  {s.fecha_inicio} al {s.fecha_fin}
                </div>
                <div role="cell" className="col-span-3 text-xs text-gray-600">
                  {s.motivo || "-"}
                </div>
                <EstadoCell solicitud={s} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
