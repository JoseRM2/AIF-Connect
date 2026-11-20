"use client";

import { useState } from "react";
import GestionSolicitudesEquipo from "@/components/jefatura/GestionSolicitudesEquipo";
import MonitorAsistenciaEquipo from "@/components/jefatura/MonitorAsistenciaEquipo";

type TabJefatura = "solicitudes" | "asistencia";

export default function JefaturaWorkspace() {
  const [tabActiva, setTabActiva] = useState<TabJefatura>("solicitudes");

  return (
    <div className="flex flex-col gap-6">
      <div
        role="tablist"
        aria-label="Secciones de gestión de equipo"
        className="flex flex-wrap gap-2 border-b border-brand-dark/10 pb-3"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tabActiva === "solicitudes"}
          onClick={() => setTabActiva("solicitudes")}
          className={`rounded-sm px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-colors ${
            tabActiva === "solicitudes"
              ? "bg-brand-dark text-brand-gold shadow-sm"
              : "border border-gray-200 bg-brand-surface text-gray-600 hover:bg-brand-beige/40"
          }`}
        >
          Gestión de Solicitudes
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={tabActiva === "asistencia"}
          onClick={() => setTabActiva("asistencia")}
          className={`rounded-sm px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-colors ${
            tabActiva === "asistencia"
              ? "bg-brand-dark text-brand-gold shadow-sm"
              : "border border-gray-200 bg-brand-surface text-gray-600 hover:bg-brand-beige/40"
          }`}
        >
          Monitor de Asistencia
        </button>
      </div>

      {tabActiva === "solicitudes" ? (
        <GestionSolicitudesEquipo />
      ) : (
        <MonitorAsistenciaEquipo />
      )}
    </div>
  );
}
