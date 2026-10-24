"use client";

import dynamic from "next/dynamic";
import { formatCoordenada } from "@/lib/zonas";
import type { Zona } from "@/types/zonas";

const ZoneLocationPicker = dynamic(
  () => import("@/components/zonas/ZoneLocationPicker"),
  {
    ssr: false,
    loading: () => (
      <div className="h-80 w-full animate-pulse rounded-sm border border-gray-200 bg-brand-beige/60" />
    ),
  }
);

const LABEL = "text-[9px] font-bold uppercase tracking-widest text-gray-400";

export default function ZoneMapPanel({ zona }: { zona: Zona | null }) {
  return (
    <section className="flex flex-col rounded-md bg-brand-surface p-5 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-brand-gold">
            VISUALIZACIÓN ESPACIAL GEOCERCADA
          </p>
          <h2 className="text-sm font-bold text-gray-900">
            {zona ? zona.titulo : "Sin zona seleccionada"}
          </h2>
        </div>
        {zona && (
          <span className="shrink-0 rounded-sm bg-brand-beige px-3 py-1 text-[10px] font-bold uppercase text-gray-800">
            RADIO DE TOLERANCIA: {zona.radio_m} METROS
          </span>
        )}
      </div>

      {zona ? (
        <ZoneLocationPicker
          lat={zona.lat}
          lng={zona.lng}
          radioM={zona.radio_m}
          heightClass="h-80"
        />
      ) : (
        <div
          role="img"
          aria-label="Sin zona seleccionada"
          className="relative flex h-80 w-full items-center justify-center overflow-hidden rounded-sm border border-gray-200 bg-brand-beige/40"
        >
          <p className="text-xs font-semibold text-gray-400">
            Selecciona una zona autorizada del catálogo izquierdo para
            visualizarla en el mapa.
          </p>
        </div>
      )}

      {zona && (
        <dl className="mt-3 grid grid-cols-1 gap-4 border-t border-gray-100 pt-3 md:grid-cols-3">
          <div>
            <dt className={LABEL}>DIRECCIÓN OFICIAL</dt>
            <dd className="mt-1 text-[10px] font-semibold text-gray-700">
              {zona.direccion}
            </dd>
          </div>
          <div>
            <dt className={LABEL}>COORDENADAS EXACTAS</dt>
            <dd className="mt-1 font-mono text-[10px] text-gray-700">
              Lat: {formatCoordenada(zona.lat, 6)}
              <br />
              Lng: {formatCoordenada(zona.lng, 6)}
            </dd>
          </div>
          <div>
            <dt className={LABEL}>CRITERIO DE EVALUACIÓN</dt>
            <dd className="mt-1 text-[10px] text-gray-500">
              Si el marcaje excede {zona.radio_m} m del punto central, se
              clasifica como Fuera de Rango y se reporta a RH.
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
