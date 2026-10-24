"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { formatHora12 } from "@/lib/asistencia";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/types/supabase";

interface ColaboradorRelacion {
  nombre_completo: string;
}

interface AsistenciaConColaborador {
  id: string;
  colaborador_id: string;
  fecha: string;
  hora_entrada: string | null;
  hora_salida: string | null;
  ubicacion_entrada: Json | null;
  ubicacion_salida: Json | null;
  estatus: string;
  ticket_id?: string | null;
  created_at: string;
  colaboradores: ColaboradorRelacion | ColaboradorRelacion[] | null;
}

type EstatusTicket = "Abierto" | "En_Revision" | "Resuelto" | "Rechazado";

interface TicketAsistenciaRow {
  id: string;
  colaborador_id: string;
  fecha_incidencia: string;
  motivo_omision: string;
  estatus: EstatusTicket;
  comentarios_rh: string | null;
  resuelto_por: string | null;
  created_at: string;
  colaboradores: ColaboradorRelacion | ColaboradorRelacion[] | null;
}

const ESTATUS_TICKET_CHIP: Record<
  EstatusTicket,
  { label: string; className: string }
> = {
  Abierto: {
    label: "Abierto",
    className:
      "border-status-warning/40 bg-status-warning/10 text-status-warning-dark",
  },
  En_Revision: {
    label: "En Revisión",
    className: "border-status-info/40 bg-status-info/10 text-status-info-dark",
  },
  Resuelto: {
    label: "Resuelto",
    className:
      "border-status-success/40 bg-status-success/10 text-status-success-dark",
  },
  Rechazado: {
    label: "Rechazado",
    className:
      "border-status-danger/40 bg-status-danger/10 text-status-danger-dark",
  },
};

const COLUMNAS_ASISTENCIAS = [
  { label: "EMPLEADO", className: "text-left" },
  { label: "FECHA", className: "text-left" },
  { label: "HORA DE ENTRADA", className: "text-left" },
  { label: "HORA DE SALIDA", className: "text-left" },
  { label: "ESTATUS", className: "text-right" },
] as const;

const COLUMNAS_TICKETS = [
  { label: "EMPLEADO", className: "text-left" },
  { label: "FECHA INCIDENCIA", className: "text-left" },
  { label: "MOTIVO DE OMISIÓN", className: "text-left" },
  { label: "ESTATUS", className: "text-left" },
  { label: "ACCIONES", className: "text-right" },
] as const;

function obtenerNombreColaborador(
  rel: ColaboradorRelacion | ColaboradorRelacion[] | null | undefined
): string {
  if (!rel) return "Colaborador";
  if (Array.isArray(rel)) {
    return rel[0]?.nombre_completo || "Colaborador";
  }
  return rel.nombre_completo || "Colaborador";
}

function formatearHora(horaRaw: string | null | undefined): string {
  if (!horaRaw) return "-";
  const limpia = horaRaw.trim();
  if (/^\d{2}:\d{2}/.test(limpia)) {
    return formatHora12(limpia.slice(0, 5));
  }
  const fecha = new Date(limpia);
  if (!Number.isNaN(fecha.getTime())) {
    const hh = String(fecha.getHours()).padStart(2, "0");
    const mm = String(fecha.getMinutes()).padStart(2, "0");
    return formatHora12(`${hh}:${mm}`);
  }
  return limpia;
}

function obtenerChipEstatus(estatusRaw: string | null | undefined): {
  label: string;
  className: string;
} {
  const texto = (estatusRaw || "A Tiempo").trim();
  const lower = texto.toLowerCase();

  if (lower.includes("retardo")) {
    return {
      label: texto,
      className:
        "border-status-warning/40 bg-status-warning/10 text-status-warning-dark",
    };
  }

  if (lower.includes("falta") || lower.includes("ausente")) {
    return {
      label: texto,
      className:
        "border-status-danger/40 bg-status-danger/10 text-status-danger-dark",
    };
  }

  if (lower.includes("justificad")) {
    return {
      label: texto,
      className:
        "border-status-info/40 bg-status-info/10 text-status-info-dark",
    };
  }

  return {
    label: lower === "a_tiempo" ? "A Tiempo" : texto,
    className:
      "border-status-success/40 bg-status-success/10 text-status-success-dark",
  };
}

