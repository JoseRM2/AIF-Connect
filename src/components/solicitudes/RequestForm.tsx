"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { TIPO_SOLICITUD_LABELS, TIPOS_SOLICITUD } from "@/lib/solicitudes";
import { createClient } from "@/lib/supabase/client";
import type { SolicitudFormData } from "@/types/solicitudes";

interface RequestFormProps {
  /** Saldo disponible en `colaboradores.saldo_vacaciones`. */
  saldoVacaciones?: number;
  /** Días de vacaciones ya comprometidos en solicitudes pendientes de autorización. */
  diasVacacionesPendientes?: number;
  userId?: string;
  onSubmit?: (data: SolicitudFormData) => void;
}

const INITIAL_STATE: SolicitudFormData = {
  tipo: "vacaciones",
  fecha_inicio: "",
  fecha_fin: "",
  motivo: "",
};

const LABEL =
  "mb-2 block text-[10px] font-bold uppercase tracking-widest text-gray-400";
const FIELD =
  "w-full rounded-md border border-gray-200 bg-brand-beige/50 text-xs focus:border-gray-400 focus:outline-none";

/**
 * Calcula los días naturales solicitados (inclusivo) usando UTC puro
 * para evitar desfases por zona horaria o cambios de horario de verano.
 */
export function calcularDiasSolicitados(
  fechaInicio: string,
  fechaFin: string
): number {
  if (!fechaInicio || !fechaFin) return 0;

  const [y1, m1, d1] = fechaInicio.split("-").map(Number);
  const [y2, m2, d2] = fechaFin.split("-").map(Number);
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return 0;

  const inicioUtc = Date.UTC(y1, m1 - 1, d1);
  const finUtc = Date.UTC(y2, m2 - 1, d2);
  if (finUtc < inicioUtc) return 0;

  const MS_POR_DIA = 86_400_000;
  return Math.round((finUtc - inicioUtc) / MS_POR_DIA) + 1;
}

const LIMITE_ANUAL_VACACIONES_PAGADAS = 10;
const MINIMO_DIAS_VACACIONES_PAGADAS = 5;

function esEstatusRechazado(estatus: string | null | undefined): boolean {
  const limpio = (estatus ?? "").trim().toLowerCase();
  return limpio.includes("rechaz") || limpio.includes("deneg");
}

function esEstatusPendienteVacaciones(estatus: string | null | undefined): boolean {
  const limpio = (estatus ?? "").trim().toLowerCase();
  if (!limpio) return true;
  if (
    esEstatusRechazado(limpio) ||
    limpio.includes("aprob") ||
    limpio.includes("complet")
  ) {
    return false;
  }
  return true;
}

function obtenerAnioFecha(fecha: string | null | undefined): string {
  const limpia = (fecha ?? "").trim();
  if (/^\d{4}/.test(limpia)) {
    return limpia.slice(0, 4);
  }
  return String(new Date().getFullYear());
}

interface SolicitudPrevRow {
  tipo_solicitud: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  estatus: string | null;
}

