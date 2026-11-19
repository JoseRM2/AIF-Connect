"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { obtenerFeriadosDinamicosAction } from "@/app/actions/calendario";
import {
  actualizarConfigVacacionesNominaAction,
  obtenerConfigVacacionesNominaAction,
} from "@/app/actions/configuracionSolicitudes";
import { calcularDiasEfectivosSinFeriados } from "@/lib/calendario";
import {
  esSolicitudCancelada,
  esSolicitudMedioDia,
  extraerMotivoCancelacion,
  formatearMotivoConMedioDia,
} from "@/lib/solicitudes";
import { createClient } from "@/lib/supabase/client";
import type { EstatusSolicitud } from "@/types/solicitudes";
import type {
  TipoAsignacionDirectaRh,
  VacacionesPagadasForm,
} from "@/types/rh";

interface ColaboradorRelacion {
  nombre_completo: string;
  saldo_vacaciones?: number | null;
}

interface SolicitudConColaborador {
  id: string;
  colaborador_id: string;
  tipo_solicitud: string;
  fecha_inicio: string;
  fecha_fin: string;
  motivo: string | null;
  estatus: EstatusSolicitud;
  created_at: string;
  colaboradores: ColaboradorRelacion | ColaboradorRelacion[] | null;
}

interface ColaboradorCatalogo {
  id: string;
  nombre_completo: string;
  empresa?: string | null;
  saldo_vacaciones?: number | null;
}

const ESTATUS_BADGE: Record<
  EstatusSolicitud,
  { label: string; className: string }
> = {
  Pendiente_Jefe: {
    label: "Pendiente (Jefe)",
    className:
      "border-status-warning bg-status-warning/10 text-status-warning-dark",
  },
  Aprobado_Jefe: {
    label: "Aprobado (Jefe)",
    className: "border-status-info bg-status-info/10 text-status-info-dark",
  },
  Pendiente_RH: {
    label: "Pendiente (RH)",
    className:
      "border-status-warning-dark bg-status-warning/20 text-status-warning-dark",
  },
  Rechazado: {
    label: "Rechazado",
    className:
      "border-status-danger bg-status-danger/10 text-status-danger-dark",
  },
  Completado: {
    label: "Completado",
    className:
      "border-status-success bg-status-success/10 text-status-success-dark",
  },
  Cancelado: {
    label: "Solicitud Cancelada",
    className: "border-gray-400 bg-gray-100 text-gray-700",
  },
};

const FORM_INICIAL: VacacionesPagadasForm = {
  colaborador_id: "",
  tipo_solicitud: "Vacaciones Pagadas",
  fecha_inicio: "",
  fecha_fin: "",
  dias_a_pagar: 5,
  motivo: "",
};

const LIMITE_ANUAL_VACACIONES_PAGADAS = 10;
const MINIMO_DIAS_VACACIONES_PAGADAS = 5;

function obtenerAnioFecha(fecha: string | null | undefined): string {
  const limpia = (fecha ?? "").trim();
  if (/^\d{4}/.test(limpia)) return limpia.slice(0, 4);
  return String(new Date().getFullYear());
}

const LABEL =
  "mb-1 block text-[8px] font-bold uppercase tracking-wider text-gray-800";
const FIELD =
  "h-9 w-full rounded-sm border border-gray-300 bg-brand-surface px-3 text-xs font-medium text-gray-900 focus:border-brand-dark focus:outline-none";

function normalizarEstatus(
  raw: string | null | undefined,
  motivo?: string | null
): EstatusSolicitud {
  if (esSolicitudCancelada(raw, motivo)) {
    return "Cancelado";
  }
  const valor = (raw ?? "").trim();
  if (
    valor === "Pendiente_Jefe" ||
    valor === "Aprobado_Jefe" ||
    valor === "Pendiente_RH" ||
    valor === "Rechazado" ||
    valor === "Completado" ||
    valor === "Cancelado"
  ) {
    return valor;
  }

  const limpio = valor.toLowerCase();
  if (limpio === "aprobado_jefe") return "Aprobado_Jefe";
  if (limpio === "pendiente_rh") return "Pendiente_RH";
  if (limpio.includes("complet") || limpio.includes("aprob")) {
    return "Completado";
  }
  if (limpio.includes("rechaz") || limpio.includes("deneg")) {
    return "Rechazado";
  }
  return "Pendiente_Jefe";
}

function obtenerNombreColaborador(
  rel: ColaboradorRelacion | ColaboradorRelacion[] | null | undefined
): string {
  if (!rel) return "Colaborador";
  if (Array.isArray(rel)) {
    return rel[0]?.nombre_completo || "Colaborador";
  }
  return rel.nombre_completo || "Colaborador";
}

function obtenerSaldoColaborador(
  rel: ColaboradorRelacion | ColaboradorRelacion[] | null | undefined
): number {
  if (!rel) return 0;
  if (Array.isArray(rel)) {
    return rel[0]?.saldo_vacaciones ?? 0;
  }
  return rel.saldo_vacaciones ?? 0;
}

/**
 * Calcula los días inclusivos entre fecha_inicio y fecha_fin usando milisegundos UTC.
 * Ej: del 10 al 11 son 2 días.
 */
function calcularDiasSolicitados(
  fechaInicio: string,
  fechaFin: string
): number {
  if (!fechaInicio || !fechaFin) return 0;

  const [y1, m1, d1] = fechaInicio.split("-").map(Number);
  const [y2, m2, d2] = fechaFin.split("-").map(Number);
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return 0;

  const inicioMs = Date.UTC(y1, m1 - 1, d1);
  const finMs = Date.UTC(y2, m2 - 1, d2);
  if (finMs < inicioMs) return 0;

  const MS_POR_DIA = 1000 * 60 * 60 * 24;
  return Math.round((finMs - inicioMs) / MS_POR_DIA) + 1;
}