/**
 * Extrae las horas de entrada y salida sugeridas en el motivo_omision del ticket
 * (ej. "[Omisión Total... | Entrada: 09:00 - Salida: 18:00] ...")
 */
function extraerHorasDeMotivo(motivo: string | null): {
  entrada: string;
  salida: string;
} {
  if (!motivo) return { entrada: "09:00", salida: "18:00" };
  const matchEntrada = motivo.match(/Entrada:\s*(\d{2}:\d{2})/i);
  const matchSalida = motivo.match(/Salida:\s*(\d{2}:\d{2})/i);
  return {
    entrada: matchEntrada?.[1] || "09:00",
    salida: matchSalida?.[1] || "18:00",
  };
}

function normalizarHoraParaBd(hora: string): string | null {
  const limpia = hora.trim();
  if (!limpia) return null;
  if (/^\d{2}:\d{2}$/.test(limpia)) return `${limpia}:00`;
  return limpia;
}

export default function MonitorAsistenciaTab() {
  const [asistencias, setAsistencias] = useState<AsistenciaConColaborador[]>(
    []
  );
  const [ticketsPendientes, setTicketsPendientes] = useState<
    TicketAsistenciaRow[]
  >([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Estado para el modal de resolución y auditoría de un ticket de asistencia
  const [ticketEnResolucion, setTicketEnResolucion] =
    useState<TicketAsistenciaRow | null>(null);
  const [horaEntradaCorregida, setHoraEntradaCorregida] =
    useState<string>("09:00");
  const [horaSalidaCorregida, setHoraSalidaCorregida] =
    useState<string>("18:00");
  const [estatusCorregido, setEstatusCorregido] =
    useState<string>("Justificado");
  const [comentariosRh, setComentariosRh] = useState<string>("");
  const [procesandoTicketId, setProcesandoTicketId] = useState<string | null>(
    null
  );

  useEffect(() => {
    let cancelado = false;

    async function cargarDatos() {
      setIsLoading(true);
      setErrorMsg(null);

      try {
        const supabase = createClient();

        // Consultar asistencias globales y tickets_asistencia ('Abierto' o 'En_Revision') en paralelo
        const [asistenciasRes, ticketsFkeyRes] = await Promise.all([
          supabase
            .from("asistencias")
            .select("*, colaboradores!colaborador_id(nombre_completo)")
            .order("fecha", { ascending: false })
            .order("hora_entrada", { ascending: false })
            .limit(50),
          supabase
            .from("tickets_asistencia")
            .select(
              "*, colaboradores!tickets_asistencia_colaborador_id_fkey(nombre_completo)"
            )
            .in("estatus", ["Abierto", "En_Revision"])
            .order("created_at", { ascending: false }),
        ]);

        // Si el constraint tiene otro nombre en PostgREST, intentar con !colaborador_id
        let ticketsData = ticketsFkeyRes.data;
        let ticketsError = ticketsFkeyRes.error;

        if (ticketsError) {
          const fallbackRes = await supabase
            .from("tickets_asistencia")
            .select("*, colaboradores!colaborador_id(nombre_completo)")
            .in("estatus", ["Abierto", "En_Revision"])
            .order("created_at", { ascending: false });

          ticketsData = fallbackRes.data;
          ticketsError = fallbackRes.error;
        }

        if (cancelado) return;

        if (asistenciasRes.error) {
          setErrorMsg(
            `Error al consultar el monitoreo de asistencias: ${asistenciasRes.error.message}`
          );
          setAsistencias([]);
        } else {
          const filas: AsistenciaConColaborador[] = (
            asistenciasRes.data ?? []
          ).map((item) => ({
            id: item.id,
            colaborador_id: item.colaborador_id,
            fecha: item.fecha,
            hora_entrada: item.hora_entrada,
            hora_salida: item.hora_salida,
            ubicacion_entrada: item.ubicacion_entrada,
            ubicacion_salida: item.ubicacion_salida,
            estatus: item.estatus,
            ticket_id: item.ticket_id ?? null,
            created_at: item.created_at,
            colaboradores:
              (item.colaboradores as
                | ColaboradorRelacion
                | ColaboradorRelacion[]
                | null) ?? null,
          }));
          setAsistencias(filas);
        }

        if (ticketsError) {
          setErrorMsg((prev) =>
            prev
              ? `${prev} | Error en tickets: ${ticketsError.message}`
              : `Error al consultar tickets de asistencia: ${ticketsError.message}`
          );
          setTicketsPendientes([]);
        } else {
          const listaTickets: TicketAsistenciaRow[] = (ticketsData ?? []).map(
            (t) => ({
              id: t.id,
              colaborador_id: t.colaborador_id,
              fecha_incidencia: t.fecha_incidencia,
              motivo_omision: t.motivo_omision,
              estatus: t.estatus,
              comentarios_rh: t.comentarios_rh ?? null,
              resuelto_por: t.resuelto_por ?? null,
              created_at: t.created_at,
              colaboradores:
                (t.colaboradores as
                  | ColaboradorRelacion
                  | ColaboradorRelacion[]
                  | null) ?? null,
            })
          );
          setTicketsPendientes(listaTickets);
        }
      } catch (err) {
        if (cancelado) return;
        setErrorMsg(
          err instanceof Error
            ? `Error al cargar asistencias: ${err.message}`
            : "No fue posible cargar el monitoreo de asistencias."
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

  const asistenciasFiltradas = useMemo(() => {
    const termino = searchTerm.trim().toLowerCase();
    if (!termino) return asistencias;

    return asistencias.filter((a) =>
      obtenerNombreColaborador(a.colaboradores)
        .toLowerCase()
        .includes(termino)
    );
  }, [asistencias, searchTerm]);

  const metricas = useMemo(() => {
    let aTiempo = 0;
    let retardos = 0;

    for (const a of asistencias) {
      const est = (a.estatus || "").toLowerCase();
      if (est.includes("retardo")) {
        retardos += 1;
      } else if (est.includes("tiempo") || est.includes("justificad")) {
        aTiempo += 1;
      }
    }

    return {
      total: asistencias.length,
      aTiempo,
      retardos,
      faltasPorRetardos: Math.floor(retardos / 3),
    };
  }, [asistencias]);

  const handleAbrirModalAprobacion = (ticket: TicketAsistenciaRow) => {
    const sugeridas = extraerHorasDeMotivo(ticket.motivo_omision);
    setHoraEntradaCorregida(sugeridas.entrada);
    setHoraSalidaCorregida(sugeridas.salida);
    setEstatusCorregido("Justificado");
    setComentariosRh("");
    setTicketEnResolucion(ticket);
  };

  /**
   * Rechaza un ticket en `tickets_asistencia` cambiando `estatus` a 'Rechazado',
   * guardando el comentario opcional y `resuelto_por`.
   */
  const handleRechazarTicket = async (ticket: TicketAsistenciaRow) => {
    if (procesandoTicketId) return;

    const comentarioOpcional = window.prompt(
      "Comentario de RH para el rechazo (opcional):",
      ""
    );
    if (comentarioOpcional === null) return;

    setProcesandoTicketId(ticket.id);
    setErrorMsg(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("tickets_asistencia")
        .update({
          estatus: "Rechazado",
          comentarios_rh: comentarioOpcional.trim() || null,
          resuelto_por: user?.id ?? null,
        })
        .eq("id", ticket.id)
        .select();

      if (error) {
        alert("Error al rechazar el ticket: " + error.message);
        setErrorMsg("Error al rechazar el ticket: " + error.message);
        return;
      }

      if (!data || data.length === 0) {
        const msg =
          "No se modificó ningún ticket (verifica permisos RLS de UPDATE en 'tickets_asistencia').";
        alert(msg);
        setErrorMsg(msg);
        return;
      }

      setTicketsPendientes((prev) => prev.filter((t) => t.id !== ticket.id));
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Ocurrió un error al rechazar el ticket.";
      alert("Error al rechazar: " + msg);
      setErrorMsg("Error al rechazar: " + msg);
    } finally {
      setProcesandoTicketId(null);
    }
  };

  /**
   * ACCIÓN 1 (Iteración 7.2): Upsert lógico en Panel RH y Auditoría
   * 1. Consulta `SELECT id FROM asistencias WHERE colaborador_id = ticket.colaborador_id AND fecha = ticket.fecha_incidencia`.
   * 2. Si existe: ejecuta UPDATE cambiando `estatus` a 'Justificado', actualizando las horas y vinculando `ticket_id`.
   * 3. Si no existe: ejecuta INSERT creando el registro nuevo con `estatus: 'Justificado'` y `ticket_id`.
   * 4. Cierra el ticket en `tickets_asistencia` con `estatus: 'Resuelto'`, `comentarios_rh` y `resuelto_por`.
   */
  const handleConfirmarResolucionTicket = async (
    e: FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();
    if (!ticketEnResolucion || procesandoTicketId) return;

    const ticket = ticketEnResolucion;
    setProcesandoTicketId(ticket.id);
    setErrorMsg(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        alert("Tu sesión ha expirado. Inicia sesión nuevamente.");
        return;
      }

      const entradaBd = normalizarHoraParaBd(horaEntradaCorregida);
      const salidaBd = normalizarHoraParaBd(horaSalidaCorregida);
      const estatusFinalAsistencia = estatusCorregido || "Justificado";

      // Paso 1: SELECT id FROM asistencias WHERE colaborador_id = ticket.colaborador_id AND fecha = ticket.fecha_incidencia
      const { data: registrosExistentes, error: errorBusqueda } =
        await supabase
          .from("asistencias")
          .select("id")
          .eq("colaborador_id", ticket.colaborador_id)
          .eq("fecha", ticket.fecha_incidencia);

      if (errorBusqueda) {
        alert(
          "Error al verificar asistencia existente: " + errorBusqueda.message
        );
        setErrorMsg(
          "Error al verificar asistencia existente: " + errorBusqueda.message
        );
        return;
      }

      const registroExistente = registrosExistentes?.[0] ?? null;
      let asistenciaGuardada: AsistenciaConColaborador | null = null;

      if (registroExistente?.id) {
        // Paso 2a: SI EXISTE el registro -> hacer UPDATE cambiando estatus a 'Justificado', horas y ticket_id
        const { data: filasActualizadas, error: errorUpdateAsistencia } =
          await supabase
            .from("asistencias")
            .update({
              estatus: estatusFinalAsistencia,
              hora_entrada: entradaBd,
              hora_salida: salidaBd,
              ticket_id: ticket.id,
            })
            .eq("id", registroExistente.id)
            .select("*");

        if (errorUpdateAsistencia) {
          alert(
            "Error al actualizar el registro de asistencia: " +
              errorUpdateAsistencia.message
          );
          setErrorMsg(
            "Error al actualizar el registro de asistencia: " +
              errorUpdateAsistencia.message
          );
          return;
        }

        if (!filasActualizadas || filasActualizadas.length === 0) {
          const msgRls =
            "La base de datos no permitió actualizar el registro en 'asistencias' (verifica la política RLS de UPDATE para RH en la tabla 'asistencias').";
          alert("Error al actualizar asistencia: " + msgRls);
          setErrorMsg("Error al actualizar asistencia: " + msgRls);
          return;
        }

        const actualizada = filasActualizadas[0];
        asistenciaGuardada = {
          ...actualizada,
          colaboradores: ticket.colaboradores,
        };
      } else {
        // Paso 2b: SI NO EXISTE -> hacer INSERT creando el registro nuevo con estatus: 'Justificado' y ticket_id
        const { data: filasInsertadas, error: errorInsertAsistencia } =
          await supabase
            .from("asistencias")
            .insert({
              colaborador_id: ticket.colaborador_id,
              fecha: ticket.fecha_incidencia,
              hora_entrada: entradaBd,
              hora_salida: salidaBd,
              estatus: estatusFinalAsistencia,
              ticket_id: ticket.id,
            })
            .select("*");

        if (errorInsertAsistencia) {
          alert(
            "Error al crear el registro de asistencia: " +
              errorInsertAsistencia.message
          );
          setErrorMsg(
            "Error al crear el registro de asistencia: " +
              errorInsertAsistencia.message
          );
          return;
        }

        const insertada = filasInsertadas?.[0];
        if (insertada) {
          asistenciaGuardada = {
            ...insertada,
            colaboradores: ticket.colaboradores,
          };
        }
      }

      // Paso 3: Cerrar el Ticket en `tickets_asistencia` con `estatus: 'Resuelto'`, `comentarios_rh` y `resuelto_por`
      const { data: ticketCerrado, error: errorTicket } = await supabase
        .from("tickets_asistencia")
        .update({
          estatus: "Resuelto",
          comentarios_rh: comentariosRh.trim() || null,
          resuelto_por: user.id,
        })
        .eq("id", ticket.id)
        .select();

      if (errorTicket || !ticketCerrado?.length) {
        const msg =
          errorTicket?.message ||
          "No se pudo cerrar el ticket en 'tickets_asistencia' (verifica permisos RLS).";
        alert("Error al cerrar el ticket: " + msg);
        setErrorMsg("Error al cerrar el ticket: " + msg);
        return;
      }

      // Paso 4: Sincronizar UI sin recargar
      setTicketsPendientes((prev) => prev.filter((t) => t.id !== ticket.id));

      if (asistenciaGuardada) {
        setAsistencias((prev) => {
          const yaExiste = prev.some((a) => a.id === asistenciaGuardada!.id);
          if (yaExiste) {
            return prev.map((a) =>
              a.id === asistenciaGuardada!.id ? asistenciaGuardada! : a
            );
          }
          return [asistenciaGuardada!, ...prev];
        });
      }

      setTicketEnResolucion(null);
      setComentariosRh("");
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Ocurrió un error al resolver el ticket de asistencia.";
      alert("Error: " + msg);
      setErrorMsg("Error: " + msg);
    } finally {
      setProcesandoTicketId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Grid de Métricas Superiores Reales */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-center justify-between rounded-sm border border-gray-100 bg-brand-surface p-5 shadow-sm">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">
              REGISTROS MONITOREADOS
            </p>
            <p className="mt-1 font-mono text-2xl font-black text-gray-900">
              {metricas.total}
            </p>
            <p className="mt-1.5 text-[9px] font-bold uppercase tracking-wider text-brand-gold">
              ÚLTIMOS 50 MARCAJES
            </p>
          </div>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-dark text-brand-gold">
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-sm border border-gray-100 bg-brand-surface p-5 shadow-sm">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">
              RETARDOS REGISTRADOS
            </p>
            <p className="mt-1 font-mono text-2xl font-black text-gray-900">
              {metricas.retardos}
            </p>
            <p className="mt-1.5 text-[9px] font-bold text-status-warning">
              Tolerancia &gt; 15 min
            </p>
          </div>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-status-warning/10 text-status-warning">
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-sm border border-gray-100 bg-brand-surface p-5 shadow-sm">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">
              FALTAS POR RETARDOS
            </p>
            <p className="mt-1 font-mono text-2xl font-black text-gray-900">
              {metricas.faltasPorRetardos}
            </p>
            <p className="mt-1.5 text-[9px] font-medium text-gray-400">
              Regla 3 retardos = 1 falta
            </p>
          </div>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-status-danger/10 text-status-danger">
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-sm border border-gray-100 bg-brand-surface p-5 shadow-sm">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">
              TICKETS DE ASISTENCIA
            </p>
            <p className="mt-1 font-mono text-2xl font-black text-gray-900">
              {ticketsPendientes.length}
            </p>
            <p className="mt-1.5 text-[9px] font-bold uppercase tracking-wider text-brand-gold">
              ABIERTOS / EN REVISIÓN
            </p>
          </div>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-dark text-brand-gold">
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
        </div>
      </div>

      {/* 2. Tabla Superior: Tickets de Asistencia Pendientes */}
      <section className="overflow-hidden rounded-sm border border-gray-100 bg-brand-surface shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 bg-brand-beige/25 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">
              Tickets de Asistencia Pendientes
            </h2>
            <p className="mt-0.5 text-xs text-gray-400">
              Solicitudes en <code className="font-mono">tickets_asistencia</code>{" "}
              para justificar omisiones de marcaje y generar registro auditado
            </p>
          </div>

          <span className="rounded-sm bg-brand-dark px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-brand-gold">
            {ticketsPendientes.length} ABIERTO(S)
          </span>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse">
            <thead>
              <tr className="bg-brand-beige/60">
                {COLUMNAS_TICKETS.map(({ label, className }) => (
                  <th
                    key={label}
                    scope="col"
                    className={`px-6 py-3.5 text-[8px] font-bold uppercase tracking-widest text-gray-500 ${className}`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading && (
                <tr>
                  <td
                    colSpan={COLUMNAS_TICKETS.length}
                    className="px-6 py-6 text-center text-xs font-semibold text-gray-400"
                  >
                    Cargando tickets de asistencia...
                  </td>
                </tr>
              )}

              {!isLoading && ticketsPendientes.length === 0 && (
                <tr>
                  <td
                    colSpan={COLUMNAS_TICKETS.length}
                    className="px-6 py-6 text-center text-xs text-gray-400"
                  >
                    No hay tickets de asistencia abiertos por resolver.
                  </td>
                </tr>
              )}

              {!isLoading &&
                ticketsPendientes.map((ticket) => {
                  const nombreEmpleado = obtenerNombreColaborador(
                    ticket.colaboradores
                  );
                  const enProceso = procesandoTicketId === ticket.id;
                  const chipTicket =
                    ESTATUS_TICKET_CHIP[ticket.estatus] ??
                    ESTATUS_TICKET_CHIP.Abierto;

                  return (
                    <tr key={ticket.id} className="hover:bg-gray-50/50">
                      <td className="px-6 py-4">
                        <p className="text-xs font-bold text-gray-900">
                          {nombreEmpleado}
                        </p>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-gray-700">
                        {ticket.fecha_incidencia}
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-600">
                        {ticket.motivo_omision}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-block rounded-sm border px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest ${chipTicket.className}`}
                        >
                          {chipTicket.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={enProceso}
                            onClick={() => handleAbrirModalAprobacion(ticket)}
                            className="rounded-sm bg-status-success px-3 py-1.5 text-[8px] font-bold uppercase tracking-widest text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                          >
                            APROBAR
                          </button>
                          <button
                            type="button"
                            disabled={enProceso}
                            onClick={() => handleRechazarTicket(ticket)}
                            className="rounded-sm border border-status-danger/30 bg-status-danger/10 px-3 py-1.5 text-[8px] font-bold uppercase tracking-widest text-status-danger-dark transition-colors hover:bg-status-danger/20 disabled:opacity-50"
                          >
                            RECHAZAR
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. Monitor Global de Asistencias + Buscador Rápido */}
      <section className="overflow-hidden rounded-sm bg-brand-surface shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 bg-brand-beige/20 px-6 py-5">
          <div>
            <h2 className="text-base font-bold text-gray-900">
              Monitor Global de Asistencias
            </h2>
            <p className="mt-0.5 text-xs text-gray-400">
              Últimos 50 registros de entrada y salida de todos los colaboradores
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre del empleado..."
              aria-label="Filtrar asistencias por nombre del empleado"
              className="h-9 w-64 rounded-sm border border-gray-200 bg-brand-surface px-3 text-xs text-gray-800 placeholder-gray-400 focus:border-brand-dark focus:outline-none"
            />
          </div>
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
                {COLUMNAS_ASISTENCIAS.map(({ label, className }) => (
                  <th
                    key={label}
                    scope="col"
                    className={`px-6 py-3.5 text-[8px] font-bold uppercase tracking-widest text-gray-500 ${className}`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading && (
                <>
                  <tr>
                    <td
                      colSpan={COLUMNAS_ASISTENCIAS.length}
                      className="px-6 pt-6 pb-2 text-center text-xs font-semibold text-gray-500"
                    >
                      Cargando registros de asistencia...
                    </td>
                  </tr>
                  {[1, 2, 3, 4].map((fila) => (
                    <tr
                      key={fila}
                      aria-hidden="true"
                      className="animate-pulse"
                    >
                      <td className="px-6 py-4">
                        <div className="h-3 w-40 rounded bg-gray-200" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-3 w-24 rounded bg-gray-200" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-3 w-20 rounded bg-gray-200" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-3 w-20 rounded bg-gray-200" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="ml-auto h-4 w-20 rounded bg-gray-200" />
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {!isLoading && !errorMsg && asistenciasFiltradas.length === 0 && (
                <tr>
                  <td
                    colSpan={COLUMNAS_ASISTENCIAS.length}
                    className="px-6 py-8 text-center text-xs text-gray-400"
                  >
                    {searchTerm.trim()
                      ? "No se encontraron registros para el empleado buscado."
                      : "No hay registros de asistencia en la base de datos."}
                  </td>
                </tr>
              )}

              {!isLoading &&
                asistenciasFiltradas.map((asistencia) => {
                  const nombreEmpleado = obtenerNombreColaborador(
                    asistencia.colaboradores
                  );
                  const chip = obtenerChipEstatus(asistencia.estatus);

                  return (
                    <tr key={asistencia.id} className="hover:bg-gray-50/50">
                      <td className="px-6 py-4">
                        <p className="text-xs font-bold text-gray-900">
                          {nombreEmpleado}
                        </p>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-gray-700">
                        {asistencia.fecha}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-gray-600">
                        {formatearHora(asistencia.hora_entrada)}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-gray-600">
                        {formatearHora(asistencia.hora_salida)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span
                          className={`inline-block rounded-sm border px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest ${chip.className}`}
                        >
                          {chip.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal de Aprobación y Auditoría de Ticket de Asistencia (RH) */}
      {ticketEnResolucion && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-modal-resolucion-rh"
          className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden overscroll-contain bg-black/60 p-4"
        >
          <div className="w-full max-w-md overscroll-contain rounded-sm bg-brand-surface p-6 shadow-xl">
            <header className="mb-4">
              <p className="text-[9px] font-bold uppercase tracking-widest text-brand-gold">
                RESOLUCIÓN Y AUDITORÍA DE TICKET
              </p>
              <h3
                id="titulo-modal-resolucion-rh"
                className="mt-1 text-base font-black text-gray-900"
              >
                Aprobar Ticket y Registrar Asistencia
              </h3>
              <p className="mt-1 text-xs text-gray-500">
                Empleado:{" "}
                <strong className="text-gray-800">
                  {obtenerNombreColaborador(ticketEnResolucion.colaboradores)}
                </strong>{" "}
                • Fecha incidencia:{" "}
                <strong className="font-mono text-gray-800">
                  {ticketEnResolucion.fecha_incidencia}
                </strong>
              </p>
            </header>

            <form
              onSubmit={handleConfirmarResolucionTicket}
              className="flex flex-col gap-4"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="rh-corr-entrada"
                    className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-gray-400"
                  >
                    HORA ENTRADA CORRECTA
                  </label>
                  <input
                    id="rh-corr-entrada"
                    type="time"
                    value={horaEntradaCorregida}
                    onChange={(e) => setHoraEntradaCorregida(e.target.value)}
                    required
                    className="h-10 w-full rounded-sm border border-gray-200 bg-brand-beige/30 px-3 font-mono text-xs text-gray-800 focus:border-brand-dark focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="rh-corr-salida"
                    className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-gray-400"
                  >
                    HORA SALIDA CORRECTA
                  </label>
                  <input
                    id="rh-corr-salida"
                    type="time"
                    value={horaSalidaCorregida}
                    onChange={(e) => setHoraSalidaCorregida(e.target.value)}
                    required
                    className="h-10 w-full rounded-sm border border-gray-200 bg-brand-beige/30 px-3 font-mono text-xs text-gray-800 focus:border-brand-dark focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="rh-corr-estatus"
                  className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-gray-400"
                >
                  ESTATUS DE ASISTENCIA A REGISTRAR
                </label>
                <select
                  id="rh-corr-estatus"
                  value={estatusCorregido}
                  onChange={(e) => setEstatusCorregido(e.target.value)}
                  className="h-10 w-full rounded-sm border border-gray-200 bg-brand-beige/30 px-3 text-xs font-medium text-gray-800 focus:border-brand-dark focus:outline-none"
                >
                  <option value="Justificado">Justificado</option>
                  <option value="A Tiempo">A Tiempo</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="rh-comentarios-resolucion"
                  className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-gray-400"
                >
                  COMENTARIOS DE RH (OPCIONAL)
                </label>
                <textarea
                  id="rh-comentarios-resolucion"
                  value={comentariosRh}
                  onChange={(e) => setComentariosRh(e.target.value)}
                  placeholder="Observaciones o notas de auditoría de RH..."
                  className="h-20 w-full resize-y rounded-sm border border-gray-200 bg-brand-beige/30 p-3 text-xs text-gray-800 placeholder-gray-400 focus:border-brand-dark focus:outline-none"
                />
              </div>

              <div className="mt-2 flex items-center justify-end gap-2.5 border-t border-gray-100 pt-4">
                <button
                  type="button"
                  onClick={() => setTicketEnResolucion(null)}
                  disabled={Boolean(procesandoTicketId)}
                  className="h-9 rounded-sm border border-gray-200 bg-brand-surface px-4 text-[9px] font-bold uppercase tracking-widest text-gray-700 hover:bg-gray-50"
                >
                  CANCELAR
                </button>
                <button
                  type="submit"
                  disabled={Boolean(procesandoTicketId)}
                  className="h-9 rounded-sm bg-status-success px-4 text-[9px] font-bold uppercase tracking-widest text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {procesandoTicketId
                    ? "GUARDANDO..."
                    : "APROBAR Y REGISTRAR ASISTENCIA"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
