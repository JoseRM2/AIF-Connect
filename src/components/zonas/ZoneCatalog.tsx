"use client";

import { useMemo, useState } from "react";
import ZoneCard from "@/components/zonas/ZoneCard";
import { LayersIcon, SearchIcon } from "@/components/ui/icons";
import { normalizar } from "@/lib/texto";
import { colaboradoresDeZonas } from "@/lib/zonas";
import type { Zona } from "@/types/zonas";

interface ZoneCatalogProps {
  zonas: Zona[];
  seleccionadaId: string | null;
  onSeleccionar: (id: string) => void;
  onEditar: (id: string) => void;
  onEliminar: (id: string) => void;
}

const TODOS = "todos";

const FILTER_LABEL =
  "mb-1 block text-[8px] font-bold uppercase tracking-widest text-gray-400";
const FIELD =
  "h-9 w-full rounded border border-gray-200 bg-brand-beige/50 text-xs text-gray-700 focus:border-gray-400 focus:outline-none";

export default function ZoneCatalog({
  zonas,
  seleccionadaId,
  onSeleccionar,
  onEditar,
  onEliminar,
}: ZoneCatalogProps) {
  const [colaboradorId, setColaboradorId] = useState(TODOS);
  const [empresa, setEmpresa] = useState(TODOS);
  const [busqueda, setBusqueda] = useState("");

  const colaboradores = useMemo(() => colaboradoresDeZonas(zonas), [zonas]);
  const empresas = useMemo(
    () => Array.from(new Set(zonas.map((z) => z.empresa))),
    [zonas],
  );

  const filtradas = useMemo(() => {
    const termino = normalizar(busqueda.trim());
    return zonas.filter((z) => {
      if (colaboradorId !== TODOS && z.colaborador?.id !== colaboradorId)
        return false;
      if (empresa !== TODOS && z.empresa !== empresa) return false;
      if (!termino) return true;
      return normalizar(`${z.titulo} ${z.direccion}`).includes(termino);
    });
  }, [zonas, colaboradorId, empresa, busqueda]);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 rounded-md bg-brand-surface p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LayersIcon className="h-4 w-4 text-brand-gold" />
            <h2 className="text-sm font-bold text-gray-900">
              Catálogo de Zonas
            </h2>
          </div>
          <span className="text-xs text-gray-400" aria-live="polite">
            {filtradas.length} resultado(s)
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="filtro-colaborador" className={FILTER_LABEL}>
              FILTRAR COLABORADOR
            </label>
            <select
              id="filtro-colaborador"
              value={colaboradorId}
              onChange={(e) => setColaboradorId(e.target.value)}
              className={`${FIELD} px-2`}
            >
              <option value={TODOS}>Todos</option>
              {colaboradores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filtro-empresa" className={FILTER_LABEL}>
              EMPRESA
            </label>
            <select
              id="filtro-empresa"
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
              className={`${FIELD} px-2`}
            >
              <option value={TODOS}>Todas</option>
              {empresas.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="relative w-full">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, dirección o colonia..."
            aria-label="Buscar zonas"
            className={`${FIELD} pl-8 pr-3 placeholder-gray-400`}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {filtradas.length === 0 && (
          <p className="rounded-md bg-brand-surface p-6 text-center text-xs text-gray-400 shadow-sm">
            No hay zonas que coincidan con los filtros.
          </p>
        )}
        {filtradas.map((zona) => (
          <ZoneCard
            key={zona.id}
            zona={zona}
            seleccionada={zona.id === seleccionadaId}
            onSeleccionar={onSeleccionar}
            onEditar={onEditar}
            onEliminar={onEliminar}
          />
        ))}
      </div>
    </div>
  );
}
