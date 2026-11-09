"use server";

import { normalizarRolSistema } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

type ColaboradorRow = Database["public"]["Tables"]["colaboradores"]["Row"];
type SolicitudRow = Database["public"]["Tables"]["solicitudes"]["Row"];

export interface SolicitudVacacionesReporteItem {
  solicitud: SolicitudRow;
  colaborador: ColaboradorRow | null;
}

export type ObtenerReporteVacacionesResult =
  | {
      ok: true;
      registros: SolicitudVacacionesReporteItem[];
    }
  | {
      ok: false;
      error: string;
    };

/**
 * Consulta todas las solicitudes de vacaciones ("Vacaciones" y "Vacaciones Pagadas")
 * de todos los roles (Colaborador, Jefatura y Recursos Humanos) usando `createAdminClient`
 * para evitar que políticas RLS en `solicitudes` o `colaboradores` oculten registros.
 */
export async function obtenerReporteVacacionesAction(filtros?: {
  colaboradorId?: string;
  fechaInicio?: string;
  fechaFin?: string;
}): Promise<ObtenerReporteVacacionesResult> {
  try {
    const sesion = createSessionClient();
    const {
      data: { user },
      error: authError,
    } = await sesion.auth.getUser();

    if (authError || !user) {
      return {
        ok: false,
        error: "Sesión no válida. Inicia sesión nuevamente.",
      };
    }

    const supabaseAdmin = createAdminClient();

    let solicitudesQuery = supabaseAdmin
      .from("solicitudes")
      .select("*")
      .in("tipo_solicitud", ["Vacaciones", "Vacaciones Pagadas"])
      .order("fecha_inicio", { ascending: false });

    if (filtros?.colaboradorId) {
      solicitudesQuery = solicitudesQuery.eq(
        "colaborador_id",
        filtros.colaboradorId
      );
    }
    if (filtros?.fechaInicio) {
      solicitudesQuery = solicitudesQuery.gte(
        "fecha_inicio",
        filtros.fechaInicio
      );
    }
    if (filtros?.fechaFin) {
      solicitudesQuery = solicitudesQuery.lte("fecha_inicio", filtros.fechaFin);
    }

    let colaboradoresQuery = supabaseAdmin.from("colaboradores").select("*");
    if (filtros?.colaboradorId) {
      const idsConsultar = Array.from(
        new Set([filtros.colaboradorId, user.id])
      );
      colaboradoresQuery = colaboradoresQuery.in("id", idsConsultar);
    }

    const [solicitudesRes, colaboradoresRes] = await Promise.all([
      solicitudesQuery,
      colaboradoresQuery,
    ]);

    if (solicitudesRes.error) {
      return {
        ok: false,
        error: solicitudesRes.error.message,
      };
    }

    if (colaboradoresRes.error) {
      return {
        ok: false,
        error: colaboradoresRes.error.message,
      };
    }

    const listaColaboradores = colaboradoresRes.data ?? [];
    let solicitanteColab = listaColaboradores.find((c) => c.id === user.id);

    if (!solicitanteColab && user.email) {
      const { data: porCorreo } = await supabaseAdmin
        .from("colaboradores")
        .select("*")
        .ilike("correo_corporativo", user.email.trim())
        .maybeSingle();
      solicitanteColab = porCorreo ?? undefined;
    }

    const rolSolicitante = normalizarRolSistema(solicitanteColab?.rol_sistema);
    const autorizado =
      rolSolicitante === "Recursos Humanos" ||
      rolSolicitante === "Jefatura" ||
      Boolean(solicitanteColab?.es_jefatura);

    if (!autorizado) {
      return {
        ok: false,
        error:
          "No cuentas con permisos de Recursos Humanos o Jefatura para consultar este reporte.",
      };
    }

    const mapaColaboradores = new Map<string, ColaboradorRow>(
      listaColaboradores.map((c) => [c.id, c])
    );

    const solicitudesVacaciones = (solicitudesRes.data ?? []).filter((item) => {
      const raw = item as Record<string, unknown>;
      const tipo = String(
        item.tipo_solicitud ?? raw.tipo ?? ""
      )
        .trim()
        .toLowerCase();
      return tipo.includes("vacaciones");
    });

    const registros: SolicitudVacacionesReporteItem[] =
      solicitudesVacaciones.map((solicitud) => ({
        solicitud,
        colaborador: mapaColaboradores.get(solicitud.colaborador_id) ?? null,
      }));

    return {
      ok: true,
      registros,
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Error inesperado al consultar el reporte de vacaciones.",
    };
  }
}
