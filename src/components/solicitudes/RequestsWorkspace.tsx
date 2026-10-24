"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import RequestForm from "@/components/solicitudes/RequestForm";

interface RequestsWorkspaceProps {
  /** Tarjetas de saldo (se renderizan siempre). */
  metrics: ReactNode;
  /** Historial de solicitudes (se renderiza siempre). */
  list: ReactNode;
  /** Saldo de vacaciones disponible del colaborador para validar en el formulario. */
  saldoVacaciones?: number;
  userId?: string;
}

export default function RequestsWorkspace({
  metrics,
  list,
  saldoVacaciones = 0,
  userId,
}: RequestsWorkspaceProps) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="flex flex-col px-12 py-8">
      <header className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="font-serif text-3xl font-black text-gray-900">
            Solicitudes
          </h1>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
            GESTIÓN OPERATIVA.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setAbierto((prev) => !prev)}
          aria-expanded={abierto}
          aria-controls="form-nueva-solicitud"
          className={`rounded-md bg-brand-dark px-5 py-2.5 text-xs font-bold uppercase tracking-widest transition-colors hover:bg-brand-dark/90 ${
            abierto ? "text-white" : "text-brand-gold"
          }`}
        >
          {abierto ? "CANCELAR" : "NUEVA SOLICITUD"}
        </button>
      </header>

      {metrics}

      <div id="form-nueva-solicitud">
        {abierto && (
          <RequestForm
            saldoVacaciones={saldoVacaciones}
            userId={userId}
            onSubmit={() => setAbierto(false)}
          />
        )}
      </div>

      {list}
    </div>
  );
}
