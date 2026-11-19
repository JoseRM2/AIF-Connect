"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { obtenerFeriadosDinamicosAction } from "@/app/actions/calendario";
import { obtenerConfigVacacionesNominaAction } from "@/app/actions/configuracionSolicitudes";
import {
  calcularDiasEfectivosSinFeriados,
  type FeriadoEmpresaItem,
} from "@/lib/calendario";
import {
  formatearMotivoConMedioDia,
  TIPO_SOLICITUD_LABELS,
  TIPOS_SOLICITUD,
  validarRestriccionSemanaNomina,
} from "@/lib/solicitudes";
import { createClient } from "@/lib/supabase/client";
import type { SolicitudFormData } from "@/types/solicitudes";

interface RequestFormProps {
  /** Saldo disponible en `colaboradores.saldo_vacaciones`. */
  saldoVacaciones?: number;
  /** Días de vacaciones ya comprometidos en solicitudes pendientes de autorización. */
  diasVacacionesPendientes?: number;
  /** Interruptor controlado por RH para permitir vacaciones en semanas de nómina (9-15 y 23-30 del mismo mes). */
  excepcionVacacionesNominaActiva?: boolean;
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
  return (
    limpio.includes("rechaz") ||
    limpio.includes("deneg") ||
    limpio.includes("cancelad")
  );
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
  motivo?: string | null;
  estatus: string | null;
}

