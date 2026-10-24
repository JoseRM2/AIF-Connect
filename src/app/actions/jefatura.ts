"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSessionClient } from "@/lib/supabase/server";

export interface SolicitudEquipoServerItem {
  id: string;
  colaborador_id: string;
  nombre_colaborador: string;
  puesto_colaborador: string;
  tipo_solicitud: string;
  fecha_inicio: string;
  fecha_fin: string;
  motivo: string | null;
  estatus: string;
  created_at: string;
}

export interface DiagnosticoJefatura {
  userId: string;
  nombreJefe: string;
  rolSistema: string;
  totalEquipo: number;
  nombresEquipo: string[];
  totalSolicitudes: number;
}

export type ObtenerSolicitudesEquipoResult =
  | {
      ok: true;
      solicitudes: SolicitudEquipoServerItem[];
      diagnostico: DiagnosticoJefatura;
    }
  | {
      ok: false;
      error: string;
    };

export type ResolverSolicitudEquipoResult =
  | {
      ok: true;
      estatusAplicado: string;
    }
  | {
      ok: false;
      error: string;
    };

function normalizarTextoComparacion(valor: unknown): string {
  return String(valor ?? "")
    .trim()
    .toLowerCase();
}

function perteneceAlEquipoDelJefe(
  colaborador: Record<string, unknown>,
  jefeId: string,
  nombreJefeNorm: string
): boolean {
  const jefeIdNorm = normalizarTextoComparacion(jefeId);
  const colJefeId = normalizarTextoComparacion(colaborador.jefe_directo_id);
  const colJefeTexto = normalizarTextoComparacion(colaborador.jefe_directo);

  if (colJefeId && colJefeId === jefeIdNorm) {
    return true;
  }
  if (colJefeTexto && colJefeTexto === jefeIdNorm) {
    return true;
  }
  if (nombreJefeNorm && colJefeTexto && colJefeTexto === nombreJefeNorm) {
    return true;
  }
  return false;
}

/**
 * Obtiene las solicitudes del equipo directo del jefe autenticado.
 * Utiliza `createAdminClient` en el servidor tras validar la sesión para evitar
 * bloqueos silenciosos de RLS en `solicitudes` o `colaboradores`, y soporta
 * coincidencia tanto por `jefe_directo_id` (UUID) como por `jefe_directo` (UUID o Nombre).
 */
export async function obtenerSolicitudesEquipoAction(): Promise<ObtenerSolicitudesEquipoResult> {
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
    const userId = user.id;

    // 1. Obtener el perfil del jefe autenticado
    const { data: perfilJefe } = await supabaseAdmin
      .from("colaboradores")
      .select("id, nombre_completo, rol_sistema")
      .eq("id", userId)
      .maybeSingle();

    const nombreJefe = perfilJefe?.nombre_completo?.trim() || "";
    const nombreJefeNorm = normalizarTextoComparacion(nombreJefe);
    const rolSistema = perfilJefe?.rol_sistema?.trim() || "Jefatura";

    // 2. Obtener todos los colaboradores y filtrar los que reportan a este jefe
    // por `jefe_directo_id` (UUID) o `jefe_directo` (UUID o nombre completo)
    const { data: todosColaboradores, error: colabError } = await supabaseAdmin
      .from("colaboradores")
      .select("*")
      .order("nombre_completo", { ascending: true });

    if (colabError) {
      return {
        ok: false,
        error: `Error al consultar colaboradores: ${colabError.message}`,
      };
    }

    const listaEquipo = (todosColaboradores ?? []).filter((c) =>
      perteneceAlEquipoDelJefe(
        c as unknown as Record<string, unknown>,
        userId,
        nombreJefeNorm
      )
    );

    const equipoIds = listaEquipo.map((e) => e.id);
    const nombresEquipo = listaEquipo.map(
      (e) => e.nombre_completo || e.nombre || e.id
    );

    if (equipoIds.length === 0) {
      return {
        ok: true,
        solicitudes: [],
        diagnostico: {
          userId,
          nombreJefe: nombreJefe || user.email || "Jefatura",
          rolSistema,
          totalEquipo: 0,
          nombresEquipo: [],
          totalSolicitudes: 0,
        },
      };
    }

    const mapaEquipo = new Map(listaEquipo.map((e) => [e.id, e]));

    // 3. Consultar `solicitudes` filtrando con `.in("colaborador_id", equipoIds)`
    const { data: filasSolicitudes, error: solError } = await supabaseAdmin
      .from("solicitudes")
      .select("*")
      .in("colaborador_id", equipoIds)
      .order("created_at", { ascending: false });

    if (solError) {
      return {
        ok: false,
        error: `Error al consultar solicitudes: ${solError.message}`,
      };
    }

    const solicitudes: SolicitudEquipoServerItem[] = (
      filasSolicitudes ?? []
    ).map((fila) => {
      const raw = fila as unknown as Record<string, unknown>;
      const colab = mapaEquipo.get(String(fila.colaborador_id));

      return {
        id: String(fila.id),
        colaborador_id: String(fila.colaborador_id),
        nombre_colaborador: colab?.nombre_completo || "Colaborador",
        puesto_colaborador:
          colab?.puesto || colab?.departamento || "Equipo Directo",
        tipo_solicitud:
          fila.tipo_solicitud ||
          (raw.tipo as string | undefined) ||
          "Vacaciones",
        fecha_inicio: fila.fecha_inicio,
        fecha_fin: fila.fecha_fin,
        motivo: fila.motivo ?? null,
        estatus: String(fila.estatus || "Pendiente_Jefe"),
        created_at: fila.created_at,
      };
    });

    return {
      ok: true,
      solicitudes,
      diagnostico: {
        userId,
        nombreJefe: nombreJefe || user.email || "Jefatura",
        rolSistema,
        totalEquipo: listaEquipo.length,
        nombresEquipo,
        totalSolicitudes: solicitudes.length,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Error inesperado al consultar las solicitudes del equipo.",
    };
  }
}

