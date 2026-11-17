"use server";

import { revalidatePath } from "next/cache";
import { obtenerSesionYRol } from "@/lib/auth/session";
import {
  verificarOrigenPermitido,
  verificarRateLimit,
} from "@/lib/security/rateLimit";
import { sanitizarErrorPublico } from "@/lib/security/safeError";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

export type ReporteErrorRow =
  Database["public"]["Tables"]["reportes_errores"]["Row"];

export type SeveridadError = "Baja" | "Media" | "Alta" | "Critica";
export type EstatusReporteError =
  | "Abierto"
  | "En_Revision"
  | "Resuelto"
  | "Descartado";

const SEVERIDADES_VALIDAS: readonly SeveridadError[] = [
  "Baja",
  "Media",
  "Alta",
  "Critica",
];

const ESTATUS_VALIDOS: readonly EstatusReporteError[] = [
  "Abierto",
  "En_Revision",
  "Resuelto",
  "Descartado",
];

function obtenerClienteDb() {
  try {
    return createAdminClient();
  } catch {
    return createSessionClient() as unknown as ReturnType<
      typeof createAdminClient
    >;
  }
}

export interface DatosReportesErroresResponse {
  ok: boolean;
  error?: string;
  esAdminSistema: boolean;
  misReportes: ReporteErrorRow[];
  todosLosReportes: ReporteErrorRow[];
}

/**
 * Consulta los reportes de errores según el nivel de acceso:
 * - Cualquier usuario de prueba (Colaborador, Jefatura o RH): solo ve `misReportes`.
 * - Usuario Administrador del Sistema (`esAdminSistema === true`, ej. jrealmedina@gmail.com):
 *   recibe tanto `misReportes` como `todosLosReportes` de toda la plataforma.
 */
export async function obtenerReportesErroresAction(): Promise<DatosReportesErroresResponse> {
  try {
    const sesion = await obtenerSesionYRol();
    if (!sesion) {
      return {
        ok: false,
        error: "Sesión no válida. Inicia sesión nuevamente.",
        esAdminSistema: false,
        misReportes: [],
        todosLosReportes: [],
      };
    }

    const db = obtenerClienteDb();

    if (sesion.esAdminSistema) {
      const { data, error } = await db
        .from("reportes_errores")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        return {
          ok: false,
          error: sanitizarErrorPublico(
            error,
            "Aún no se ha inicializado la tabla de reportes de errores en la base de datos."
          ),
          esAdminSistema: true,
          misReportes: [],
          todosLosReportes: [],
        };
      }

      const todos = (data ?? []) as ReporteErrorRow[];
      const propios = todos.filter((r) => r.colaborador_id === sesion.userId);

      return {
        ok: true,
        esAdminSistema: true,
        misReportes: propios,
        todosLosReportes: todos,
      };
    }

    const { data: propiosData, error: propiosErr } = await db
      .from("reportes_errores")
      .select("*")
      .eq("colaborador_id", sesion.userId)
      .order("created_at", { ascending: false });

    if (propiosErr) {
      return {
        ok: false,
        error: sanitizarErrorPublico(
          propiosErr,
          "No fue posible consultar tus reportes enviados."
        ),
        esAdminSistema: false,
        misReportes: [],
        todosLosReportes: [],
      };
    }

    return {
      ok: true,
      esAdminSistema: false,
      misReportes: (propiosData ?? []) as ReporteErrorRow[],
      todosLosReportes: [],
    };
  } catch (err) {
    return {
      ok: false,
      error: sanitizarErrorPublico(
        err,
        "Ocurrió un error al consultar la sección de Reporte de Errores."
      ),
      esAdminSistema: false,
      misReportes: [],
      todosLosReportes: [],
    };
  }
}

export interface CrearReporteErrorPayload {
  modulo: string;
  rutaOrigen?: string | null;
  severidad: SeveridadError;
  categoria: string;
  titulo: string;
  descripcion: string;
  pasosReproducir?: string | null;
  capturaUrl?: string | null;
  navegadorInfo?: string | null;
}

