import type { MetricasAsistencia } from "@/types/asistencia";

interface MetricCardProps {
  label: string;
  children: React.ReactNode;
}

function MetricCard({ label, children }: MetricCardProps) {
  return (
    <div className="flex flex-col justify-between gap-3 rounded-md bg-brand-surface p-4 shadow-sm">
      <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">
        {label}
      </span>
      {children}
    </div>
  );
}

const HINT = "text-[10px] text-gray-400";
const VALUE = "font-serif text-2xl font-bold";

export default function MetricsGrid({
  metricas,
}: {
  metricas: MetricasAsistencia;
}) {
  const progreso = Math.min(
    100,
    (metricas.retardos_quincena / metricas.limite_retardos) * 100,
  );

  return (
    <section
      aria-label="Métricas de asistencia"
      className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4"
    >
      <MetricCard label="Retardos Quincena">
        <div>
          <p className={`${VALUE} text-gray-900`}>
            {metricas.retardos_quincena}
            <span className="font-sans text-sm font-normal text-gray-400">
              {" "}
              / {metricas.limite_retardos}
            </span>
          </p>
          <div className="mt-2 h-1 w-full rounded-full bg-gray-200">
            <div
              className="h-1 rounded-full bg-status-warning"
              style={{ width: `${progreso}%` }}
            />
          </div>
        </div>
      </MetricCard>

      <MetricCard label="Faltas Totales">
        <div>
          <p className={`${VALUE} text-gray-900`}>
            {metricas.faltas_injustificadas}
          </p>
          <p className={HINT}>Injustificadas</p>
        </div>
      </MetricCard>

      <MetricCard label="Alertas Fuera de Rango">
        <div>
          <p className={`${VALUE} text-status-danger`}>
            {metricas.alertas_fuera_de_rango}
          </p>
          <p className={HINT}>Reportadas a RH</p>
        </div>
      </MetricCard>

      <MetricCard label="Omisiones">
        <div>
          <p className={`${VALUE} text-brand-gold`}>{metricas.omisiones}</p>
          <p className={HINT}>Requieren Ticket</p>
        </div>
      </MetricCard>
    </section>
  );
}
