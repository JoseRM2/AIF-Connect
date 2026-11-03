"use server";

import { normalizarRolSistema } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSessionClient } from "@/lib/supabase/server";

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

export interface ObtenerNotificacionesResult {
  ok: boolean;
  userId: string | null;
  rolSistema: string;
  esJefatura: boolean;
  notificaciones: NotificacionPendienteItem[];
}

function normalizarTexto(valor: unknown): string {
  return String(valor ?? "")
    .trim()
    .toLowerCase();
}

function construirNombreColaborador(
  colab: Record<string, unknown> | null | undefined
): string {
  if (!colab) return "Colaborador";
  const concatenado = `${String(colab.nombre ?? "").trim()} ${String(
    colab.apellidos ?? ""
  ).trim()}`.trim();
  if (concatenado) return concatenado;
  const completo = String(colab.nombre_completo ?? "").trim();
  return completo || "Colaborador";
}

function esEstatusPendienteSolicitud(estatus: unknown): boolean {
  const limpio = normalizarTexto(estatus);
  return (
    limpio === "pendiente" ||
    limpio === "pendiente_jefe" ||
    limpio === "pendiente_rh"
  );
}

function esTipoJefatura(tipo: unknown): boolean {
  const limpio = normalizarTexto(tipo);
  return (
    limpio === "vacaciones" ||
    limpio === "permiso sin goce de sueldo" ||
    limpio === "permiso con goce de sueldo" ||
    limpio === "permiso_sin_goce" ||
    limpio === "permiso_con_goce"
  );
}

function esTipoRH(tipo: unknown): boolean {
  const limpio = normalizarTexto(tipo);
  return (
    limpio === "vacaciones pagadas" ||
    limpio === "vacaciones_pagadas" ||
    limpio === "incapacidad"
  );
}

function esTicketPendiente(estatus: unknown): boolean {
  const limpio = normalizarTexto(estatus);
  return (
    limpio === "abierto" ||
    limpio === "en_revision" ||
    limpio === "en revisión" ||
    limpio === "pendiente"
  );
}

function perteneceAlEquipoDelJefe(
  colaborador: Record<string, unknown>,
  jefeIds: string[],
  nombreJefeNorm: string
): boolean {
  const colJefeId = normalizarTexto(colaborador.jefe_directo_id);
  const colJefeTexto = normalizarTexto(colaborador.jefe_directo);

  for (const id of jefeIds) {
    const idNorm = normalizarTexto(id);
    if (!idNorm) continue;
    if (colJefeId && colJefeId === idNorm) return true;
    if (colJefeTexto && colJefeTexto === idNorm) return true;
  }

  if (nombreJefeNorm && colJefeTexto && colJefeTexto === nombreJefeNorm) {
    return true;
  }
  return false;
}

/**
 * Obtiene en servidor todas las notificaciones pendientes del usuario autenticado
 * (Solicitudes de equipo directo para Jefatura, y Solicitudes RH / Moderación de Muro /
 * Tickets de Asistencia para Recursos Humanos).
 * Filtra estatus y tipos en memoria para evitar errores de ENUM (22P02) o bloqueos RLS.
 */