/**
 * Aprueba o rechaza una solicitud del equipo directo del jefe autenticado.
 * Valida en servidor que la solicitud pertenezca a un subordinado del jefe actual
 * (o que el usuario sea Recursos Humanos) antes de ejecutar el UPDATE.
 */
export async function resolverSolicitudEquipoAction(
  solicitudId: string,
  decision: "Aprobado" | "Rechazado"
): Promise<ResolverSolicitudEquipoResult> {
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
    const userId = user.id;

    // 1. Obtener la solicitud y verificar que pertenezca al equipo del jefe actual
    const { data: solicitud, error: getSolError } = await supabaseAdmin
      .from("solicitudes")
      .select("id, colaborador_id")
      .eq("id", solicitudId)
      .maybeSingle();

    if (getSolError || !solicitud) {
      return {
        ok: false,
        error: "No se encontró la solicitud especificada.",
      };
    }

    const [{ data: perfilJefe }, { data: colaborador }] = await Promise.all([
      supabaseAdmin
        .from("colaboradores")
        .select("id, nombre_completo, rol_sistema")
        .eq("id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("colaboradores")
        .select("*")
        .eq("id", solicitud.colaborador_id)
        .maybeSingle(),
    ]);

    const esRH = perfilJefe?.rol_sistema === "Recursos Humanos";
    const nombreJefeNorm = normalizarTextoComparacion(
      perfilJefe?.nombre_completo
    );

    if (
      !esRH &&
      (!colaborador ||
        !perteneceAlEquipoDelJefe(
          colaborador as unknown as Record<string, unknown>,
          userId,
          nombreJefeNorm
        ))
    ) {
      return {
        ok: false,
        error:
          "No tienes permisos para resolver una solicitud que no pertenece a tu equipo directo.",
      };
    }

    // 2. Actualizar estatus en `solicitudes` (compatible con ENUM `estatus_solicitud`: `Aprobado_Jefe` o `Aprobado`)
    let estatusAplicado: "Aprobado_Jefe" | "Aprobado" | "Rechazado" =
      decision === "Aprobado" ? "Aprobado_Jefe" : "Rechazado";

    let { error: updateError } = await supabaseAdmin
      .from("solicitudes")
      .update({ estatus: estatusAplicado })
      .eq("id", solicitudId);

    if (
      updateError &&
      decision === "Aprobado" &&
      /invalid input value for enum/i.test(updateError.message)
    ) {
      estatusAplicado = "Aprobado";
      const retry = await supabaseAdmin
        .from("solicitudes")
        .update({ estatus: estatusAplicado })
        .eq("id", solicitudId);
      updateError = retry.error;
    }

    if (updateError) {
      return {
        ok: false,
        error: `Error al actualizar la solicitud: ${updateError.message}`,
      };
    }

    return {
      ok: true,
      estatusAplicado,
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Error inesperado al resolver la solicitud.",
    };
  }
}
