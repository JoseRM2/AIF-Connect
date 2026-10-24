import {
  BuildingIcon,
  CompassIcon,
  HomeIcon,
  PencilIcon,
  TrashIcon,
  UserIcon,
} from "@/components/ui/icons";
import { formatCoordenada } from "@/lib/zonas";
import type { Zona } from "@/types/zonas";

interface ZoneCardProps {
  zona: Zona;
  seleccionada: boolean;
  onSeleccionar: (id: string) => void;
  onEditar: (id: string) => void;
  onEliminar: (id: string) => void;
}

export default function ZoneCard({
  zona,
  seleccionada,
  onSeleccionar,
  onEditar,
  onEliminar,
}: ZoneCardProps) {
  const esHome = zona.tipo === "home_office";
  const activa = zona.estatus === "activa";

  return (
    <article
      className={`relative rounded-md border bg-brand-surface p-4 shadow-sm transition-colors ${
        seleccionada ? "border-brand-gold" : "border-gray-100"
      }`}
    >
      {/* Zona seleccionable (solo contenido en línea dentro del botón) */}
      <button
        type="button"
        onClick={() => onSeleccionar(zona.id)}
        aria-pressed={seleccionada}
        className="block w-full text-left"
      >
        <span className="flex items-start justify-between gap-3">
          <span className="flex items-center gap-3">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                esHome
                  ? "bg-status-info/10 text-status-info"
                  : "bg-brand-dark text-brand-gold"
              }`}
            >
              {esHome ? (
                <HomeIcon className="h-4 w-4" />
              ) : (
                <BuildingIcon className="h-4 w-4" />
              )}
            </span>
            <span className="text-xs font-bold text-gray-900">
              {zona.titulo}
            </span>
            <span className="rounded-sm border border-gray-200 px-1.5 py-0.5 text-[8px] font-bold text-gray-500">
              {zona.empresa}
            </span>
          </span>
          <span
            className={`shrink-0 rounded border px-2 py-0.5 text-[9px] font-bold uppercase ${
              activa
                ? "border-status-success/30 bg-status-success/10 text-status-success-dark"
                : "border-gray-200 bg-gray-50 text-gray-500"
            }`}
          >
            {activa ? "ACTIVA" : "INACTIVA"}
          </span>
        </span>

        {esHome && zona.colaborador && (
          <span className="mt-3 flex items-center gap-1.5 text-[10px] text-gray-500">
            <UserIcon className="h-3 w-3" />
            <span>
              <strong className="font-bold text-gray-700">
                {zona.colaborador.nombre}
              </strong>{" "}
              ·{" "}
              <span className="text-brand-gold">{zona.colaborador.puesto}</span>
            </span>
          </span>
        )}

        <span className="mt-1.5 block text-[11px] text-gray-500">
          {zona.direccion}
        </span>
      </button>

      <div className="mt-3 flex items-center justify-between border-t border-gray-50 pt-2">
        <div className="flex flex-wrap items-center gap-3 text-[10px] text-gray-500">
          <span className="flex items-center gap-1">
            <CompassIcon className="h-3 w-3" />
            Radio: {zona.radio_m} m
          </span>
          <span className="font-mono">
            Lat: {formatCoordenada(zona.lat)}, Lng: {formatCoordenada(zona.lng)}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => onEditar(zona.id)}
            aria-label={`Editar ${zona.titulo}`}
            className="cursor-pointer text-gray-400 transition-colors hover:text-gray-700"
          >
            <PencilIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onEliminar(zona.id)}
            aria-label={`Eliminar ${zona.titulo}`}
            className="cursor-pointer text-status-danger transition-colors hover:text-status-danger-dark"
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </article>
  );
}
