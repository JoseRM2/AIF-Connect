"use client";

import { useEffect, useState } from "react";
import type { KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import TopBar from "@/components/layout/TopBar";
import ComunicadosTab from "@/components/rh/ComunicadosTab";
import DirectorioTab from "@/components/rh/DirectorioTab";
import GestionSolicitudesTab from "@/components/rh/GestionSolicitudesTab";
import MonitorAsistenciaTab from "@/components/rh/MonitorAsistenciaTab";

type TabId = "expedientes" | "solicitudes" | "asistencia" | "comunicados";

const TABS: { id: TabId; label: string }[] = [
  { id: "expedientes", label: "EXPEDIENTES & REPORTES" },
  { id: "solicitudes", label: "GESTIÓN DE SOLICITUDES" },
  { id: "asistencia", label: "MONITOR DE ASISTENCIA & TICKET" },
  { id: "comunicados", label: "COMUNICADOS & MURO" },
];

function esTabValida(valor: string | null): valor is TabId {
  return (
    valor === "expedientes" ||
    valor === "solicitudes" ||
    valor === "asistencia" ||
    valor === "comunicados"
  );
}

export default function RhPage() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<TabId>(() =>
    esTabValida(tabParam) ? tabParam : "expedientes"
  );

  useEffect(() => {
    if (esTabValida(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  // Navegación con flechas entre pestañas (patrón WAI-ARIA de tabs).
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const actual = TABS.findIndex((t) => t.id === activeTab);
    const paso = e.key === "ArrowRight" ? 1 : -1;
    const siguiente = TABS[(actual + paso + TABS.length) % TABS.length];
    setActiveTab(siguiente.id);
    document.getElementById(`tab-${siguiente.id}`)?.focus();
  };

  return (
    <div className="flex flex-col">
      <TopBar />

      <div className="flex flex-col px-8 py-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-brand-dark/10 pb-3">
          <div>
            <h1 className="font-serif text-2xl font-black text-gray-900">
              Administración RH
            </h1>
            <p className="mt-1 text-[8px] font-bold uppercase tracking-widest text-gray-700">
              GESTIÓN INTEGRAL DE PERSONAL, CONTROL DE GEOCERCAS Y ASISTENCIA.
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Secciones de administración RH"
            onKeyDown={handleKeyDown}
            className="flex flex-wrap gap-2"
          >
            {TABS.map(({ id, label }) => {
              const activa = id === activeTab;
              return (
                <button
                  key={id}
                  id={`tab-${id}`}
                  type="button"
                  role="tab"
                  aria-selected={activa}
                  aria-controls={`panel-${id}`}
                  tabIndex={activa ? 0 : -1}
                  onClick={() => setActiveTab(id)}
                  className={`rounded-sm px-3 py-1.5 text-[8px] font-bold uppercase tracking-wider transition-colors ${
                    activa
                      ? "bg-brand-dark text-brand-gold shadow-sm"
                      : "border border-gray-300 bg-brand-surface text-gray-800 hover:bg-brand-beige/60"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </header>

        <div
          role="tabpanel"
          id={`panel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
        >
          {activeTab === "expedientes" && <DirectorioTab />}
          {activeTab === "solicitudes" && <GestionSolicitudesTab />}
          {activeTab === "asistencia" && <MonitorAsistenciaTab />}
          {activeTab === "comunicados" && <ComunicadosTab />}
        </div>
      </div>
    </div>
  );
}