export default function RequestForm({
  saldoVacaciones = 0,
  diasVacacionesPendientes = 0,
  userId,
  onSubmit,
}: RequestFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<SolicitudFormData>(INITIAL_STATE);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saldoTotalActual, setSaldoTotalActual] =
    useState<number>(saldoVacaciones);
  const [diasPendientesActual, setDiasPendientesActual] = useState<number>(
    diasVacacionesPendientes
  );
  const [solicitudesPrevias, setSolicitudesPrevias] = useState<
    SolicitudPrevRow[]
  >([]);

  useEffect(() => {
    setSaldoTotalActual(saldoVacaciones);
  }, [saldoVacaciones]);

  useEffect(() => {
    setDiasPendientesActual(diasVacacionesPendientes);
  }, [diasVacacionesPendientes]);

  // Sincronizar en tiempo real el saldo y las solicitudes de vacaciones / vacaciones pagadas al abrir el formulario
  useEffect(() => {
    let cancelado = false;
    async function sincronizarDisponibilidad() {
      try {
        const supabase = createClient();
        let targetUserId = userId;
        if (!targetUserId) {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          targetUserId = user?.id;
        }
        if (!targetUserId || cancelado) return;

        const [colabRes, solRes] = await Promise.all([
          supabase
            .from("colaboradores")
            .select("saldo_vacaciones")
            .eq("id", targetUserId)
            .maybeSingle(),
          supabase
            .from("solicitudes")
            .select("tipo_solicitud, fecha_inicio, fecha_fin, estatus")
            .eq("colaborador_id", targetUserId)
            .in("tipo_solicitud", ["Vacaciones", "Vacaciones Pagadas"]),
        ]);

        if (cancelado) return;

        if (!colabRes.error && colabRes.data) {
          setSaldoTotalActual(Number(colabRes.data.saldo_vacaciones ?? 0));
        }

        if (!solRes.error && solRes.data) {
          setSolicitudesPrevias(solRes.data);
          const comprometidos = solRes.data.reduce((acum, fila) => {
            const tipoLimpio = (fila.tipo_solicitud ?? "").trim().toLowerCase();
            if (
              tipoLimpio === "vacaciones" &&
              esEstatusPendienteVacaciones(fila.estatus)
            ) {
              return (
                acum +
                calcularDiasSolicitados(fila.fecha_inicio, fila.fecha_fin)
              );
            }
            return acum;
          }, 0);
          setDiasPendientesActual(comprometidos);
        }
      } catch {
        // Conservar valores recibidos por props
      }
    }
    sincronizarDisponibilidad();
    return () => {
      cancelado = true;
    };
  }, [userId]);

  const saldoDisponibleEfectivo = useMemo(
    () => Math.max(0, saldoTotalActual - diasPendientesActual),
    [saldoTotalActual, diasPendientesActual]
  );

  const anioReferenciaPagadas = useMemo(
    () => obtenerAnioFecha(form.fecha_inicio),
    [form.fecha_inicio]
  );

  const diasVacacionesPagadasUsadosAnio = useMemo(() => {
    return solicitudesPrevias.reduce((acum, fila) => {
      const tipoLimpio = (fila.tipo_solicitud ?? "").trim().toLowerCase();
      if (
        tipoLimpio === "vacaciones pagadas" &&
        !esEstatusRechazado(fila.estatus) &&
        obtenerAnioFecha(fila.fecha_inicio) === anioReferenciaPagadas
      ) {
        return (
          acum + calcularDiasSolicitados(fila.fecha_inicio, fila.fecha_fin)
        );
      }
      return acum;
    }, 0);
  }, [solicitudesPrevias, anioReferenciaPagadas]);

  const disponiblesVacacionesPagadasAnio = useMemo(
    () =>
      Math.max(
        0,
        LIMITE_ANUAL_VACACIONES_PAGADAS - diasVacacionesPagadasUsadosAnio
      ),
    [diasVacacionesPagadasUsadosAnio]
  );

  const diasSolicitados = useMemo(
    () => calcularDiasSolicitados(form.fecha_inicio, form.fecha_fin),
    [form.fecha_inicio, form.fecha_fin]
  );

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setErrorMsg(null);
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMsg(null);

    if (!form.fecha_inicio || !form.fecha_fin) {
      setErrorMsg("Selecciona las fechas de inicio y fin de tu solicitud.");
      return;
    }

    if (diasSolicitados <= 0) {
      setErrorMsg(
        "La fecha de fin debe ser igual o posterior a la fecha de inicio."
      );
      return;
    }

    // Reglas de negocio para Vacaciones Pagadas (mínimo 5 días por solicitud, máximo 10 días por año)
    if (form.tipo === "vacaciones_pagadas") {
      if (diasSolicitados < MINIMO_DIAS_VACACIONES_PAGADAS) {
        setErrorMsg(
          `Las Vacaciones Pagadas requieren un mínimo de ${MINIMO_DIAS_VACACIONES_PAGADAS} días por solicitud (estás solicitando ${diasSolicitados} día(s)).`
        );
        return;
      }

      if (diasSolicitados > LIMITE_ANUAL_VACACIONES_PAGADAS) {
        setErrorMsg(
          `Las Vacaciones Pagadas tienen un límite máximo de ${LIMITE_ANUAL_VACACIONES_PAGADAS} días por año (estás solicitando ${diasSolicitados} días).`
        );
        return;
      }

      if (diasSolicitados > disponiblesVacacionesPagadasAnio) {
        setErrorMsg(
          `Límite anual de Vacaciones Pagadas excedido: solicitas ${diasSolicitados} día(s), pero ya tienes ${diasVacacionesPagadasUsadosAnio} día(s) registrados o en revisión en ${anioReferenciaPagadas} (límite anual: ${LIMITE_ANUAL_VACACIONES_PAGADAS} días, disponibles: ${disponiblesVacacionesPagadasAnio} día(s)).`
        );
        return;
      }
    }

    // Regla de negocio: Si pide Vacaciones, los días solicitados no pueden superar el saldo disponible descontando días pendientes de autorización
    if (
      form.tipo === "vacaciones" &&
      diasSolicitados > saldoDisponibleEfectivo
    ) {
      setErrorMsg(
        diasPendientesActual > 0
          ? `Saldo insuficiente: solicitas ${diasSolicitados} día(s) de vacaciones, pero tienes ${diasPendientesActual} día(s) en solicitudes pendientes de autorización (saldo total: ${saldoTotalActual}, disponible para solicitar: ${saldoDisponibleEfectivo} día(s)).`
          : `Saldo insuficiente: solicitas ${diasSolicitados} día(s) de vacaciones y tu saldo disponible es de ${saldoDisponibleEfectivo} día(s).`
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = createClient();
      let targetUserId = userId;
      if (!targetUserId) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        targetUserId = user?.id;
      }

      if (!targetUserId) {
        setErrorMsg("Tu sesión ha expirado. Inicia sesión nuevamente.");
        return;
      }

      // Verificación estricta contra base de datos antes de insertar para evitar saltar límites
      if (form.tipo === "vacaciones" || form.tipo === "vacaciones_pagadas") {
        const [colabRes, solRes] = await Promise.all([
          supabase
            .from("colaboradores")
            .select("saldo_vacaciones")
            .eq("id", targetUserId)
            .maybeSingle(),
          supabase
            .from("solicitudes")
            .select("tipo_solicitud, fecha_inicio, fecha_fin, estatus")
            .eq("colaborador_id", targetUserId)
            .in("tipo_solicitud", ["Vacaciones", "Vacaciones Pagadas"]),
        ]);

        const filasBD = solRes.data ?? [];
        setSolicitudesPrevias(filasBD);

        if (form.tipo === "vacaciones") {
          const saldoBD = Number(
            colabRes.data?.saldo_vacaciones ?? saldoTotalActual
          );
          const pendientesBD = filasBD.reduce((acum, fila) => {
            const tipoLimpio = (fila.tipo_solicitud ?? "").trim().toLowerCase();
            if (
              tipoLimpio === "vacaciones" &&
              esEstatusPendienteVacaciones(fila.estatus)
            ) {
              return (
                acum +
                calcularDiasSolicitados(fila.fecha_inicio, fila.fecha_fin)
              );
            }
            return acum;
          }, 0);
          const disponibleBD = Math.max(0, saldoBD - pendientesBD);

          setSaldoTotalActual(saldoBD);
          setDiasPendientesActual(pendientesBD);

          if (diasSolicitados > disponibleBD) {
            setErrorMsg(
              pendientesBD > 0
                ? `Saldo insuficiente: solicitas ${diasSolicitados} día(s) de vacaciones, pero tienes ${pendientesBD} día(s) en solicitudes pendientes de autorización (saldo total: ${saldoBD}, disponible para solicitar: ${disponibleBD} día(s)).`
                : `Saldo insuficiente: solicitas ${diasSolicitados} día(s) de vacaciones y tu saldo disponible es de ${disponibleBD} día(s).`
            );
            return;
          }
        } else if (form.tipo === "vacaciones_pagadas") {
          const anioSol = obtenerAnioFecha(form.fecha_inicio);
          const usadosPagadasBD = filasBD.reduce((acum, fila) => {
            const tipoLimpio = (fila.tipo_solicitud ?? "").trim().toLowerCase();
            if (
              tipoLimpio === "vacaciones pagadas" &&
              !esEstatusRechazado(fila.estatus) &&
              obtenerAnioFecha(fila.fecha_inicio) === anioSol
            ) {
              return (
                acum +
                calcularDiasSolicitados(fila.fecha_inicio, fila.fecha_fin)
              );
            }
            return acum;
          }, 0);
          const disponiblePagadasBD = Math.max(
            0,
            LIMITE_ANUAL_VACACIONES_PAGADAS - usadosPagadasBD
          );

          if (diasSolicitados > disponiblePagadasBD) {
            setErrorMsg(
              `Límite anual de Vacaciones Pagadas excedido: solicitas ${diasSolicitados} día(s), pero ya tienes ${usadosPagadasBD} día(s) registrados o en revisión en ${anioSol} (límite anual: ${LIMITE_ANUAL_VACACIONES_PAGADAS} días, disponibles: ${disponiblePagadasBD} día(s)).`
            );
            return;
          }
        }
      }

      const tipoSolicitudLabel = TIPO_SOLICITUD_LABELS[form.tipo];
      const estatusInicial =
        form.tipo === "incapacidad" || form.tipo === "vacaciones_pagadas"
          ? "Pendiente_RH"
          : "Pendiente_Jefe";

      const { error: insertError } = await supabase.from("solicitudes").insert({
        colaborador_id: targetUserId,
        tipo_solicitud: tipoSolicitudLabel,
        fecha_inicio: form.fecha_inicio,
        fecha_fin: form.fecha_fin,
        motivo: form.motivo.trim() || null,
        estatus: estatusInicial,
      });

      if (insertError) {
        setErrorMsg(
          `No se pudo registrar la solicitud: ${insertError.message}`
        );
        return;
      }

      if (form.tipo === "vacaciones") {
        setDiasPendientesActual((prev) => prev + diasSolicitados);
      }
      setSolicitudesPrevias((prev) => [
        ...prev,
        {
          tipo_solicitud: tipoSolicitudLabel,
          fecha_inicio: form.fecha_inicio,
          fecha_fin: form.fecha_fin,
          estatus: estatusInicial,
        },
      ]);

      const enviado = form;
      setForm(INITIAL_STATE);
      router.refresh();
      onSubmit?.(enviado);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Ocurrió un error al enviar la solicitud."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-8 flex flex-col gap-5 rounded-md border border-gray-100 bg-brand-surface p-6 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold text-gray-900">
          Crear Nueva Solicitud
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {form.tipo === "vacaciones_pagadas" ? (
            <>
              <span className="rounded-sm bg-brand-beige px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-700">
                Vacaciones Pagadas ({anioReferenciaPagadas}):{" "}
                {disponiblesVacacionesPagadasAnio} /{" "}
                {LIMITE_ANUAL_VACACIONES_PAGADAS} días disponibles
              </span>
              <span className="rounded-sm border border-brand-gold/40 bg-brand-beige/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-brand-dark">
                Mínimo {MINIMO_DIAS_VACACIONES_PAGADAS} días por solicitud
              </span>
            </>
          ) : (
            <>
              <span className="rounded-sm bg-brand-beige px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-700">
                Saldo disponible: {saldoDisponibleEfectivo}{" "}
                {saldoDisponibleEfectivo === 1 ? "día" : "días"}
              </span>
              {diasPendientesActual > 0 && (
                <span className="rounded-sm border border-status-warning/40 bg-status-warning/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-status-warning-dark">
                  En revisión: {diasPendientesActual}{" "}
                  {diasPendientesActual === 1 ? "día" : "días"}
                </span>
              )}
            </>
          )}
          {diasSolicitados > 0 && (
            <span className="rounded-sm bg-brand-dark px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-brand-gold">
              Solicitando: {diasSolicitados}{" "}
              {diasSolicitados === 1 ? "día" : "días"}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <label htmlFor="tipo" className={LABEL}>
            TIPO DE SOLICITUD
          </label>
          <select
            id="tipo"
            name="tipo"
            value={form.tipo}
            onChange={handleChange}
            className={`${FIELD} h-11 px-3 font-medium text-gray-800`}
          >
            {TIPOS_SOLICITUD.map((tipo) => (
              <option key={tipo} value={tipo}>
                {TIPO_SOLICITUD_LABELS[tipo]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span id="fechas-label" className={LABEL}>
            FECHAS
          </span>
          <div
            role="group"
            aria-labelledby="fechas-label"
            className="flex items-center gap-3"
          >
            <input
              type="date"
              name="fecha_inicio"
              aria-label="Fecha de inicio"
              value={form.fecha_inicio}
              onChange={handleChange}
              required
              className={`${FIELD} h-11 flex-1 px-3 text-gray-700`}
            />
            <span aria-hidden="true" className="font-bold text-gray-400">
              -
            </span>
            <input
              type="date"
              name="fecha_fin"
              aria-label="Fecha de fin"
              value={form.fecha_fin}
              min={form.fecha_inicio || undefined}
              onChange={handleChange}
              required
              className={`${FIELD} h-11 flex-1 px-3 text-gray-700`}
            />
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="motivo" className={LABEL}>
          COMENTARIOS ADICIONALES
        </label>
        <textarea
          id="motivo"
          name="motivo"
          value={form.motivo}
          onChange={handleChange}
          placeholder="Escribe aquí los motivos o detalles de tu solicitud..."
          className={`${FIELD} h-28 resize-y p-3 text-gray-800 placeholder-gray-400`}
        />
      </div>

      {errorMsg && (
        <p
          role="alert"
          className="rounded-sm border border-status-danger/30 bg-status-danger/10 px-3.5 py-2.5 text-xs font-semibold text-status-danger"
        >
          {errorMsg}
        </p>
      )}

      <div className="mt-2 flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-brand-dark px-6 py-3 text-xs font-bold uppercase tracking-widest text-brand-gold shadow-sm transition-colors hover:bg-brand-dark/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "GUARDANDO SOLICITUD..." : "ENVIAR SOLICITUD"}
        </button>
      </div>
    </form>
  );
}
