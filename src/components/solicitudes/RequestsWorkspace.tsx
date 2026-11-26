"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  actualizarConfigVacacionesNominaAction,
  obtenerConfigVacacionesNominaAction,
} from "@/app/actions/configuracionSolicitudes";
import { useAuthRole } from "@/components/auth/AuthRoleContext";
import RequestForm from "@/components/solicitudes/RequestForm";

interface RequestsWorkspaceProps {
  /** Tarjetas de saldo (se renderizan siempre). */
  metrics: ReactNode;
  /** Historial de solicitudes (se renderiza siempre). */
  list: ReactNode;
  /** Saldo de vacaciones disponible del colaborador para validar en el formulario. */
  saldoVacaciones?: number;
  /** Fecha de ingreso del colaborador (`YYYY-MM-DD`) para cálculo de vacaciones extraordinarias proporcionales. */
  fechaIngreso?: string | null;
  /** Días de vacaciones ya comprometidos en solicitudes pendientes de autorización. */
  diasVacacionesPendientes?: number;
  /** Estado inicial del interruptor de excepción en semana de nómina controlado por RH. */
  excepcionVacacionesNominaInicial?: boolean;
  userId?: string;
}

export default function RequestsWorkspace({
  metrics,
  list,
  saldoVacaciones = 0,
  fechaIngreso = null,
  diasVacacionesPendientes = 0,
  excepcionVacacionesNominaInicial = false,
  userId,
}: RequestsWorkspaceProps) {
  const [abierto, setAbierto] = useState(false);
  const { esRecursosHumanos } = useAuthRole();
  const [excepcionNominaActiva, setExcepcionNominaActiva] = useState<boolean>(
    excepcionVacacionesNominaInicial
  );
  const [isTogglingExcepcion, setIsTogglingExcepcion] = useState(false);

  useEffect(() => {
    setExcepcionNominaActiva(excepcionVacacionesNominaInicial);
  }, [excepcionVacacionesNominaInicial]);

  useEffect(() => {
    if (!abierto) return;
    let cancelado = false;
    obtenerConfigVacacionesNominaAction()
      .then((cfg) => {
        if (!cancelado) {
          setExcepcionNominaActiva(Boolean(cfg.excepcionActiva));
        }
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [abierto]);

  return (
    <div className="flex flex-col px-12 py-8">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-black text-gray-900">
            Solicitudes
          </h1>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
            GESTIÓN OPERATIVA.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Interruptor exclusivo para Recursos Humanos (excepción en semanas de nómina 9-15 y 23-30) */}
          {esRecursosHumanos && (
            <div className="flex items-center gap-3 rounded-md border border-brand-gold/50 bg-brand-surface px-4 py-2 shadow-sm">
              <div className="flex flex-col">
                <span className="text-[8px] font-extrabold uppercase tracking-wider text-brand-gold">
                  INTERRUPTOR RH · EXCEPCIÓN ANTICIPACIÓN (10 DÍAS)
                </span>
                <span className="text-[10px] font-bold text-gray-800">
                  {excepcionNominaActiva
                    ? "Solicitudes sin anticipación: ACTIVAS"
                    : "Regla de 10 días de anticipación: ACTIVA"}
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={excepcionNominaActiva}
                disabled={isTogglingExcepcion}
                onClick={async () => {
                  if (isTogglingExcepcion) return;
                  const nuevoValor = !excepcionNominaActiva;
                  setIsTogglingExcepcion(true);
                  setExcepcionNominaActiva(nuevoValor);
                  const res =
                    await actualizarConfigVacacionesNominaAction(nuevoValor);
                  if (!res.ok) {
                    setExcepcionNominaActiva(!nuevoValor);
                  } else {
                    setExcepcionNominaActiva(res.config.excepcionActiva);
                  }
                  setIsTogglingExcepcion(false);
                }}
                aria-label="Habilitar excepción de solicitudes de vacaciones en semana de nómina"
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:cursor-wait disabled:opacity-60 ${
                  excepcionNominaActiva ? "bg-status-success" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    excepcionNominaActiva ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
          )}

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
        </div>
      </header>

      {metrics}

      <div id="form-nueva-solicitud">
        {abierto && (
          <RequestForm
            saldoVacaciones={saldoVacaciones}
            fechaIngreso={fechaIngreso}
            diasVacacionesPendientes={diasVacacionesPendientes}
            excepcionVacacionesNominaActiva={excepcionNominaActiva}
            userId={userId}
            onSubmit={() => setAbierto(false)}
          />
        )}
      </div>

      {list}
    </div>
  );
}
