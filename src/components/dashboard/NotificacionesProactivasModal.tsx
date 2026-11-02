"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { obtenerSolicitudesEquipoAction } from "@/app/actions/jefatura";
import { useAuthRole } from "@/components/auth/AuthRoleContext";
import {
  CheckCircleIcon,
  ChevronRightIcon,
  FileTextIcon,
  MessageSquareIcon,
  TicketIcon,
} from "@/components/ui/icons";
import type { RolSistema } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/client";

export interface NotificacionPendienteItem {
  id: string;
  categoria:
    | "solicitud_jefatura"
    | "solicitud_rh"
    | "comentario_muro"
    | "ticket_asistencia";
  etiqueta: string;
  titulo: string;
  detalle: string;
  href: string;
}

interface NotificacionesProactivasModalProps {
  userId?: string;
  rolSistema?: RolSistema | string | null;
  esJefatura?: boolean;
}

const SESSION_STORAGE_KEY = "aif_notificaciones_inicio_cerrado";

/**
 * Bandera en memoria del módulo cliente:
 * - Solo cambia a `true` cuando el usuario pulsa explícitamente el botón de cerrar.
 * - Al hacer clic en una tarjeta para ir a atender una solicitud, NO se marca como cerrado,
 *   de modo que al volver a "Inicio" desde la Sidebar el modal sigue abierto para atender las demás.
 * - Se reinicia a `false` si el usuario recarga la página por completo (F5 / Cmd+R).
 */
let cerradoPorBotonEnSesion = false;
let recargaVerificadaEnCarga = false;

interface ColaboradorRel {
  nombre_completo?: string | null;
}

function extraerNombreColaborador(
  rel: ColaboradorRel | ColaboradorRel[] | null | undefined
): string {
  if (!rel) return "Colaborador";
  if (Array.isArray(rel)) {
    return rel[0]?.nombre_completo?.trim() || "Colaborador";
  }
  return rel.nombre_completo?.trim() || "Colaborador";
}

function esEstatusPendienteSolicitud(
  estatus: string | null | undefined
): boolean {
  const limpio = (estatus ?? "").trim().toLowerCase();
  return (
    limpio === "pendiente" ||
    limpio === "pendiente_jefe" ||
    limpio === "pendiente_rh"
  );
}

/**
 * Renderiza la tarjeta oscura "Últimas Notificaciones" en el grid superior de Inicio
 * y controla el Overlay con blur centrado exclusivamente sobre la sección principal (`left-64 right-0`),
 * dejando descubierta la barra lateral (`Sidebar`).
 */
