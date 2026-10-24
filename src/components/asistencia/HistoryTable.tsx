import { CheckCircleIcon } from "@/components/ui/icons";
import { formatHora12 } from "@/lib/asistencia";
import type { Asistencia, EstatusAsistencia } from "@/types/asistencia";

interface HistoryTableProps {
  registros: Asistencia[];
}

const COLUMNAS = [
  "FECHA",
  "ENTRADA",
  "SALIDA",
  "ESTATUS",
  "GEOLOCALIZACIÓN",
  "ACCIÓN",
] as const;

const CHIP = "rounded border px-2 py-0.5 text-[10px] font-bold uppercase";

const ESTATUS_ESTILOS: Record<
  EstatusAsistencia,
  { label: string; className: string }
> = {
  a_tiempo: {
    label: "A TIEMPO",
    className:
      "border-status-success/40 bg-status-success/10 text-status-success",
  },
  retardo: {
    label: "RETARDO",
    className:
      "border-status-warning/50 bg-status-warning/10 text-status-warning",
  },
  falta: {
    label: "FALTA",
    className:
      "border-status-danger/50 bg-status-danger/10 text-status-danger",
  },
  justificado: {
    label: "JUSTIFICADO",
    className:
      "border-status-info/40 bg-status-info/10 text-status-info-dark",
  },
};

function GeoCell({ registro }: { registro: Asistencia }) {
  const ubicacion = registro.ubicacion_entrada;
  if (!ubicacion) return <span className="text-gray-400">-</span>;

  return (
    <div>
      {ubicacion.dentro_de_zona ? (
        <span className="inline-flex items-center gap-1 rounded border border-status-success/30 bg-status-success/10 px-2 py-0.5 text-[9px] font-bold text-status-success">
          <CheckCircleIcon className="h-3 w-3" />
          EN RANGO
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 rounded border border-status-danger/30 bg-status-danger/10 px-2 py-0.5 text-[9px] font-bold text-status-danger">
          FUERA DE RANGO
        </span>
      )}
      {ubicacion.zona_nombre && (
        <p className="mt-0.5 text-[10px] text-gray-400">
          {ubicacion.zona_nombre}
        </p>
      )}
    </div>
  );
}

export default function HistoryTable({ registros }: HistoryTableProps) {
  return (
    <section className="rounded-md bg-brand-surface p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-bold text-gray-900">
          Historial de Marcajes y Verificación
        </h2>
        <span className="text-xs text-gray-400">
          {registros.length} {registros.length === 1 ? "registro" : "registros"}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {COLUMNAS.map((columna) => (
                <th
                  key={columna}
                  scope="col"
                  className="border-b border-gray-100 pb-4 text-left text-[10px] font-bold uppercase tracking-widest text-gray-400"
                >
                  {columna}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {registros.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMNAS.length}
                  className="py-10 text-center text-xs font-medium text-gray-400"
                >
                  Aún no tienes registros de asistencia en tu historial.
                </td>
              </tr>
            ) : (
              registros.map((registro) => {
                const estatusUi =
                  ESTATUS_ESTILOS[registro.estatus] ?? ESTATUS_ESTILOS.a_tiempo;
                return (
                  <tr
                    key={registro.id}
                    className="border-b border-gray-100 hover:bg-gray-50/50"
                  >
                    <td className="py-4 pr-4 font-mono text-xs font-bold text-gray-900">
                      {registro.fecha}
                    </td>
                    <td className="py-4 pr-4 text-xs text-gray-600">
                      {registro.hora_entrada
                        ? formatHora12(registro.hora_entrada.slice(0, 5))
                        : "-"}
                    </td>
                    <td className="py-4 pr-4 text-xs text-gray-600">
                      {registro.hora_salida
                        ? formatHora12(registro.hora_salida.slice(0, 5))
                        : "-"}
                    </td>
                    <td className="py-4 pr-4 text-xs">
                      <span className={`${CHIP} ${estatusUi.className}`}>
                        {estatusUi.label}
                      </span>
                    </td>
                    <td className="py-4 pr-4 text-xs">
                      <GeoCell registro={registro} />
                    </td>
                    <td className="py-4 text-xs">
                      {registro.estatus === "falta" ? (
                        <button
                          type="button"
                          className="cursor-pointer text-xs font-bold uppercase tracking-wide text-gray-900 underline"
                        >
                          GENERAR TICKET
                        </button>
                      ) : (
                        <span className="text-gray-400">Normal</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
