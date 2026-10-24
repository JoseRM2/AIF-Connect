export interface OpcionSimulador {
  id: string;
  label: string;
  dentro: boolean;
}

interface LocationSimulatorProps {
  opciones: OpcionSimulador[];
  seleccionadaId: string;
  usarGpsReal: boolean;
  onSeleccionar: (id: string) => void;
  onAlternarGpsReal: () => void;
}

const BADGE_BASE = "rounded border px-2 py-0.5 text-[9px] font-bold uppercase";

function RangoBadge({ dentro, activa }: { dentro: boolean; activa: boolean }) {
  const estilo = dentro
    ? activa
      ? "border-status-success/30 bg-status-success/20 text-status-success"
      : "border-status-success/30 bg-status-success/10 text-status-success-dark"
    : activa
      ? "border-status-danger/30 bg-status-danger/20 text-status-danger"
      : "border-status-danger/30 bg-status-danger/10 text-status-danger-dark";

  return (
    <span className={`${BADGE_BASE} ${estilo}`}>
      {dentro ? "EN RANGO" : "FUERA DE RANGO"}
    </span>
  );
}

export default function LocationSimulator({
  opciones,
  seleccionadaId,
  usarGpsReal,
  onSeleccionar,
  onAlternarGpsReal,
}: LocationSimulatorProps) {
  return (
    <div className="flex flex-col gap-2.5 border-t border-gray-200 pt-4">
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-gray-400">
        <span>SIMULADOR DE UBICACIÓN GPS</span>
        <button
          type="button"
          onClick={onAlternarGpsReal}
          aria-pressed={usarGpsReal}
          className={`uppercase tracking-widest transition-colors hover:text-brand-gold ${
            usarGpsReal ? "text-brand-gold underline" : ""
          }`}
        >
          USAR GPS REAL
        </button>
      </div>

      <div
        className={`flex flex-col gap-2.5 transition-opacity ${
          usarGpsReal ? "pointer-events-none opacity-40" : ""
        }`}
      >
        {opciones.map(({ id, label, dentro }) => {
          const activa = !usarGpsReal && id === seleccionadaId;
          const estilo = activa
            ? "bg-brand-dark text-white"
            : dentro
              ? "border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
              : "border border-status-danger/30 bg-brand-surface text-status-danger-dark hover:bg-status-danger/10";

          return (
            <button
              key={id}
              type="button"
              aria-pressed={activa}
              onClick={() => onSeleccionar(id)}
              className={`flex items-center justify-between rounded-md p-3 text-left text-xs transition-colors ${estilo}`}
            >
              <span className="font-medium">{label}</span>
              <RangoBadge dentro={dentro} activa={activa} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