export default function NotificacionesProactivasModal({
  userId: userIdProp,
  rolSistema: rolSistemaProp,
  esJefatura: esJefaturaProp,
}: NotificacionesProactivasModalProps) {
  const uid = useId();
  const contexto = useAuthRole();

  const userId = userIdProp || contexto.userId;
  const rolSistema = (
    rolSistemaProp ??
    contexto.rolSistema ??
    "Colaborador"
  ).trim();
  const tieneJefatura =
    rolSistema === "Jefatura" ||
    Boolean(esJefaturaProp ?? contexto.esJefatura);
  const esRecursosHumanos = rolSistema === "Recursos Humanos";

  const [notificaciones, setNotificaciones] = useState<
    NotificacionPendienteItem[]
  >([]);
  const [cargando, setCargando] = useState<boolean>(true);
  const [cerradoPorUsuario, setCerradoPorUsuario] = useState<boolean>(false);
  const [abiertoDesdeTarjeta, setAbiertoDesdeTarjeta] =
    useState<boolean>(false);

  // Verificar estado en sessionStorage + detectar recarga completa del navegador
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!recargaVerificadaEnCarga) {
      recargaVerificadaEnCarga = true;
      const navEntries = window.performance?.getEntriesByType?.(
        "navigation"
      ) as PerformanceNavigationTiming[] | undefined;
      const fueReload = navEntries?.[0]?.type === "reload";

      if (fueReload) {
        try {
          window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
        } catch {
          // Ignorar errores de sessionStorage
        }
        cerradoPorBotonEnSesion = false;
      }
    }

    try {
      const guardado = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (cerradoPorBotonEnSesion || guardado === "true") {
        setCerradoPorUsuario(true);
      }
    } catch {
      if (cerradoPorBotonEnSesion) {
        setCerradoPorUsuario(true);
      }
    }
  }, []);

  // Consultas condicionales por rol a Supabase (siempre se cargan para poblar la tarjeta y el overlay)
  useEffect(() => {
    if (!tieneJefatura && !esRecursosHumanos) {
      setNotificaciones([]);
      setCargando(false);
      return;
    }

    let cancelado = false;

    async function cargarNotificacionesPendientes() {
      setCargando(true);
      const supabase = createClient();
      const itemsAcumulados: NotificacionPendienteItem[] = [];

      try {
        let currentUserId = userId;
        if (!currentUserId) {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          currentUserId = user?.id ?? null;
        }

        // 1. Consultas Jefatura (`rol_sistema === 'Jefatura'` o `es_jefatura === true`)
        if (tieneJefatura && currentUserId) {
          const { data: equipoData } = await supabase
            .from("colaboradores")
            .select("id, nombre_completo")
            .eq("jefe_directo_id", currentUserId);

          const equipoIds = (equipoData ?? []).map((c) => c.id);
          let solicitudesJefeCargadas = false;

          if (equipoIds.length > 0) {
            const { data: solicitudesJefe, error: errorSolJefe } =
              await supabase
                .from("solicitudes")
                .select(
                  "id, tipo_solicitud, fecha_inicio, fecha_fin, estatus, colaboradores!solicitudes_colaborador_id_fkey(nombre_completo)"
                )
                .in("colaborador_id", equipoIds)
                .in("estatus", ["Pendiente", "Pendiente_Jefe"])
                .in("tipo_solicitud", [
                  "Permiso sin goce de sueldo",
                  "Permiso con goce de sueldo",
                  "Vacaciones",
                ])
                .order("created_at", { ascending: false });

            if (!errorSolJefe && solicitudesJefe && solicitudesJefe.length > 0) {
              solicitudesJefeCargadas = true;
              for (const sol of solicitudesJefe) {
                const nombre = extraerNombreColaborador(
                  (sol as Record<string, unknown>).colaboradores as
                    | ColaboradorRel
                    | ColaboradorRel[]
                    | null
                );
                const tipoLower = (
                  sol.tipo_solicitud || "solicitud"
                ).toLowerCase();
                itemsAcumulados.push({
                  id: `jefe-sol-${sol.id}`,
                  categoria: "solicitud_jefatura",
                  etiqueta: "MI EQUIPO • PENDIENTE DE APROBACIÓN",
                  titulo: `Nueva solicitud de ${tipoLower}`,
                  detalle: `${nombre} · Del ${sol.fecha_inicio} al ${sol.fecha_fin}`,
                  href: `/dashboard/jefatura?solicitudId=${sol.id}#solicitud-${sol.id}`,
                });
              }
            }
          }

          if (!solicitudesJefeCargadas) {
            const serverRes = await obtenerSolicitudesEquipoAction();
            if (serverRes.ok) {
              const pendientesEquipo = serverRes.solicitudes.filter((s) =>
                esEstatusPendienteSolicitud(s.estatus)
              );
              for (const sol of pendientesEquipo) {
                const tipoLower = (
                  sol.tipo_solicitud || "solicitud"
                ).toLowerCase();
                itemsAcumulados.push({
                  id: `jefe-sol-${sol.id}`,
                  categoria: "solicitud_jefatura",
                  etiqueta: "MI EQUIPO • PENDIENTE DE APROBACIÓN",
                  titulo: `Nueva solicitud de ${tipoLower}`,
                  detalle: `${sol.nombre_colaborador} · Del ${sol.fecha_inicio} al ${sol.fecha_fin}`,
                  href: `/dashboard/jefatura?solicitudId=${sol.id}#solicitud-${sol.id}`,
                });
              }
            }
          }
        }

        // 2. Consultas Recursos Humanos (`rol_sistema === 'Recursos Humanos'`) en paralelo con Promise.all
        if (esRecursosHumanos) {
          const [solicitudesRhRes, comentariosMuroRes, ticketsAsistenciaRes] =
            await Promise.all([
              supabase
                .from("solicitudes")
                .select(
                  "id, tipo_solicitud, fecha_inicio, fecha_fin, estatus, colaboradores!colaborador_id(nombre_completo)"
                )
                .in("estatus", ["Pendiente", "Pendiente_RH", "Pendiente_Jefe"])
                .in("tipo_solicitud", ["Vacaciones Pagadas", "Incapacidad"])
                .order("created_at", { ascending: false }),

              supabase
                .from("muro_interacciones")
                .select(
                  "id, contenido_comentario, colaboradores!colaborador_id(nombre_completo)"
                )
                .eq("tipo_interaccion", "Comentario")
                .eq("estatus_moderacion", "Pendiente")
                .order("created_at", { ascending: false }),

              supabase
                .from("tickets_asistencia")
                .select(
                  "id, fecha_incidencia, motivo_omision, estatus, colaboradores!tickets_asistencia_colaborador_id_fkey(nombre_completo)"
                )
                .in("estatus", ["Abierto", "En_Revision"])
                .order("created_at", { ascending: false }),
            ]);

          for (const sol of solicitudesRhRes.data ?? []) {
            const nombre = extraerNombreColaborador(
              (sol as Record<string, unknown>).colaboradores as
                | ColaboradorRel
                | ColaboradorRel[]
                | null
            );
            const tipoLower = (sol.tipo_solicitud || "solicitud").toLowerCase();
            itemsAcumulados.push({
              id: `rh-sol-${sol.id}`,
              categoria: "solicitud_rh",
              etiqueta: "PANEL RH • GESTIÓN DE SOLICITUDES",
              titulo: `Nueva solicitud de ${tipoLower}`,
              detalle: `${nombre} · Del ${sol.fecha_inicio} al ${sol.fecha_fin}`,
              href: `/dashboard/rh?tab=solicitudes&solicitudId=${sol.id}#solicitud-${sol.id}`,
            });
          }

          for (const com of comentariosMuroRes.data ?? []) {
            const nombre = extraerNombreColaborador(
              (com as Record<string, unknown>).colaboradores as
                | ColaboradorRel
                | ColaboradorRel[]
                | null
            );
            const extracto = (com.contenido_comentario ?? "")
              .trim()
              .slice(0, 65);
            itemsAcumulados.push({
              id: `rh-com-${com.id}`,
              categoria: "comentario_muro",
              etiqueta: "PANEL RH • MODERACIÓN DE MURO",
              titulo: "Comentario pendiente de moderación",
              detalle: extracto
                ? `${nombre}: "${extracto}${
                    (com.contenido_comentario ?? "").length > 65 ? "…" : ""
                  }"`
                : `Enviado por ${nombre}`,
              href: `/dashboard/rh?tab=comunicados&comentarioId=${com.id}#comentario-${com.id}`,
            });
          }

          let ticketsRows = ticketsAsistenciaRes.data;
          if (ticketsAsistenciaRes.error) {
            const fallbackTickets = await supabase
              .from("tickets_asistencia")
              .select(
                "id, fecha_incidencia, motivo_omision, estatus, colaboradores!colaborador_id(nombre_completo)"
              )
              .in("estatus", ["Abierto", "En_Revision"])
              .order("created_at", { ascending: false });
            ticketsRows = fallbackTickets.data;
          }

          for (const ticket of ticketsRows ?? []) {
            const nombre = extraerNombreColaborador(
              (ticket as Record<string, unknown>).colaboradores as
                | ColaboradorRel
                | ColaboradorRel[]
                | null
            );
            itemsAcumulados.push({
              id: `rh-tkt-${ticket.id}`,
              categoria: "ticket_asistencia",
              etiqueta: "PANEL RH • MONITOR DE ASISTENCIA",
              titulo: "Ticket de asistencia por resolver",
              detalle: `${nombre} · Incidencia del ${ticket.fecha_incidencia}`,
              href: `/dashboard/rh?tab=asistencia&ticketId=${ticket.id}#ticket-${ticket.id}`,
            });
          }
        }

        if (!cancelado) {
          setNotificaciones(itemsAcumulados);
        }
      } finally {
        if (!cancelado) {
          setCargando(false);
        }
      }
    }

    cargarNotificacionesPendientes();

    return () => {
      cancelado = true;
    };
  }, [esRecursosHumanos, tieneJefatura, userId]);

  const handleCerrarPorBoton = () => {
    cerradoPorBotonEnSesion = true;
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(SESSION_STORAGE_KEY, "true");
      } catch {
        // Ignorar errores de sessionStorage
      }
    }
    setCerradoPorUsuario(true);
    setAbiertoDesdeTarjeta(false);
  };

  const handleAbrirDesdeTarjeta = () => {
    cerradoPorBotonEnSesion = false;
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      } catch {
        // Ignorar errores de sessionStorage
      }
    }
    setCerradoPorUsuario(false);
    setAbiertoDesdeTarjeta(true);
  };

  const mostrarOverlay =
    !cargando &&
    (abiertoDesdeTarjeta ||
      (!cerradoPorUsuario && notificaciones.length > 0));

  // Cerrar con tecla Escape
  useEffect(() => {
    if (!mostrarOverlay) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleCerrarPorBoton();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mostrarOverlay]);

  const renderIconoCategoria = (
    categoria: NotificacionPendienteItem["categoria"]
  ) => {
    if (categoria === "comentario_muro") {
      return <MessageSquareIcon className="h-4 w-4 text-brand-gold" />;
    }
    if (categoria === "ticket_asistencia") {
      return <TicketIcon className="h-4 w-4 text-brand-gold" />;
    }
    return <FileTextIcon className="h-4 w-4 text-brand-gold" />;
  };

  const primerasNotificaciones = notificaciones.slice(0, 2);

  return (
    <>
      {/* Tarjeta oscura "Últimas Notificaciones" en el grid superior de Inicio */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleAbrirDesdeTarjeta}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleAbrirDesdeTarjeta();
          }
        }}
        aria-label="Abrir centro de últimas notificaciones"
        className="flex cursor-pointer flex-col justify-between rounded-md bg-brand-dark p-6 text-left shadow-sm transition-all hover:bg-brand-dark/95 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-gold"
      >
        <div>
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-brand-gold">
              ÚLTIMAS NOTIFICACIONES
            </span>
            {!cargando && notificaciones.length > 0 && (
              <span className="rounded-full bg-brand-gold px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-brand-dark">
                {notificaciones.length}{" "}
                {notificaciones.length === 1 ? "PENDIENTE" : "PENDIENTES"}
              </span>
            )}
          </div>

          <h2 className="mb-3 font-serif text-lg font-bold leading-tight text-white">
            {cargando
              ? "Consultando notificaciones…"
              : notificaciones.length > 0
                ? `Tienes ${notificaciones.length} ${
                    notificaciones.length === 1
                      ? "tarea pendiente"
                      : "tareas pendientes"
                  } por atender`
                : "Sin notificaciones pendientes"}
          </h2>

          {cargando ? (
            <p className="text-xs leading-relaxed text-gray-300">
              Verificando solicitudes, moderación y tickets activos…
            </p>
          ) : primerasNotificaciones.length > 0 ? (
            <ul className="space-y-2">
              {primerasNotificaciones.map((item) => (
                <li
                  key={item.id}
                  className="rounded-sm border border-white/10 bg-white/5 px-3 py-2"
                >
                  <p className="truncate text-xs font-semibold text-white">
                    {item.titulo}
                  </p>
                  <p className="truncate text-[11px] text-gray-300">
                    {item.detalle}
                  </p>
                </li>
              ))}
              {notificaciones.length > 2 && (
                <p className="pt-0.5 text-[10px] font-semibold uppercase tracking-widest text-brand-gold">
                  + {notificaciones.length - 2} más por revisar
                </p>
              )}
            </ul>
          ) : (
            <p className="text-xs leading-relaxed text-gray-300">
              No tienes solicitudes, comentarios ni tickets pendientes por
              resolver en este momento. Haz clic para abrir el panel.
            </p>
          )}
        </div>

        <span className="mt-6 block w-full rounded-md bg-white/10 py-3 text-center text-xs font-semibold text-white transition-colors hover:bg-white/20">
          VER NOTIFICACIONES COMPLETAS
        </span>
      </div>

      {/* Overlay con blur centrado sobre la sección principal (sin cubrir la Sidebar w-64) */}
      {mostrarOverlay && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`titulo-notificaciones-${uid}`}
          className="fixed inset-y-0 left-64 right-0 z-40 flex items-center justify-center overflow-hidden overscroll-contain bg-white/40 p-6 backdrop-blur-md"
        >
          <div className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-md border border-gray-200/80 bg-brand-surface shadow-2xl">
            {/* Encabezado */}
            <header className="flex items-start justify-between gap-4 border-b border-gray-100 bg-brand-beige/30 px-7 py-5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-brand-gold" />
                  <span className="text-[9px] font-bold uppercase tracking-widest text-brand-gold">
                    ATENCIÓN PRIORITARIA • {notificaciones.length}{" "}
                    {notificaciones.length === 1 ? "PENDIENTE" : "PENDIENTES"}
                  </span>
                </div>
                <h2
                  id={`titulo-notificaciones-${uid}`}
                  className="mt-1 font-serif text-xl font-bold text-gray-900"
                >
                  Últimas Notificaciones
                </h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  Selecciona una tarjeta para ir directamente a la solicitud. Al
                  volver a Inicio, el listado seguirá disponible hasta que lo
                  cierres.
                </p>
              </div>

              <button
                type="button"
                onClick={handleCerrarPorBoton}
                aria-label="Cerrar notificaciones"
                className="shrink-0 rounded-sm border border-gray-200 bg-white px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-gray-600 transition-colors hover:border-brand-dark hover:text-brand-dark"
              >
                CERRAR
              </button>
            </header>

            {/* Lista de Tarjetas Dinámicas */}
            <div className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-7 py-5">
              {notificaciones.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                  <CheckCircleIcon className="h-8 w-8 text-status-success" />
                  <p className="text-xs font-bold text-gray-800">
                    Todo está al día
                  </p>
                  <p className="max-w-xs text-[11px] text-gray-500">
                    No tienes solicitudes, comentarios de muro ni tickets de
                    asistencia pendientes en este momento.
                  </p>
                </div>
              ) : (
                notificaciones.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="group flex items-center justify-between gap-4 rounded-sm border border-gray-200/90 bg-white p-4 shadow-sm transition-all hover:border-brand-gold hover:bg-brand-beige/30 hover:shadow-md"
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-dark transition-transform group-hover:scale-105">
                        {renderIconoCategoria(item.categoria)}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[8px] font-bold uppercase tracking-widest text-brand-gold">
                          {item.etiqueta}
                        </span>
                        <h3 className="mt-0.5 text-xs font-bold text-gray-900 group-hover:text-brand-dark">
                          {item.titulo}
                        </h3>
                        <p className="mt-0.5 text-[11px] text-gray-500">
                          {item.detalle}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-gray-400 transition-colors group-hover:text-brand-dark">
                      <span>ATENDER</span>
                      <ChevronRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </Link>
                ))
              )}
            </div>

            {/* Pie del Modal */}
            <footer className="flex items-center justify-between border-t border-gray-100 bg-brand-beige/20 px-7 py-4">
              <span className="text-[10px] text-gray-400">
                Permanece activo al volver a Inicio hasta pulsar Cerrar.
              </span>
              <button
                type="button"
                onClick={handleCerrarPorBoton}
                className="rounded-sm bg-brand-dark px-5 py-2 text-[9px] font-bold uppercase tracking-widest text-brand-gold transition-colors hover:bg-brand-dark/90"
              >
                CERRAR NOTIFICACIONES
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
