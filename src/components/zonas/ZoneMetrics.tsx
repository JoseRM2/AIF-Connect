import type { ReactNode } from "react";
import {
  BuildingIcon,
  CompassIcon,
  HomeIcon,
  MapPinIcon,
} from "@/components/ui/icons";
import type { Zona } from "@/types/zonas";

interface MetricCardProps {
  label: string;
  value: ReactNode;
  valueClassName?: string;
  caption: ReactNode;
  icon: ReactNode;
  iconClassName: string;
}

function MetricCard({
  label,
  value,
  valueClassName = "text-3xl",
  caption,
  icon,
  iconClassName,
}: MetricCardProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-brand-surface p-5 shadow-sm">
      <div className="min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">
          {label}
        </p>
        <p className={`font-serif font-black text-gray-900 ${valueClassName}`}>
          {value}
        </p>
        {caption}
      </div>
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconClassName}`}
      >
        {icon}
      </div>
    </div>
  );
}

export default function ZoneMetrics({ zonas }: { zonas: Zona[] }) {
  const activas = zonas.filter((z) => z.estatus === "activa").length;
  const homeOffices = zonas.filter((z) => z.tipo === "home_office").length;
  const sedes = zonas.filter((z) => z.tipo === "oficina");
  const empresasSedes = Array.from(new Set(sedes.map((z) => z.empresa))).join(" & ");
  const radioPromedio = zonas.length
    ? Math.round(zonas.reduce((sum, z) => sum + z.radio_m, 0) / zonas.length)
    : 0;

  return (
    <section
      aria-label="Resumen de zonas"
      className="mb-8 grid grid-cols-2 gap-6 xl:grid-cols-4"
    >
      <MetricCard
        label="ZONAS REGISTRADAS"
        value={zonas.length}
        caption={
          <p className="text-[10px] font-bold text-status-success-dark">
            {activas} {activas === 1 ? "Activa" : "Activas"}
          </p>
        }
        icon={<MapPinIcon className="h-5 w-5" />}
        iconClassName="bg-gray-100 text-gray-600"
      />
      <MetricCard
        label="HOME OFFICES"
        value={homeOffices}
        caption={
          <p className="text-[10px] text-gray-400">
            Asignados a Colaboradores
          </p>
        }
        icon={<HomeIcon className="h-5 w-5" />}
        iconClassName="bg-status-info/10 text-status-info"
      />
      <MetricCard
        label="SEDES CORPORATIVAS"
        value={sedes.length}
        caption={
          <p className="text-[10px] text-gray-400">
            {empresasSedes || "Sin sedes registradas"}
          </p>
        }
        icon={<BuildingIcon className="h-5 w-5" />}
        iconClassName="bg-stone-100 text-stone-700"
      />
      <MetricCard
        label="RADIO PROMEDIO"
        value={`${radioPromedio} metros`}
        valueClassName="text-2xl"
        caption={
          <p className="text-[9px] font-bold uppercase tracking-widest text-brand-gold">
            TOLERANCIA GEOCERCA
          </p>
        }
        icon={<CompassIcon className="h-5 w-5" />}
        iconClassName="bg-brand-gold/10 text-brand-gold"
      />
    </section>
  );
}