export default function GestionSolicitudesTab() {
  const [solicitudes, setSolicitudes] = useState<SolicitudConColaborador[]>([]);
  const [colaboradores, setColaboradores] = useState<ColaboradorCatalogo[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [form, setForm] = useState<VacacionesPagadasForm>(FORM_INICIAL);
  const [esMedioDiaRh, setEsMedioDiaRh] = useState<boolean>(false);
  const [jornadaMedioDiaRh, setJornadaMedioDiaRh] = useState<
    "Matutino" | "Vespertino"
  >("Matutino");
  const [confirmacionPendiente, setConfirmacionPendiente] = useState<{
    colaborador: ColaboradorCatalogo;
    tipoElegido: TipoAsignacionDirectaRh;
    dias: number;
    fechaInicio: string;
    fechaFin: string;
    motivoTexto: string;
    esMedioDia: boolean;
    saldoActual: number;
    saldoResultante: number;
    resultaraNegativo: boolean;
  } | null>(null);
  const [isCreatingVacaciones, setIsCreatingVacaciones] = useState(false);
  const [mensajeCreada, setMensajeCreada] = useState<string | null>(null);

  const [excepcionNominaActiva, setExcepcionNominaActiva] =
    useState<boolean>(false);
  const [isTogglingExcepcion, setIsTogglingExcepcion] =
    useState<boolean>(false);

  useEffect(() => {
    let cancelado = false;

    async function cargarDatos() {
      setIsLoading(true);
      setErrorMsg(null);

      try {
        const supabase = createClient();

        const [solicitudesRes, colaboradoresRes, configNominaRes] =
          await Promise.all([
            supabase
              .from("solicitudes")
              .select(
                "*, colaboradores!colaborador_id(nombre_completo, saldo_vacaciones)"
              )
              .order("created_at", { ascending: false }),
            supabase
              .from("colaboradores")
              .select("id, nombre_completo, empresa, saldo_vacaciones")
              .order("nombre_completo", { ascending: true }),
            obtenerConfigVacacionesNominaAction(),
          ]);

        if (cancelado) return;

        setExcepcionNominaActiva(Boolean(configNominaRes?.excepcionActiva));

        if (solicitudesRes.error) {
          setErrorMsg(
            `Error al consultar las solicitudes: ${solicitudesRes.error.message}`
          );
          setSolicitudes([]);
        } else {
          const filas: SolicitudConColaborador[] = (
            solicitudesRes.data ?? []
          ).map((item) => ({
            id: item.id,
            colaborador_id: item.colaborador_id,
            tipo_solicitud: item.tipo_solicitud || item.tipo || "Solicitud",
            fecha_inicio: item.fecha_inicio,
            fecha_fin: item.fecha_fin,
            motivo: item.motivo ?? null,
            estatus: normalizarEstatus(item.estatus, item.motivo),
            created_at: item.created_at,
            colaboradores:
              (item.colaboradores as
                | ColaboradorRelacion
                | ColaboradorRelacion[]
                | null) ?? null,
          }));
          setSolicitudes(filas);
        }

        if (!colaboradoresRes.error && colaboradoresRes.data) {
          setColaboradores(colaboradoresRes.data);
        }
      } catch (err) {
        if (cancelado) return;
        setErrorMsg(
          err instanceof Error
            ? `Error al cargar las solicitudes: ${err.message}`
            : "No fue posible cargar la gestión de solicitudes."
        );
      } finally {
        if (!cancelado) {
          setIsLoading(false);
        }
      }
    }

    cargarDatos();

    return () => {
      cancelado = true;
    };
  }, []);

  /**
   * Actualiza el estatus de una solicitud en Supabase ('Completado' o 'Rechazado'),
   * descuenta días de saldo_vacaciones cuando se aprueban Vacaciones y sincroniza la UI.
   */
  const handleUpdateStatus = async (
    id: string,
    newStatus: "Completado" | "Rechazado",
    solicitud: SolicitudConColaborador
  ) => {
    if (updatingId) return;
    setUpdatingId(id);
    setErrorMsg(null);

    try {
      const supabase = createClient();
      const tipoLower = solicitud.tipo_solicitud.trim().toLowerCase();
      const esVacaciones = tipoLower === "vacaciones";
      const esVacacionesPagadas = tipoLower === "vacaciones pagadas";
      let nuevoSaldoAplicado: number | null = null;

      if (newStatus === "Completado" && esVacacionesPagadas) {
        const diasSolicitados = calcularDiasSolicitados(
          solicitud.fecha_inicio,
          solicitud.fecha_fin
        );
        if (diasSolicitados < MINIMO_DIAS_VACACIONES_PAGADAS) {
          setErrorMsg(
            `No se puede aprobar: las Vacaciones Pagadas requieren un mínimo de ${MINIMO_DIAS_VACACIONES_PAGADAS} días por solicitud (${diasSolicitados} día(s) solicitados).`
          );
          return;
        }
        const anioSol = obtenerAnioFecha(solicitud.fecha_inicio);
        const diasAprobadosAnio = solicitudes.reduce((acum, item) => {
          if (
            item.id !== id &&
            item.colaborador_id === solicitud.colaborador_id &&
            item.tipo_solicitud.trim().toLowerCase() === "vacaciones pagadas" &&
            item.estatus === "Completado" &&
            obtenerAnioFecha(item.fecha_inicio) === anioSol
          ) {
            return (
              acum + calcularDiasSolicitados(item.fecha_inicio, item.fecha_fin)
            );
          }
          return acum;
        }, 0);

        if (diasAprobadosAnio + diasSolicitados > LIMITE_ANUAL_VACACIONES_PAGADAS) {
          setErrorMsg(
            `No se puede aprobar: el colaborador ya tiene ${diasAprobadosAnio} día(s) de Vacaciones Pagadas aprobados en ${anioSol} y el límite anual es de ${LIMITE_ANUAL_VACACIONES_PAGADAS} días.`
          );
          return;
        }
      }

      // Si se aprueba ('Completado') y es de tipo 'Vacaciones', descontar días efectivos (sin feriados oficiales ni de empresa) del saldo_vacaciones
      if (newStatus === "Completado" && esVacaciones) {
        const feriadosDinamicos = await obtenerFeriadosDinamicosAction();
        const colabCatalogo = colaboradores.find(
          (c) => c.id === solicitud.colaborador_id
        );
        const empresaColab = (colabCatalogo?.empresa ?? "AIF").trim() || "AIF";
        const { diasEfectivos: diasSolicitados } =
          calcularDiasEfectivosSinFeriados(
            solicitud.fecha_inicio,
            solicitud.fecha_fin,
            Array.isArray(feriadosDinamicos) ? feriadosDinamicos : [],
            empresaColab,
            solicitud.motivo
          );
        const saldoActual = obtenerSaldoColaborador(solicitud.colaboradores);

        if (diasSolicitados > saldoActual) {
          const msgInsuficiente = `No se puede aprobar la solicitud: el colaborador solicita ${diasSolicitados} día(s) de vacaciones, pero solo cuenta con ${saldoActual} día(s) disponibles.`;
          setErrorMsg(msgInsuficiente);
          return;
        }

        const nuevoSaldo = Number((saldoActual - diasSolicitados).toFixed(1));

        let { error: errorSaldo } = await supabase
          .from("colaboradores")
          .update({ saldo_vacaciones: nuevoSaldo })
          .eq("id", solicitud.colaborador_id);

        if (
          errorSaldo &&
          /invalid input syntax for type integer/i.test(errorSaldo.message)
        ) {
          const retryInt = await supabase
            .from("colaboradores")
            .update({ saldo_vacaciones: Math.floor(nuevoSaldo) })
            .eq("id", solicitud.colaborador_id);
          errorSaldo = retryInt.error;
        }

        if (errorSaldo) {
          alert(
            "Error al descontar saldo de vacaciones: " + errorSaldo.message
          );
          setErrorMsg(
            "Error al descontar saldo de vacaciones: " + errorSaldo.message
          );
          return;
        }

        nuevoSaldoAplicado = nuevoSaldo;
      }

      const { data, error } = await supabase
        .from("solicitudes")
        .update({ estatus: newStatus })
        .eq("id", id)
        .select();

      if (error) {
        alert("Error al actualizar: " + error.message);
        setErrorMsg("Error al actualizar: " + error.message);
        return;
      }

      if (!data || data.length === 0) {
        const msgRls =
          "No se modificó ningún registro en la base de datos (verifica los permisos RLS de UPDATE en la tabla 'solicitudes').";
        alert("Error al actualizar: " + msgRls);
        setErrorMsg("Error al actualizar: " + msgRls);
        return;
      }

      setSolicitudes((prev) =>
        prev.map((s) => {
          const mismoColaborador = s.colaborador_id === solicitud.colaborador_id;
          let relActualizada = s.colaboradores;

          if (mismoColaborador && nuevoSaldoAplicado !== null && relActualizada) {
            if (Array.isArray(relActualizada)) {
              relActualizada = relActualizada.map((r) => ({
                ...r,
                saldo_vacaciones: nuevoSaldoAplicado,
              }));
            } else {
              relActualizada = {
                ...relActualizada,
                saldo_vacaciones: nuevoSaldoAplicado,
              };
            }
          }

          if (s.id === id) {
            return {
              ...s,
              estatus: newStatus,
              colaboradores: relActualizada,
            };
          }

          return mismoColaborador
            ? { ...s, colaboradores: relActualizada }
            : s;
        })
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Ocurrió un error al actualizar la solicitud.";
      alert("Error al actualizar: " + msg);
      setErrorMsg("Error al actualizar: " + msg);
    } finally {
      setUpdatingId(null);
    }
  };

  const permiteMedioDiaRh =
    form.tipo_solicitud === "Vacaciones" ||
    form.tipo_solicitud === "Permiso con goce de sueldo" ||
    form.tipo_solicitud === "Permiso sin goce de sueldo";

  const medioDiaRhEfectivo = permiteMedioDiaRh && esMedioDiaRh;

  /** Pre-valida la asignación de RH y abre el modal de confirmación antes de guardar en Supabase. */
  const handleCrearVacaciones = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isCreatingVacaciones) return;

    const colaborador = colaboradores.find((c) => c.id === form.colaborador_id);
    if (!colaborador) return;

    const fechaInicioEfectiva = form.fecha_inicio.trim();
    const fechaFinEfectiva = medioDiaRhEfectivo
      ? fechaInicioEfectiva
      : (form.fecha_fin || form.fecha_inicio).trim();

    if (!fechaInicioEfectiva || !fechaFinEfectiva) {
      setErrorMsg("Selecciona las fechas de inicio y fin para la asignación.");
      return;
    }

    const tipoElegido: TipoAsignacionDirectaRh =
      form.tipo_solicitud || "Vacaciones Pagadas";

    const diasPorRango = calcularDiasSolicitados(
      fechaInicioEfectiva,
      fechaFinEfectiva
    );
    const dias = medioDiaRhEfectivo
      ? 0.5
      : Math.max(0.5, Number(form.dias_a_pagar) || diasPorRango || 1);

    if (tipoElegido === "Vacaciones Pagadas") {
      const diasEfectivos = Math.max(dias, diasPorRango);

      if (
        dias < MINIMO_DIAS_VACACIONES_PAGADAS ||
        (diasPorRango > 0 && diasPorRango < MINIMO_DIAS_VACACIONES_PAGADAS)
      ) {
        setErrorMsg(
          `Las Vacaciones Pagadas requieren un mínimo de ${MINIMO_DIAS_VACACIONES_PAGADAS} días por solicitud.`
        );
        return;
      }

      if (diasEfectivos > LIMITE_ANUAL_VACACIONES_PAGADAS) {
        setErrorMsg(
          `Las Vacaciones Pagadas tienen un límite máximo de ${LIMITE_ANUAL_VACACIONES_PAGADAS} días por año.`
        );
        return;
      }

      const anioSol = obtenerAnioFecha(fechaInicioEfectiva);
      const diasAnioColaborador = solicitudes.reduce((acum, item) => {
        if (
          item.colaborador_id === colaborador.id &&
          item.tipo_solicitud.trim().toLowerCase() === "vacaciones pagadas" &&
          item.estatus !== "Rechazado" &&
          obtenerAnioFecha(item.fecha_inicio) === anioSol
        ) {
          return (
            acum + calcularDiasSolicitados(item.fecha_inicio, item.fecha_fin)
          );
        }
        return acum;
      }, 0);

      if (diasAnioColaborador + diasEfectivos > LIMITE_ANUAL_VACACIONES_PAGADAS) {
        setErrorMsg(
          `Límite anual de Vacaciones Pagadas excedido para ${colaborador.nombre_completo}: ya cuenta con ${diasAnioColaborador} día(s) en ${anioSol} (máximo ${LIMITE_ANUAL_VACACIONES_PAGADAS} días por año).`
        );
        return;
      }
    }

    const motivoPorDefecto = `Asignación directa RH de ${tipoElegido.toLowerCase()} (${dias} ${
      dias === 1 ? "día" : "días"
    })`;

    const comentarioBase = (form.motivo ?? "").trim() || motivoPorDefecto;
    const motivoTexto =
      formatearMotivoConMedioDia(
        comentarioBase,
        medioDiaRhEfectivo,
        jornadaMedioDiaRh
      ) ?? comentarioBase;

    setErrorMsg(null);
    setMensajeCreada(null);

    const saldoActualColab = Number(colaborador.saldo_vacaciones ?? 0);
    const saldoResultanteColab =
      tipoElegido === "Vacaciones"
        ? Number((saldoActualColab - dias).toFixed(1))
        : saldoActualColab;
    const resultaraNegativo =
      tipoElegido === "Vacaciones" && saldoResultanteColab < 0;

    // Abrir modal de confirmación obligatoria antes de ejecutar la asignación
    setConfirmacionPendiente({
      colaborador,
      tipoElegido,
      dias,
      fechaInicio: fechaInicioEfectiva,
      fechaFin: fechaFinEfectiva,
      motivoTexto,
      esMedioDia: medioDiaRhEfectivo,
      saldoActual: saldoActualColab,
      saldoResultante: saldoResultanteColab,
      resultaraNegativo,
    });
  };

  const ejecutarAsignacionConfirmada = async () => {
    if (!confirmacionPendiente || isCreatingVacaciones) return;
    const {
      colaborador,
      tipoElegido,
      dias,
      fechaInicio,
      fechaFin,
      motivoTexto,
    } = confirmacionPendiente;

    setIsCreatingVacaciones(true);
    setErrorMsg(null);
    setMensajeCreada(null);

    try {
      const supabase = createClient();

      // Si RH asigna "Vacaciones" ordinarias, descontar del saldo_vacaciones del colaborador
      // (permite saldo negativo para vacaciones extraordinarias/adelantadas autorizadas por RH)
      let saldoActualizadoRh: number | null = null;
      if (tipoElegido === "Vacaciones") {
        const { data: colabDb } = await supabase
          .from("colaboradores")
          .select("saldo_vacaciones")
          .eq("id", colaborador.id)
          .maybeSingle();

        const saldoActual = Number(
          colabDb?.saldo_vacaciones ?? colaborador.saldo_vacaciones ?? 0
        );
        const nuevoSaldo = Number((saldoActual - dias).toFixed(1));

        let { error: saldoErr } = await supabase
          .from("colaboradores")
          .update({ saldo_vacaciones: nuevoSaldo })
          .eq("id", colaborador.id);

        if (
          saldoErr &&
          /invalid input syntax for type integer/i.test(saldoErr.message)
        ) {
          const retryInt = await supabase
            .from("colaboradores")
            .update({ saldo_vacaciones: Math.floor(nuevoSaldo) })
            .eq("id", colaborador.id);
          saldoErr = retryInt.error;
        }

        if (!saldoErr) {
          saldoActualizadoRh = nuevoSaldo;
          setColaboradores((prev) =>
            prev.map((c) =>
              c.id === colaborador.id
                ? { ...c, saldo_vacaciones: nuevoSaldo }
                : c
            )
          );
        }
      }
      void saldoActualizadoRh;

      const payloadAsignacion = {
        colaborador_id: colaborador.id,
        tipo_solicitud: tipoElegido,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        motivo: motivoTexto,
        estatus: "Completado" as const,
      };

      let { data: insertada, error } = await supabase
        .from("solicitudes")
        .insert(payloadAsignacion)
        .select(
          "*, colaboradores!colaborador_id(nombre_completo, saldo_vacaciones)"
        )
        .single();

      if (
        error &&
        /dias_solicitados/i.test(error.message) &&
        /null value|not-null/i.test(error.message)
      ) {
        const retry = await supabase
          .from("solicitudes")
          .insert({
            ...payloadAsignacion,
            dias_solicitados: Math.max(1, Math.ceil(dias)),
          })
          .select(
            "*, colaboradores!colaborador_id(nombre_completo, saldo_vacaciones)"
          )
          .single();
        insertada = retry.data;
        error = retry.error;
      }

      if (error) {
        setErrorMsg(
          `No se pudo crear la asignación de ${tipoElegido.toLowerCase()}: ${error.message}`
        );
        setConfirmacionPendiente(null);
        return;
      }

      if (insertada) {
        const nuevaFila: SolicitudConColaborador = {
          id: insertada.id,
          colaborador_id: insertada.colaborador_id,
          tipo_solicitud: insertada.tipo_solicitud || tipoElegido,
          fecha_inicio: insertada.fecha_inicio,
          fecha_fin: insertada.fecha_fin,
          motivo: insertada.motivo ?? motivoTexto,
          estatus: normalizarEstatus(insertada.estatus),
          created_at: insertada.created_at,
          colaboradores: (insertada.colaboradores as
            | ColaboradorRelacion
            | ColaboradorRelacion[]
            | null) ?? { nombre_completo: colaborador.nombre_completo },
        };
        setSolicitudes((prev) => [nuevaFila, ...prev]);
      }

      setForm(FORM_INICIAL);
      setEsMedioDiaRh(false);
      setConfirmacionPendiente(null);
      setMensajeCreada(
        `${tipoElegido} asignada para ${colaborador.nombre_completo} (${dias} ${
          dias === 1 ? "día" : "días"
        }).`
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Ocurrió un error al registrar la asignación."
      );
      setConfirmacionPendiente(null);
    } finally {
      setIsCreatingVacaciones(false);
    }
  };

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
      {/* Bloque Izquierdo: Tabla / Bandeja de Gestión de Solicitudes */}
      <section className="overflow-hidden rounded-sm bg-brand-surface shadow-sm lg:col-span-8">
        <header className="border-b border-gray-100 px-6 py-5">
          <h2 className="text-base font-bold text-gray-900">
            Gestión de Solicitudes (RH)
          </h2>
          <p className="mt-0.5 text-xs text-gray-400">
            Historial y resolución de solicitudes de colaboradores en tiempo real
          </p>
        </header>

        {errorMsg && (
          <div
            role="alert"
            className="mx-6 my-4 rounded-sm border border-status-danger/30 bg-status-danger/10 px-4 py-3 text-xs font-semibold text-status-danger-dark"
          >
            {errorMsg}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse">
            <thead>
              <tr className="bg-brand-beige/60">
                <th
                  scope="col"
                  className="px-6 py-3.5 text-left text-[8px] font-bold uppercase tracking-widest text-gray-500"
                >
                  COLABORADOR / TIPO
                </th>
                <th
                  scope="col"
                  className="px-6 py-3.5 text-left text-[8px] font-bold uppercase tracking-widest text-gray-500"
                >
                  FECHAS
                </th>
                <th
                  scope="col"
                  className="px-6 py-3.5 text-left text-[8px] font-bold uppercase tracking-widest text-gray-500"
                >
                  MOTIVO
                </th>
                <th
                  scope="col"
                  className="px-6 py-3.5 text-left text-[8px] font-bold uppercase tracking-widest text-gray-500"
                >
                  ESTATUS
                </th>
                <th
                  scope="col"
                  className="px-6 py-3.5 text-right text-[8px] font-bold uppercase tracking-widest text-gray-500"
                >
                  ACCIONES
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading && (
                <>
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 pt-6 pb-2 text-center text-xs font-semibold text-gray-500"
                    >
                      Cargando solicitudes...
                    </td>
                  </tr>
                  {[1, 2, 3].map((fila) => (
                    <tr
                      key={fila}
                      aria-hidden="true"
                      className="animate-pulse"
                    >
                      <td className="px-6 py-4">
                        <div className="h-3 w-36 rounded bg-gray-200" />
                        <div className="mt-2 h-2 w-24 rounded bg-gray-100" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-3 w-32 rounded bg-gray-200" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-3 w-40 rounded bg-gray-200" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-4 w-24 rounded bg-gray-200" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="ml-auto h-6 w-28 rounded bg-gray-200" />
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {!isLoading && solicitudes.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-8 text-center text-xs text-gray-400"
                  >
                    No hay solicitudes registradas en la base de datos.
                  </td>
                </tr>
              )}

              {!isLoading &&
                solicitudes.map((solicitud) => {
                  const nombreColaborador = obtenerNombreColaborador(
                    solicitud.colaboradores
                  );
                  const badge =
                    ESTATUS_BADGE[solicitud.estatus] ??
                    ESTATUS_BADGE.Pendiente_Jefe;
                  const esCancelada =
                    solicitud.estatus === "Cancelado" ||
                    esSolicitudCancelada(solicitud.estatus, solicitud.motivo);
                  const { motivoOriginal, motivoCancelacion } =
                    extraerMotivoCancelacion(solicitud.motivo);
                  const mostrarAcciones =
                    !esCancelada &&
                    solicitud.estatus !== "Completado" &&
                    solicitud.estatus !== "Rechazado";
                  const procesando = updatingId === solicitud.id;

                  return (
                    <tr
                      key={solicitud.id}
                      id={`solicitud-${solicitud.id}`}
                      className="hover:bg-gray-50/50 target:bg-brand-beige/40"
                    >
                      <td className="px-6 py-4">
                        <p className="text-xs font-bold text-gray-900">
                          {nombreColaborador}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span className="text-[9px] font-bold uppercase tracking-widest text-brand-gold">
                            {solicitud.tipo_solicitud}
                          </span>
                          {esSolicitudMedioDia(solicitud.motivo) && (
                            <span className="rounded-sm bg-brand-beige px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider text-brand-dark">
                              MEDIO DÍA (0.5 DÍAS)
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4 font-mono text-[11px] text-gray-600">
                        {solicitud.fecha_inicio === solicitud.fecha_fin
                          ? solicitud.fecha_inicio
                          : `${solicitud.fecha_inicio} al ${solicitud.fecha_fin}`}
                      </td>

                      <td className="px-6 py-4 text-xs text-gray-600">
                        <div className="flex flex-col gap-1">
                          <span>{motivoOriginal || "-"}</span>
                          {motivoCancelacion && (
                            <span className="rounded-sm border border-gray-200 bg-gray-50 px-2 py-1 text-[10px] text-gray-700">
                              <strong className="font-bold text-gray-900">
                                Motivo de cancelación:
                              </strong>{" "}
                              {motivoCancelacion}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`inline-block rounded-sm border px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-right">
                        {mostrarAcciones ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              disabled={procesando}
                              onClick={() =>
                                handleUpdateStatus(
                                  solicitud.id,
                                  "Completado",
                                  solicitud
                                )
                              }
                              className="rounded-sm bg-status-success px-3 py-1.5 text-[8px] font-bold uppercase tracking-widest text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {procesando ? "..." : "APROBAR"}
                            </button>
                            <button
                              type="button"
                              disabled={procesando}
                              onClick={() =>
                                handleUpdateStatus(
                                  solicitud.id,
                                  "Rechazado",
                                  solicitud
                                )
                              }
                              className="rounded-sm border border-status-danger/30 bg-status-danger/10 px-3 py-1.5 text-[8px] font-bold uppercase tracking-widest text-status-danger-dark transition-colors hover:bg-status-danger/20 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {procesando ? "..." : "RECHAZAR"}
                            </button>
                          </div>
                        ) : (
                          <span className="text-[9px] font-semibold uppercase tracking-widest text-gray-400">
                            {esCancelada ? "Cancelada" : "Resuelta"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Bloque Derecho: Interruptor de Excepción en Semana de Nómina + Asignar vacaciones / incapacidad */}
      <aside className="flex flex-col gap-5 lg:col-span-4">
        {/* Tarjeta del Interruptor Extraordinario de RH para Semana de Nómina */}
        <div className="rounded-sm border-t-4 border-brand-gold bg-brand-surface p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-[8px] font-bold uppercase tracking-widest text-brand-gold">
                CONTROL DE LÍMITES RH · CIERRE DE NÓMINA (15 Y 30)
              </span>
              <h3 className="mt-0.5 font-serif text-sm font-bold text-gray-900">
                Solicitudes en Semana de Nómina
              </h3>
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
                  setErrorMsg(
                    res.error || "No se pudo actualizar el interruptor."
                  );
                } else {
                  setExcepcionNominaActiva(res.config.excepcionActiva);
                }
                setIsTogglingExcepcion(false);
              }}
              aria-label="Habilitar solicitudes de vacaciones en semana de nómina"
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

          <p className="mt-2 text-[11px] leading-relaxed text-gray-600">
            Del <strong>9 al 15</strong> y del <strong>23 al 30</strong> del
            mismo mes no es posible solicitar vacaciones por corte de nómina.
            Activa este interruptor para habilitar solicitudes en casos
            extraordinarios.
          </p>

          <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2.5">
            <span className="text-[8px] font-bold uppercase tracking-wider text-gray-500">
              ESTADO ACTUAL
            </span>
            <span
              className={`rounded-sm border px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-wider ${
                excepcionNominaActiva
                  ? "border-status-success/40 bg-status-success/10 text-status-success-dark"
                  : "border-gray-300 bg-brand-beige/40 text-gray-700"
              }`}
            >
              {excepcionNominaActiva
                ? "EXCEPCIÓN ACTIVA (SOLICITUDES HABILITADAS)"
                : "RESTRICCIÓN ACTIVA (9-15 Y 23-30 BLOQUEADOS)"}
            </span>
          </div>
        </div>

        <div className="rounded-sm border-t-4 border-brand-dark bg-brand-surface p-6 shadow-sm">
          <header className="mb-5">
            <h2 className="font-serif text-base font-bold text-brand-gold">
              Asignar vacaciones
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              Asignar de forma directa cualquier tipo de vacaciones, permisos o incapacidad en casos especiales (incluyendo medios días).
            </p>
          </header>

        <form onSubmit={handleCrearVacaciones} className="flex flex-col gap-4">
          <div>
            <label htmlFor="rh-vac-colaborador" className={LABEL}>
              COLABORADOR
            </label>
            <select
              id="rh-vac-colaborador"
              value={form.colaborador_id}
              onChange={(e) => {
                setForm((prev) => ({
                  ...prev,
                  colaborador_id: e.target.value,
                }));
                setMensajeCreada(null);
              }}
              required
              className={FIELD}
            >
              <option value="" disabled>
                Seleccionar...
              </option>
              {colaboradores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre_completo} ({c.empresa || "AIF"} · Saldo:{" "}
                  {c.saldo_vacaciones ?? 0}d)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="rh-vac-tipo" className={LABEL}>
              TIPO DE SOLICITUD / VACACIONES
            </label>
            <select
              id="rh-vac-tipo"
              value={form.tipo_solicitud}
              onChange={(e) => {
                const nuevoTipo = e.target.value as TipoAsignacionDirectaRh;
                if (
                  nuevoTipo !== "Vacaciones" &&
                  nuevoTipo !== "Permiso con goce de sueldo" &&
                  nuevoTipo !== "Permiso sin goce de sueldo"
                ) {
                  setEsMedioDiaRh(false);
                }
                setForm((prev) => ({
                  ...prev,
                  tipo_solicitud: nuevoTipo,
                  dias_a_pagar:
                    nuevoTipo === "Vacaciones Pagadas"
                      ? Math.max(5, prev.dias_a_pagar || 5)
                      : prev.dias_a_pagar || 1,
                }));
                setMensajeCreada(null);
              }}
              required
              className={FIELD}
            >
              <option value="Vacaciones">Vacaciones (Descuenta de saldo)</option>
              <option value="Vacaciones Pagadas">Vacaciones Pagadas</option>
              <option value="Permiso con goce de sueldo">
                Permiso con goce de sueldo
              </option>
              <option value="Permiso sin goce de sueldo">
                Permiso sin goce de sueldo
              </option>
              <option value="Incapacidad">Incapacidad</option>
            </select>
          </div>

          {permiteMedioDiaRh && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-brand-gold/40 bg-brand-beige/35 px-3 py-2">
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-bold text-gray-800">
                <input
                  type="checkbox"
                  checked={esMedioDiaRh}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setEsMedioDiaRh(checked);
                    setForm((prev) => ({
                      ...prev,
                      fecha_fin: checked
                        ? prev.fecha_inicio
                        : prev.fecha_fin || prev.fecha_inicio,
                      dias_a_pagar: checked ? 0.5 : Math.max(1, Math.ceil(prev.dias_a_pagar)),
                    }));
                  }}
                  className="h-4 w-4 accent-brand-dark"
                />
                <span>Asignar medio día (0.5 días)</span>
              </label>

              {esMedioDiaRh && (
                <select
                  value={jornadaMedioDiaRh}
                  onChange={(e) =>
                    setJornadaMedioDiaRh(
                      e.target.value as "Matutino" | "Vespertino"
                    )
                  }
                  className="h-7 rounded-sm border border-gray-300 bg-brand-surface px-2 text-[11px] font-bold text-gray-900"
                >
                  <option value="Matutino">Matutino (Mañana)</option>
                  <option value="Vespertino">Vespertino (Tarde)</option>
                </select>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="rh-vac-inicio" className={LABEL}>
                FECHA INICIO
              </label>
              <input
                id="rh-vac-inicio"
                type="date"
                value={form.fecha_inicio}
                onChange={(e) => {
                  const nuevaInicio = e.target.value;
                  setForm((prev) => {
                    const nuevaFin =
                      medioDiaRhEfectivo ||
                      !prev.fecha_fin ||
                      prev.fecha_fin < nuevaInicio
                        ? nuevaInicio
                        : prev.fecha_fin;
                    const diasRango = calcularDiasSolicitados(
                      nuevaInicio,
                      nuevaFin
                    );
                    return {
                      ...prev,
                      fecha_inicio: nuevaInicio,
                      fecha_fin: nuevaFin,
                      dias_a_pagar: medioDiaRhEfectivo
                        ? 0.5
                        : prev.tipo_solicitud === "Vacaciones Pagadas"
                        ? Math.max(5, diasRango || 5)
                        : diasRango || 1,
                    };
                  });
                }}
                required
                className={FIELD}
              />
            </div>

            <div>
              <label htmlFor="rh-vac-fin" className={LABEL}>
                FECHA FIN
              </label>
              <input
                id="rh-vac-fin"
                type="date"
                value={medioDiaRhEfectivo ? form.fecha_inicio : form.fecha_fin}
                min={form.fecha_inicio || undefined}
                disabled={medioDiaRhEfectivo}
                onChange={(e) => {
                  const nuevaFin = e.target.value;
                  setForm((prev) => {
                    const diasRango = calcularDiasSolicitados(
                      prev.fecha_inicio,
                      nuevaFin
                    );
                    return {
                      ...prev,
                      fecha_fin: nuevaFin,
                      dias_a_pagar: medioDiaRhEfectivo
                        ? 0.5
                        : prev.tipo_solicitud === "Vacaciones Pagadas"
                        ? Math.max(5, diasRango || prev.dias_a_pagar)
                        : diasRango || prev.dias_a_pagar,
                    };
                  });
                }}
                required
                className={`${FIELD} disabled:cursor-not-allowed disabled:opacity-60`}
              />
            </div>
          </div>

          <div>
            <label htmlFor="rh-vac-dias" className={LABEL}>
              {form.tipo_solicitud === "Incapacidad"
                ? "DÍAS DE INCAPACIDAD"
                : form.tipo_solicitud === "Vacaciones Pagadas"
                ? "DÍAS A PAGAR (MÍN. 5, MÁX. 10 ANUAL)"
                : "DÍAS A ASIGNAR (SOPORTA 0.5 PARA MEDIO DÍA)"}
            </label>
            <input
              id="rh-vac-dias"
              type="number"
              step={permiteMedioDiaRh ? "0.5" : "1"}
              min={
                form.tipo_solicitud === "Vacaciones Pagadas"
                  ? MINIMO_DIAS_VACACIONES_PAGADAS
                  : permiteMedioDiaRh
                  ? 0.5
                  : 1
              }
              max={
                form.tipo_solicitud === "Vacaciones Pagadas"
                  ? LIMITE_ANUAL_VACACIONES_PAGADAS
                  : 60
              }
              disabled={medioDiaRhEfectivo}
              value={medioDiaRhEfectivo ? 0.5 : form.dias_a_pagar}
              onChange={(e) => {
                const val = Number(e.target.value);
                if (val === 0.5 && permiteMedioDiaRh) {
                  setEsMedioDiaRh(true);
                }
                setForm((prev) => ({
                  ...prev,
                  dias_a_pagar: val,
                }));
              }}
              required
              className={`${FIELD} disabled:cursor-not-allowed disabled:opacity-60`}
            />
          </div>

          <div>
            <label htmlFor="rh-vac-motivo" className={LABEL}>
              COMENTARIO / RAZÓN DE ASIGNACIÓN
            </label>
            <textarea
              id="rh-vac-motivo"
              rows={3}
              placeholder="Ingresa la razón o comentario de esta asignación..."
              value={form.motivo ?? ""}
              onChange={(e) => {
                setForm((prev) => ({
                  ...prev,
                  motivo: e.target.value,
                }));
                setMensajeCreada(null);
              }}
              className="w-full resize-y rounded-sm border border-gray-300 bg-brand-surface px-3 py-2 text-xs font-medium leading-relaxed text-gray-900 placeholder:text-gray-400 focus:border-brand-dark focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={isCreatingVacaciones}
            className="mt-1 h-10 w-full rounded-sm bg-brand-dark text-[10px] font-bold uppercase tracking-widest text-brand-gold transition-colors hover:bg-brand-dark/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCreatingVacaciones ? "GUARDANDO..." : "CREAR SOLICITUD"}
          </button>

          {mensajeCreada && (
            <p role="status" className="text-[11px] text-status-success-dark">
              {mensajeCreada}
            </p>
          )}
        </form>
        </div>
      </aside>

      {/* Modal de Confirmación Obligatoria al Asignar Vacaciones desde RH */}
      {confirmacionPendiente && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar asignación de vacaciones"
          onClick={() =>
            !isCreatingVacaciones && setConfirmacionPendiente(null)
          }
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-md flex-col overflow-hidden rounded-sm bg-brand-surface shadow-2xl"
          >
            <header className="border-b border-gray-100 bg-brand-dark px-6 py-4 text-white">
              <span className="text-[9px] font-bold uppercase tracking-widest text-brand-gold">
                VALIDACIÓN DE ASIGNACIÓN ESPECIAL RH
              </span>
              <h3 className="mt-1 font-serif text-base font-bold leading-snug text-white">
                ¿Estás seguro de asignar {confirmacionPendiente.tipoElegido} al
                colaborador{" "}
                {confirmacionPendiente.colaborador.nombre_completo}?
              </h3>
            </header>

            <div className="flex flex-col gap-3 p-6 text-xs text-gray-700">
              <div className="rounded-sm border border-gray-200 bg-brand-beige/30 p-3.5">
                <p className="text-xs font-bold text-gray-900">
                  {confirmacionPendiente.colaborador.nombre_completo}
                </p>
                <p className="mt-1 text-[11px] font-semibold text-brand-dark">
                  Tipo: {confirmacionPendiente.tipoElegido} (
                  {confirmacionPendiente.dias}{" "}
                  {confirmacionPendiente.dias === 1 ? "día" : "días"}
                  {confirmacionPendiente.esMedioDia ? " · Medio día" : ""})
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-gray-600">
                  Período:{" "}
                  {confirmacionPendiente.fechaInicio ===
                  confirmacionPendiente.fechaFin
                    ? confirmacionPendiente.fechaInicio
                    : `${confirmacionPendiente.fechaInicio} al ${confirmacionPendiente.fechaFin}`}
                </p>
              </div>
              {confirmacionPendiente.tipoElegido === "Vacaciones" &&
                (confirmacionPendiente.resultaraNegativo ? (
                  <div
                    role="alert"
                    className="rounded-sm border border-status-warning/50 bg-status-warning/10 p-3.5 text-status-warning-dark"
                  >
                    <p className="text-xs font-bold leading-snug">
                      Se ha superado los días disponibles del colaborador, esto
                      resultará en saldo negativo, ¿estás seguro de continuar?
                    </p>
                    <p className="mt-1.5 font-mono text-[11px]">
                      Saldo actual: {confirmacionPendiente.saldoActual} día(s) →
                      Saldo resultante:{" "}
                      <strong>
                        {confirmacionPendiente.saldoResultante} día(s)
                      </strong>
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-500">
                    Se descontarán{" "}
                    <strong>
                      {confirmacionPendiente.dias}{" "}
                      {confirmacionPendiente.dias === 1 ? "día" : "días"}
                    </strong>{" "}
                    del saldo disponible de vacaciones del colaborador (saldo
                    restante:{" "}
                    <strong>{confirmacionPendiente.saldoResultante}</strong>).
                  </p>
                ))}
            </div>

            <footer className="flex items-center justify-end gap-2.5 border-t border-gray-100 bg-brand-beige/20 px-6 py-3.5">
              <button
                type="button"
                disabled={isCreatingVacaciones}
                onClick={() => setConfirmacionPendiente(null)}
                className="rounded-sm border border-gray-300 bg-brand-surface px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50"
              >
                CANCELAR
              </button>
              <button
                type="button"
                disabled={isCreatingVacaciones}
                onClick={ejecutarAsignacionConfirmada}
                className="rounded-sm bg-brand-dark px-5 py-2 text-[9px] font-bold uppercase tracking-widest text-brand-gold transition-colors hover:bg-brand-dark/90 disabled:opacity-50"
              >
                {isCreatingVacaciones
                  ? "ASIGNANDO…"
                  : "SÍ, CONFIRMAR ASIGNACIÓN"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