export default function RequestForm({
  saldoVacaciones = 0,
  diasVacacionesPendientes = 0,
  excepcionVacacionesNominaActiva = false,
  userId,
  onSubmit,
}: RequestFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<SolicitudFormData>(INITIAL_STATE);
  const [esMedioDia, setEsMedioDia] = useState<boolean>(false);
  const [jornadaMedioDia, setJornadaMedioDia] = useState<
    "Matutino" | "Vespertino"
  >("Matutino");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const enProcesoRef = useRef(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saldoTotalActual, setSaldoTotalActual] =
    useState<number>(saldoVacaciones);
  const [diasPendientesActual, setDiasPendientesActual] = useState<number>(
    diasVacacionesPendientes
  );
  const [excepcionNominaActiva, setExcepcionNominaActiva] = useState<boolean>(
    excepcionVacacionesNominaActiva
  );
  const [solicitudesPrevias, setSolicitudesPrevias] = useState<
    SolicitudPrevRow[]
  >([]);
  const [feriadosDinamicos, setFeriadosDinamicos] = useState<
    FeriadoEmpresaItem[]
  >([]);
  const [empresaColaborador, setEmpresaColaborador] = useState<string>("AIF");

  useEffect(() => {
    setSaldoTotalActual(saldoVacaciones);
  }, [saldoVacaciones]);

  useEffect(() => {
    setDiasPendientesActual(diasVacacionesPendientes);
  }, [diasVacacionesPendientes]);

  useEffect(() => {
    setExcepcionNominaActiva(excepcionVacacionesNominaActiva);
  }, [excepcionVacacionesNominaActiva]);

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

        const [colabRes, solRes, cfgNomina, feriadosRes] = await Promise.all([
          supabase
            .from("colaboradores")
            .select("saldo_vacaciones, empresa")
            .eq("id", targetUserId)
            .maybeSingle(),
          supabase
            .from("solicitudes")
            .select("tipo_solicitud, fecha_inicio, fecha_fin, motivo, estatus")
            .eq("colaborador_id", targetUserId)
            .in("tipo_solicitud", ["Vacaciones", "Vacaciones Pagadas"]),
          obtenerConfigVacacionesNominaAction(),
          obtenerFeriadosDinamicosAction(),
        ]);

        if (cancelado) return;

        setExcepcionNominaActiva(Boolean(cfgNomina?.excepcionActiva));
        const listaFeriados = Array.isArray(feriadosRes) ? feriadosRes : [];
        setFeriadosDinamicos(listaFeriados);

        const empActual = colabRes.data?.empresa?.trim() || "AIF";
        setEmpresaColaborador(empActual);

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
                calcularDiasEfectivosSinFeriados(
                  fila.fecha_inicio,
                  fila.fecha_fin,
                  listaFeriados,
                  empActual,
                  fila.motivo
                ).diasEfectivos
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
    () => Math.round((saldoTotalActual - diasPendientesActual) * 100) / 100,
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

  const calculoRangoActual = useMemo(
    () =>
      calcularDiasEfectivosSinFeriados(
        form.fecha_inicio,
        form.fecha_fin,
        feriadosDinamicos,
        empresaColaborador
      ),
    [form.fecha_inicio, form.fecha_fin, feriadosDinamicos, empresaColaborador]
  );

  const permiteMedioDia =
    form.tipo === "vacaciones" ||
    form.tipo === "permiso_con_goce" ||
    form.tipo === "permiso_sin_goce";

  const medioDiaEfectivo = permiteMedioDia && esMedioDia;

  const diasSolicitados = useMemo(() => {
    if (medioDiaEfectivo && form.fecha_inicio) {
      return calculoRangoActual.diasEfectivos > 0 ? 0.5 : 0;
    }
    return form.tipo === "vacaciones"
      ? calculoRangoActual.diasEfectivos
      : calcularDiasSolicitados(form.fecha_inicio, form.fecha_fin);
  }, [
    medioDiaEfectivo,
    form.tipo,
    calculoRangoActual.diasEfectivos,
    form.fecha_inicio,
    form.fecha_fin,
  ]);

  const esSolicitudVacaciones =
    form.tipo === "vacaciones" || form.tipo === "vacaciones_pagadas";

  const errorSemanaNomina = useMemo(() => {
    if (!esSolicitudVacaciones) return null;
    return validarRestriccionSemanaNomina(
      form.fecha_inicio,
      form.fecha_fin,
      excepcionNominaActiva
    );
  }, [
    esSolicitudVacaciones,
    form.fecha_inicio,
    form.fecha_fin,
    excepcionNominaActiva,
  ]);

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setErrorMsg(null);
    if (
      name === "tipo" &&
      value !== "vacaciones" &&
      value !== "permiso_con_goce" &&
      value !== "permiso_sin_goce"
    ) {
      setEsMedioDia(false);
    }
    setForm((prev) => {
      // Si está activo Medio Día o si fecha_fin está vacía / es anterior, igualar fecha_fin a fecha_inicio
      if (
        name === "fecha_inicio" &&
        value &&
        (esMedioDia || !prev.fecha_fin || prev.fecha_fin < value)
      ) {
        return { ...prev, fecha_inicio: value, fecha_fin: value };
      }
      if (name === "fecha_fin" && esMedioDia && prev.fecha_inicio) {
        return { ...prev, fecha_fin: prev.fecha_inicio };
      }
      return { ...prev, [name]: value };
    });
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting || enProcesoRef.current) return;
    setErrorMsg(null);

    const fechaInicioEfectiva = form.fecha_inicio.trim();
    const fechaFinEfectiva = (form.fecha_fin || form.fecha_inicio).trim();

    if (!fechaInicioEfectiva || !fechaFinEfectiva) {
      setErrorMsg("Selecciona las fechas de inicio y fin de tu solicitud.");
      return;
    }

    if (fechaFinEfectiva < fechaInicioEfectiva) {
      setErrorMsg(
        "La fecha de fin debe ser igual o posterior a la fecha de inicio."
      );
      return;
    }

    if (diasSolicitados <= 0) {
      setErrorMsg(
        "El día seleccionado corresponde a un día feriado inhábil (no requiere descontar vacaciones)."
      );
      return;
    }

    // Regla de negocio: Límite de semana de nómina (del 9 al 15 y del 23 al 30 del mismo mes)
    if (esSolicitudVacaciones && errorSemanaNomina) {
      setErrorMsg(errorSemanaNomina);
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

    enProcesoRef.current = true;
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
        const [colabRes, solRes, cfgNominaActual] = await Promise.all([
          supabase
            .from("colaboradores")
            .select("saldo_vacaciones")
            .eq("id", targetUserId)
            .maybeSingle(),
          supabase
            .from("solicitudes")
            .select("tipo_solicitud, fecha_inicio, fecha_fin, motivo, estatus")
            .eq("colaborador_id", targetUserId)
            .in("tipo_solicitud", ["Vacaciones", "Vacaciones Pagadas"]),
          obtenerConfigVacacionesNominaAction(),
        ]);

        const excepcionBD = Boolean(cfgNominaActual?.excepcionActiva);
        setExcepcionNominaActiva(excepcionBD);

        const bloqueoNominaBD = validarRestriccionSemanaNomina(
          form.fecha_inicio,
          form.fecha_fin,
          excepcionBD
        );
        if (bloqueoNominaBD) {
          setErrorMsg(bloqueoNominaBD);
          return;
        }

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
                calcularDiasEfectivosSinFeriados(
                  fila.fecha_inicio,
                  fila.fecha_fin,
                  feriadosDinamicos,
                  empresaColaborador,
                  fila.motivo
                ).diasEfectivos
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
      const estatusInicial: "Pendiente_RH" | "Pendiente_Jefe" =
        form.tipo === "incapacidad" || form.tipo === "vacaciones_pagadas"
          ? "Pendiente_RH"
          : "Pendiente_Jefe";

      const motivoFinal = formatearMotivoConMedioDia(
        form.motivo,
        medioDiaEfectivo,
        jornadaMedioDia
      );
      const fechaFinGuardar = medioDiaEfectivo
        ? form.fecha_inicio
        : form.fecha_fin || form.fecha_inicio;

      const payloadBaseSolicitud = {
        colaborador_id: targetUserId,
        tipo_solicitud: tipoSolicitudLabel,
        fecha_inicio: form.fecha_inicio,
        fecha_fin: fechaFinGuardar,
        motivo: motivoFinal,
        estatus: estatusInicial,
      };

      let { error: insertError } = await supabase
        .from("solicitudes")
        .insert(payloadBaseSolicitud);

      // Si el esquema exige `dias_solicitados` como NOT NULL, reintentar incluyéndolo
      if (
        insertError &&
        /dias_solicitados/i.test(insertError.message) &&
        /null value|not-null/i.test(insertError.message)
      ) {
        const retry = await supabase.from("solicitudes").insert({
          ...payloadBaseSolicitud,
          dias_solicitados: Math.max(1, diasSolicitados),
        });
        insertError = retry.error;
      }

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
          fecha_fin: fechaFinGuardar,
          motivo: motivoFinal,
          estatus: estatusInicial,
        },
      ]);

      const enviado = form;
      setForm(INITIAL_STATE);
      setEsMedioDia(false);
      router.refresh();
      onSubmit?.(enviado);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Ocurrió un error al enviar la solicitud."
      );
    } finally {
      enProcesoRef.current = false;
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

      {form.tipo === "vacaciones" &&
        calculoRangoActual.feriadosEnRango.length > 0 && (
          <div className="rounded-sm border border-status-info/40 bg-status-info/10 px-4 py-2.5 text-xs font-medium text-status-info-dark">
            ✓ El rango seleccionado incluye{" "}
            <strong>
              {calculoRangoActual.feriadosEnRango.length}{" "}
              {calculoRangoActual.feriadosEnRango.length === 1
                ? "día feriado"
                : "días feriados"}
            </strong>{" "}
            (
            {calculoRangoActual.feriadosEnRango
              .map((f) => `${f.titulo} [${f.fecha}]`)
              .join(", ")}
            ), los cuales <strong>no se descuentan</strong> de tu saldo de vacaciones.
          </div>
        )}

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
              value={medioDiaEfectivo ? form.fecha_inicio : form.fecha_fin}
              min={form.fecha_inicio || undefined}
              disabled={medioDiaEfectivo}
              onChange={handleChange}
              required
              className={`${FIELD} h-11 flex-1 px-3 text-gray-700 disabled:cursor-not-allowed disabled:opacity-60`}
            />
          </div>

          {permiteMedioDia && (
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-brand-gold/40 bg-brand-beige/35 px-3 py-2">
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-bold text-gray-800">
                <input
                  type="checkbox"
                  checked={esMedioDia}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setEsMedioDia(checked);
                    if (checked && form.fecha_inicio) {
                      setForm((prev) => ({
                        ...prev,
                        fecha_fin: prev.fecha_inicio,
                      }));
                    }
                  }}
                  className="h-4 w-4 accent-brand-dark"
                />
                <span>Solicitar medio día (0.5 días)</span>
              </label>

              {esMedioDia && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    TURNO:
                  </span>
                  <select
                    value={jornadaMedioDia}
                    onChange={(e) =>
                      setJornadaMedioDia(
                        e.target.value as "Matutino" | "Vespertino"
                      )
                    }
                    className="h-7 rounded-sm border border-gray-300 bg-brand-surface px-2 text-[11px] font-bold text-gray-900"
                  >
                    <option value="Matutino">Matutino (Mañana)</option>
                    <option value="Vespertino">Vespertino (Tarde)</option>
                  </select>
                </div>
              )}
            </div>
          )}
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

      {esSolicitudVacaciones && (
        <div
          className={`flex flex-wrap items-center justify-between gap-2 rounded-sm border px-3.5 py-2 text-[10px] font-semibold ${
            excepcionNominaActiva
              ? "border-status-success/40 bg-status-success/10 text-status-success-dark"
              : "border-brand-gold/40 bg-brand-beige/40 text-gray-800"
          }`}
        >
          <span>
            {excepcionNominaActiva
              ? "✓ Excepción extraordinaria de RH activa: Se permiten solicitar días de vacaciones durante los 5 días hábiles previos a quincena."
              : "Regla de nómina: Puedes registrar solicitudes en cualquier fecha, pero los días de vacaciones solicitados no pueden caer dentro de los 5 días hábiles previos a cada quincena (días 15 y 30)."}
          </span>
        </div>
      )}

      {errorSemanaNomina && !errorMsg && (
        <p
          role="alert"
          className="rounded-sm border border-status-danger/30 bg-status-danger/10 px-3.5 py-2.5 text-xs font-semibold text-status-danger"
        >
          {errorSemanaNomina}
        </p>
      )}

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