export async function crearReporteErrorAction(
  payload: CrearReporteErrorPayload
): Promise<{ ok: boolean; error?: string; reporte?: ReporteErrorRow }> {
  try {
    if (!verificarOrigenPermitido()) {
      return { ok: false, error: "Origen de solicitud no autorizado." };
    }

    const sesion = await obtenerSesionYRol();
    if (!sesion) {
      return {
        ok: false,
        error: "Inicia sesión para enviar un reporte de error.",
      };
    }

    const controlTasa = verificarRateLimit(
      `reporte-error:${sesion.userId}`,
      10,
      5 * 60 * 1000
    );
    if (!controlTasa.permitido) {
      return {
        ok: false,
        error:
          "Has enviado varios reportes recientemente. Espera unos minutos antes de enviar otro.",
      };
    }

    const tituloLimpio = (payload.titulo ?? "").trim();
    const descripcionLimpia = (payload.descripcion ?? "").trim();
    const moduloLimpio = (payload.modulo ?? "General").trim() || "General";
    const categoriaLimpia =
      (payload.categoria ?? "Funcionalidad").trim() || "Funcionalidad";
    const severidadValida: SeveridadError = SEVERIDADES_VALIDAS.includes(
      payload.severidad
    )
      ? payload.severidad
      : "Media";

    if (!tituloLimpio || tituloLimpio.length < 4) {
      return {
        ok: false,
        error: "Ingresa un título breve descriptivo (mínimo 4 caracteres).",
      };
    }
    if (tituloLimpio.length > 180) {
      return {
        ok: false,
        error: "El título no puede exceder 180 caracteres.",
      };
    }
    if (!descripcionLimpia || descripcionLimpia.length < 10) {
      return {
        ok: false,
        error:
          "Describe con detalle el error detectado (mínimo 10 caracteres).",
      };
    }
    if (descripcionLimpia.length > 3000) {
      return {
        ok: false,
        error: "La descripción no puede exceder 3,000 caracteres.",
      };
    }

    const pasosLimpios = (payload.pasosReproducir ?? "").trim().slice(0, 2000) || null;
    const rutaLimpia = (payload.rutaOrigen ?? "").trim().slice(0, 250) || null;
    const navLimpio = (payload.navegadorInfo ?? "").trim().slice(0, 300) || null;
    const capturaLimpia = (payload.capturaUrl ?? "").trim().slice(0, 1000) || null;

    const db = obtenerClienteDb();
    const ahoraIso = new Date().toISOString();

    const { data, error } = await db
      .from("reportes_errores")
      .insert({
        colaborador_id: sesion.userId,
        nombre_reportante: sesion.nombreCompleto || "Usuario",
        correo_reportante: sesion.email || "",
        rol_reportante: sesion.rolSistema,
        empresa_reportante: sesion.empresa || "AIF",
        modulo: moduloLimpio.slice(0, 100),
        ruta_origen: rutaLimpia,
        severidad: severidadValida,
        categoria: categoriaLimpia.slice(0, 80),
        titulo: tituloLimpio,
        descripcion: descripcionLimpia,
        pasos_reproducir: pasosLimpios,
        captura_url: capturaLimpia,
        navegador_info: navLimpio,
        estatus: "Abierto",
        created_at: ahoraIso,
        updated_at: ahoraIso,
      })
      .select("*")
      .single();

    if (error || !data) {
      return {
        ok: false,
        error: sanitizarErrorPublico(
          error,
          "No se pudo guardar el reporte de error. Verifica que la migración SQL haya sido ejecutada."
        ),
      };
    }

    revalidatePath("/dashboard/errores");
    return {
      ok: true,
      reporte: data as ReporteErrorRow,
    };
  } catch (err) {
    return {
      ok: false,
      error: sanitizarErrorPublico(
        err,
        "Ocurrió un error al registrar el reporte."
      ),
    };
  }
}

export interface ActualizarReporteErrorPayload {
  reporteId: string;
  estatus: EstatusReporteError;
  notasAdmin?: string | null;
}

/**
 * Exclusivo para el Administrador del Sistema (`esAdminSistema === true`).
 * Recursos Humanos NO tiene acceso a esta acción salvo que sea el correo administrador.
 */
export async function actualizarEstatusReporteErrorAction(
  payload: ActualizarReporteErrorPayload
): Promise<{ ok: boolean; error?: string; reporte?: ReporteErrorRow }> {
  try {
    if (!verificarOrigenPermitido()) {
      return { ok: false, error: "Origen de solicitud no autorizado." };
    }

    const sesion = await obtenerSesionYRol();
    if (!sesion || !sesion.esAdminSistema) {
      return {
        ok: false,
        error:
          "Acceso denegado. Solo el Administrador del Sistema puede gestionar reportes de errores.",
      };
    }

    const idLimpio = (payload.reporteId ?? "").trim();
    if (!idLimpio) {
      return { ok: false, error: "Identificador de reporte inválido." };
    }

    const estatusValido: EstatusReporteError = ESTATUS_VALIDOS.includes(
      payload.estatus
    )
      ? payload.estatus
      : "Abierto";

    const notasLimpias = (payload.notasAdmin ?? "").trim().slice(0, 2000) || null;
    const ahoraIso = new Date().toISOString();
    const esFinalizado =
      estatusValido === "Resuelto" || estatusValido === "Descartado";

    const db = obtenerClienteDb();
    const { data, error } = await db
      .from("reportes_errores")
      .update({
        estatus: estatusValido,
        notas_admin: notasLimpias,
        resuelto_por: esFinalizado
          ? sesion.nombreCompleto || sesion.email || "Administrador"
          : null,
        resuelto_at: esFinalizado ? ahoraIso : null,
        updated_at: ahoraIso,
      })
      .eq("id", idLimpio)
      .select("*")
      .single();

    if (error || !data) {
      return {
        ok: false,
        error: sanitizarErrorPublico(
          error,
          "No se pudo actualizar el estatus del reporte."
        ),
      };
    }

    revalidatePath("/dashboard/errores");
    return {
      ok: true,
      reporte: data as ReporteErrorRow,
    };
  } catch (err) {
    return {
      ok: false,
      error: sanitizarErrorPublico(
        err,
        "Ocurrió un error al actualizar el reporte."
      ),
    };
  }
}

export async function eliminarReporteErrorAction(
  reporteId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!verificarOrigenPermitido()) {
      return { ok: false, error: "Origen de solicitud no autorizado." };
    }

    const sesion = await obtenerSesionYRol();
    if (!sesion || !sesion.esAdminSistema) {
      return {
        ok: false,
        error:
          "Solo el Administrador del Sistema puede eliminar reportes de error.",
      };
    }

    const idLimpio = (reporteId ?? "").trim();
    if (!idLimpio) {
      return { ok: false, error: "Identificador de reporte inválido." };
    }

    const db = obtenerClienteDb();
    const { error } = await db
      .from("reportes_errores")
      .delete()
      .eq("id", idLimpio);

    if (error) {
      return {
        ok: false,
        error: sanitizarErrorPublico(
          error,
          "No se pudo eliminar el reporte."
        ),
      };
    }

    revalidatePath("/dashboard/errores");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: sanitizarErrorPublico(
        err,
        "Ocurrió un error al eliminar el reporte."
      ),
    };
  }
}