export async function obtenerNotificacionesPendientesAction(): Promise<ObtenerNotificacionesResult> {
  try {
    const sesion = createSessionClient();
    const {
      data: { user },
    } = await sesion.auth.getUser();

    if (!user) {
      return {
        ok: false,
        userId: null,
        rolSistema: "Colaborador",
        esJefatura: false,
        notificaciones: [],
      };
    }

    let db: ReturnType<typeof createAdminClient>;
    try {
      db = createAdminClient();
    } catch {
      db = sesion as unknown as ReturnType<typeof createAdminClient>;
    }

    // 1. Cargar todos los colaboradores para resolver perfil actual, equipo directo y nombres
    const { data: todosColaboradores } = await db
      .from("colaboradores")
      .select("*");

    const listaColaboradores = (todosColaboradores ?? []) as unknown as Record<
      string,
      unknown
    >[];
    const mapaColaboradores = new Map<string, Record<string, unknown>>();
    for (const c of listaColaboradores) {
      if (c.id) {
        mapaColaboradores.set(String(c.id), c);
      }
    }

    let perfilActual = mapaColaboradores.get(user.id) ?? null;
    if (!perfilActual && user.email) {
      const emailNorm = normalizarTexto(user.email);
      perfilActual =
        listaColaboradores.find(
          (c) =>
            normalizarTexto(c.correo_corporativo) === emailNorm ||
            normalizarTexto(c.correo) === emailNorm
        ) ?? null;
    }

    const rolSistema = normalizarRolSistema(
      perfilActual?.rol_sistema as string | null | undefined
    );
    const tieneJefatura =
      rolSistema === "Jefatura" || Boolean(perfilActual?.es_jefatura);
    const esRecursosHumanos = rolSistema === "Recursos Humanos";

    if (!tieneJefatura && !esRecursosHumanos) {
      return {
        ok: true,
        userId: user.id,
        rolSistema,
        esJefatura: tieneJefatura,
        notificaciones: [],
      };
    }

    const itemsAcumulados: NotificacionPendienteItem[] = [];

    // Consultas en paralelo de las tablas necesarias
    const [solicitudesRes, comentariosMuroRes, ticketsAsistenciaRes] =
      await Promise.all([
        db
          .from("solicitudes")
          .select("*")
          .order("created_at", { ascending: false }),
        esRecursosHumanos
          ? db
              .from("muro_interacciones")
              .select("*")
              .eq("tipo_interaccion", "Comentario")
              .eq("estatus_moderacion", "Pendiente")
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: null, error: null }),
        esRecursosHumanos
          ? db
              .from("tickets_asistencia")
              .select("*")
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: null, error: null }),
      ]);

    const todasSolicitudes = (solicitudesRes.data ?? []) as unknown as Record<
      string,
      unknown
    >[];

    // 2. Notificaciones de Jefatura (solicitudes pendientes de su equipo directo)
    if (tieneJefatura) {
      const idsJefe = Array.from(
        new Set(
          [user.id, perfilActual?.id ? String(perfilActual.id) : ""].filter(
            Boolean
          )
        )
      );
      const nombreJefeNorm = normalizarTexto(
        construirNombreColaborador(perfilActual)
      );

      const equipoIds = new Set<string>();
      for (const c of listaColaboradores) {
        if (perteneceAlEquipoDelJefe(c, idsJefe, nombreJefeNorm) && c.id) {
          equipoIds.add(String(c.id));
        }
      }

      for (const sol of todasSolicitudes) {
        const colabId = String(sol.colaborador_id ?? "");
        const tipoSol = sol.tipo_solicitud || sol.tipo || "Solicitud";
        if (
          equipoIds.has(colabId) &&
          esEstatusPendienteSolicitud(sol.estatus) &&
          esTipoJefatura(tipoSol)
        ) {
          const colab = mapaColaboradores.get(colabId);
          const nombre = construirNombreColaborador(colab);
          const tipoLower = String(tipoSol).toLowerCase();
          const solId = String(sol.id);

          itemsAcumulados.push({
            id: `jefe-sol-${solId}`,
            categoria: "solicitud_jefatura",
            etiqueta: "MI EQUIPO • PENDIENTE DE APROBACIÓN",
            titulo: `Nueva solicitud de ${tipoLower}`,
            detalle: `${nombre} · Del ${String(
              sol.fecha_inicio ?? ""
            )} al ${String(sol.fecha_fin ?? "")}`,
            href: `/dashboard/jefatura?solicitudId=${solId}#solicitud-${solId}`,
          });
        }
      }
    }

    // 3. Notificaciones de Recursos Humanos (solicitudes RH, moderación de muro, tickets de asistencia)
    if (esRecursosHumanos) {
      for (const sol of todasSolicitudes) {
        const tipoSol = sol.tipo_solicitud || sol.tipo || "Solicitud";
        if (esEstatusPendienteSolicitud(sol.estatus) && esTipoRH(tipoSol)) {
          const colab = mapaColaboradores.get(String(sol.colaborador_id ?? ""));
          const nombre = construirNombreColaborador(colab);
          const tipoLower = String(tipoSol).toLowerCase();
          const solId = String(sol.id);

          itemsAcumulados.push({
            id: `rh-sol-${solId}`,
            categoria: "solicitud_rh",
            etiqueta: "PANEL RH • GESTIÓN DE SOLICITUDES",
            titulo: `Nueva solicitud de ${tipoLower}`,
            detalle: `${nombre} · Del ${String(
              sol.fecha_inicio ?? ""
            )} al ${String(sol.fecha_fin ?? "")}`,
            href: `/dashboard/rh?tab=solicitudes&solicitudId=${solId}#solicitud-${solId}`,
          });
        }
      }

      const comentariosRows = (comentariosMuroRes.data ??
        []) as unknown as Record<string, unknown>[];
      for (const com of comentariosRows) {
        const colab = mapaColaboradores.get(String(com.colaborador_id ?? ""));
        const nombre = construirNombreColaborador(colab);
        const textoCompleto = String(com.contenido_comentario ?? "").trim();
        const extracto = textoCompleto.slice(0, 65);
        const comId = String(com.id);

        itemsAcumulados.push({
          id: `rh-com-${comId}`,
          categoria: "comentario_muro",
          etiqueta: "PANEL RH • MODERACIÓN DE MURO",
          titulo: "Comentario pendiente de moderación",
          detalle: extracto
            ? `${nombre}: "${extracto}${textoCompleto.length > 65 ? "…" : ""}"`
            : `Enviado por ${nombre}`,
          href: `/dashboard/rh?tab=comunicados&comentarioId=${comId}#comentario-${comId}`,
        });
      }

      const ticketsRows = (ticketsAsistenciaRes.data ??
        []) as unknown as Record<string, unknown>[];
      for (const ticket of ticketsRows) {
        if (!esTicketPendiente(ticket.estatus)) continue;
        const colab = mapaColaboradores.get(
          String(ticket.colaborador_id ?? "")
        );
        const nombre = construirNombreColaborador(colab);
        const tktId = String(ticket.id);

        itemsAcumulados.push({
          id: `rh-tkt-${tktId}`,
          categoria: "ticket_asistencia",
          etiqueta: "PANEL RH • MONITOR DE ASISTENCIA",
          titulo: "Ticket de asistencia por resolver",
          detalle: `${nombre} · Incidencia del ${String(
            ticket.fecha_incidencia ?? ""
          )}`,
          href: `/dashboard/rh?tab=asistencia&ticketId=${tktId}#ticket-${tktId}`,
        });
      }
    }

    return {
      ok: true,
      userId: user.id,
      rolSistema,
      esJefatura: tieneJefatura,
      notificaciones: itemsAcumulados,
    };
  } catch {
    return {
      ok: false,
      userId: null,
      rolSistema: "Colaborador",
      esJefatura: false,
      notificaciones: [],
    };
  }
}
