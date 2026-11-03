"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import {
  obtenerNotificacionesPendientesAction,
  type NotificacionPendienteItem,
} from "@/app/actions/notificaciones";
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

export type { NotificacionPendienteItem };

interface NotificacionesProactivasModalProps {
  userId?: string;
  rolSistema?: RolSistema | string | null;
  esJefatura?: boolean;
  notificacionesIniciales?: NotificacionPendienteItem[];
}

const SESSION_STORAGE_KEY = "aif_notificaciones_inicio_cerrado";
const SESSION_LOGIN_RECIENTE_KEY = "aif_recien_iniciado_sesion";

/**
 * Bandera en memoria del módulo cliente:
 * - Solo cambia a `true` cuando el usuario pulsa explícitamente el botón de cerrar.
 * - Al hacer clic en una tarjeta para ir a atender una solicitud, NO se marca como cerrado,
 *   de modo que al volver a "Inicio" desde la Sidebar el modal sigue abierto para atender las demás.
 * - Se reinicia a `false` al iniciar sesión, cerrar sesión o recargar la página (F5 / Cmd+R).
 */
let cerradoPorBotonEnSesion = false;
let ultimoUserIdEnMemoria: string | null = null;
let recargaVerificadaEnCarga = false;

function obtenerKeyUsuario(userId?: string | null): string {
  return userId ? `${SESSION_STORAGE_KEY}_${userId}` : SESSION_STORAGE_KEY;
}

/**
 * Reinicia el estado de cierre de notificaciones al iniciar o cerrar sesión
 * para garantizar que el overlay con blur aparezca siempre en el primer inicio de sesión.
 */
export function reiniciarEstadoNotificacionesInicio(marcarLoginReciente = false) {
  cerradoPorBotonEnSesion = false;
  ultimoUserIdEnMemoria = null;

  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    for (let i = window.sessionStorage.length - 1; i >= 0; i--) {
      const k = window.sessionStorage.key(i);
      if (k && k.startsWith(SESSION_STORAGE_KEY)) {
        window.sessionStorage.removeItem(k);
      }
    }
    if (marcarLoginReciente) {
      window.sessionStorage.setItem(SESSION_LOGIN_RECIENTE_KEY, "true");
    }
  } catch {
    // Ignorar errores de sessionStorage
  }
}

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
  notificacionesIniciales,
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

  const tieneIniciales = Array.isArray(notificacionesIniciales);
  const [notificaciones, setNotificaciones] = useState<
    NotificacionPendienteItem[]
  >(notificacionesIniciales ?? []);
  const [cargando, setCargando] = useState<boolean>(!tieneIniciales);
  const [cerradoPorUsuario, setCerradoPorUsuario] = useState<boolean>(false);
  const [abiertoDesdeTarjeta, setAbiertoDesdeTarjeta] =
    useState<boolean>(false);

  // Sincronizar si llegan nuevas notificaciones iniciales desde el Server Component
  useEffect(() => {
    if (Array.isArray(notificacionesIniciales)) {
      setNotificaciones(notificacionesIniciales);
      setCargando(false);
    }
  }, [notificacionesIniciales]);

  // Verificar estado en sessionStorage + detectar nuevo inicio de sesión o recarga completa
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Si cambió el usuario autenticado en memoria, reiniciar el estado de cerrado
    if (userId && ultimoUserIdEnMemoria && ultimoUserIdEnMemoria !== userId) {
      cerradoPorBotonEnSesion = false;
    }
    if (userId) {
      ultimoUserIdEnMemoria = userId;
    }

    const keyUsuario = obtenerKeyUsuario(userId);

    try {
      const loginReciente = window.sessionStorage.getItem(
        SESSION_LOGIN_RECIENTE_KEY
      );
      if (loginReciente === "true") {
        window.sessionStorage.removeItem(SESSION_LOGIN_RECIENTE_KEY);
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
        window.sessionStorage.removeItem(keyUsuario);
        cerradoPorBotonEnSesion = false;
        setCerradoPorUsuario(false);
        return;
      }
    } catch {
      // Ignorar errores de sessionStorage
    }

    if (!recargaVerificadaEnCarga) {
      recargaVerificadaEnCarga = true;
      const navEntries = window.performance?.getEntriesByType?.(
        "navigation"
      ) as PerformanceNavigationTiming[] | undefined;
      const fueReload = navEntries?.[0]?.type === "reload";

      if (fueReload) {
        try {
          window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
          window.sessionStorage.removeItem(keyUsuario);
        } catch {
          // Ignorar errores de sessionStorage
        }
        cerradoPorBotonEnSesion = false;
        setCerradoPorUsuario(false);
        return;
      }
    }

    try {
      const guardado =
        window.sessionStorage.getItem(keyUsuario) ??
        window.sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (cerradoPorBotonEnSesion || guardado === "true") {
        setCerradoPorUsuario(true);
      } else {
        setCerradoPorUsuario(false);
      }
    } catch {
      setCerradoPorUsuario(cerradoPorBotonEnSesion);
    }
  }, [userId]);

  // Consultas a servidor y respaldo cliente para obtener todas las notificaciones pendientes
  useEffect(() => {
    let cancelado = false;

    async function cargarNotificacionesPendientes() {
      if (!tieneIniciales) {
        setCargando(true);
      }

      try {
        // 1. Vía principal: Server Action (resuelve perfil real, evita errores de ENUM 22P02 y bloqueos RLS)
        const resServidor = await obtenerNotificacionesPendientesAction();
        if (!cancelado && resServidor.ok) {
          setNotificaciones(resServidor.notificaciones);
          setCargando(false);
          return;
        }

        // 2. Respaldo cliente directo a Supabase si el Server Action no respondió
        if (!tieneJefatura && !esRecursosHumanos) {
          if (!cancelado) {
            setNotificaciones([]);
            setCargando(false);
          }
          return;
        }

        const supabase = createClient();
        const itemsAcumulados: NotificacionPendienteItem[] = [];

        let currentUserId = userId;
        if (!currentUserId) {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          currentUserId = user?.id ?? null;
        }

        if (tieneJefatura && currentUserId) {
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

        if (esRecursosHumanos) {
          const [solicitudesRhRes, comentariosMuroRes, ticketsAsistenciaRes] =
            await Promise.all([
              supabase
                .from("solicitudes")
                .select(
                  "id, tipo_solicitud, fecha_inicio, fecha_fin, estatus, colaboradores!colaborador_id(nombre_completo)"
                )
                .in("tipo_solicitud", [
                  "Vacaciones pagadas",
                  "Vacaciones Pagadas",
                  "Incapacidad",
                ])
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
                .order("created_at", { ascending: false }),
            ]);

          for (const sol of solicitudesRhRes.data ?? []) {
            if (!esEstatusPendienteSolicitud(sol.estatus)) continue;
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

          for (const ticket of ticketsAsistenciaRes.data ?? []) {
            const est = (ticket.estatus ?? "").trim().toLowerCase();
            if (est !== "abierto" && est !== "en_revision") continue;
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
  }, [esRecursosHumanos, tieneIniciales, tieneJefatura, userId]);

  const handleCerrarPorBoton = () => {
    cerradoPorBotonEnSesion = true;
    if (typeof window !== "undefined") {
      try {
        const keyUsuario = obtenerKeyUsuario(userId);
        window.sessionStorage.setItem(SESSION_STORAGE_KEY, "true");
        window.sessionStorage.setItem(keyUsuario, "true");
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
        const keyUsuario = obtenerKeyUsuario(userId);
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
        window.sessionStorage.removeItem(keyUsuario);
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
  });

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
