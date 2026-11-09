"use server";

import { obtenerSesionYRol } from "@/lib/auth/session";
import { cumpleFiltroAudiencia } from "@/lib/muro";
import {
  verificarOrigenPermitido,
  verificarRateLimit,
} from "@/lib/security/rateLimit";
import { sanitizarErrorPublico } from "@/lib/security/safeError";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import type { InteraccionMuroRow, PublicacionMuro } from "@/types/muro";

export interface DatosMuroResponse {
  ok: boolean;
  error?: string;
  currentUserId: string | null;
  esRecursosHumanos: boolean;
  publicaciones: PublicacionMuro[];
  interacciones: InteraccionMuroRow[];
}

/**
 * Obtiene en una sola consulta del lado servidor las publicaciones e interacciones
 * del Muro Corporativo, aplicando aislamiento de datos (audiencia por empresa/departamento
 * y moderación de comentarios) y exponiendo únicamente `nombre_completo` de los autores
 * sin abrir acceso de lectura directo sobre `public.colaboradores` en el navegador.
 */
export async function obtenerDatosMuroAction(): Promise<DatosMuroResponse> {
  try {
    const sesion = await obtenerSesionYRol();
    if (!sesion) {
      return {
        ok: false,
        error: "Sesión no válida. Inicia sesión nuevamente.",
        currentUserId: null,
        esRecursosHumanos: false,
        publicaciones: [],
        interacciones: [],
      };
    }

    const db = createAdminClient();
    const esRH = sesion.esRecursosHumanos;
    const ahoraIso = new Date().toISOString();

    let queryPub = db
      .from("muro_publicaciones")
      .select("*, colaboradores!autor_id(nombre_completo)");

    if (!esRH) {
      queryPub = queryPub.lte("fecha_publicacion", ahoraIso);
    }

    const [pubRes, intRes] = await Promise.all([
      queryPub.order("fecha_publicacion", { ascending: false }),
      db
        .from("muro_interacciones")
        .select("*, colaboradores!colaborador_id(nombre_completo)")
        .order("created_at", { ascending: true }),
    ]);

    if (pubRes.error) {
      return {
        ok: false,
        error: "No fue posible consultar los comunicados oficiales.",
        currentUserId: sesion.userId,
        esRecursosHumanos: esRH,
        publicaciones: [],
        interacciones: [],
      };
    }

    const publicacionesFiltradas = (
      (pubRes.data ?? []) as unknown as PublicacionMuro[]
    ).filter((p) => {
      if (esRH) return true;
      const fechaLista =
        !p.fecha_publicacion ||
        new Date(p.fecha_publicacion).getTime() <= Date.now();
      return (
        fechaLista &&
        cumpleFiltroAudiencia(p, sesion.empresa, sesion.departamento)
      );
    });

    const idsPublicacionesVisibles = new Set(
      publicacionesFiltradas.map((p) => p.id)
    );

    const interaccionesFiltradas = (
      (intRes.data ?? []) as unknown as InteraccionMuroRow[]
    ).filter((i) => {
      if (!idsPublicacionesVisibles.has(i.publicacion_id)) return false;
      if (esRH) return true;
      if (i.tipo_interaccion !== "Comentario") return true;
      return (
        i.estatus_moderacion === "Aprobado" ||
        i.colaborador_id === sesion.userId
      );
    });

    return {
      ok: true,
      currentUserId: sesion.userId,
      esRecursosHumanos: esRH,
      publicaciones: publicacionesFiltradas,
      interacciones: interaccionesFiltradas,
    };
  } catch {
    return {
      ok: false,
      error: "No fue posible cargar el Muro Corporativo.",
      currentUserId: null,
      esRecursosHumanos: false,
      publicaciones: [],
      interacciones: [],
    };
  }
}

export type EnviarComentarioMuroResult =
  | {
      ok: true;
      interaccion: InteraccionMuroRow;
      modo: "insertado" | "actualizado";
    }
  | {
      ok: false;
      error: string;
    };

/**
 * Envía un comentario en una publicación del Muro Corporativo con estatus 'Pendiente'.
 * - Primero intenta insertar un nuevo registro (`INSERT`).
 * - Si la base de datos tiene activa la restricción única
 *   `muro_interacciones_publicacion_id_colaborador_id_tipo_inter_key` (código 23505),
 *   actualiza (`UPDATE`) el registro existente de tipo 'Comentario' de ese colaborador
 *   en esa publicación y lo vuelve a poner en 'Pendiente' para revisión de RH.
 */
export async function enviarComentarioMuroAction(payload: {
  publicacionId: string;
  contenido: string;
}): Promise<EnviarComentarioMuroResult> {
  try {
    if (!verificarOrigenPermitido()) {
      return { ok: false, error: "Origen de solicitud no autorizado." };
    }

    const limpio = (payload.contenido ?? "").trim();
    if (!limpio) {
      return { ok: false, error: "El comentario no puede estar vacío." };
    }
    if (limpio.length > 1000) {
      return {
        ok: false,
        error: "El comentario excede la longitud máxima permitida (1,000 caracteres).",
      };
    }

    const sesion = createSessionClient();
    const {
      data: { user },
      error: authError,
    } = await sesion.auth.getUser();

    if (authError || !user) {
      return {
        ok: false,
        error: "Inicia sesión para enviar un comentario.",
      };
    }

    const controlTasa = verificarRateLimit(
      `muro-comentario:${user.id}`,
      6,
      60 * 1000
    );
    if (!controlTasa.permitido) {
      return {
        ok: false,
        error: "Estás enviando comentarios demasiado rápido. Espera unos segundos.",
      };
    }

    const supabaseAdmin = createAdminClient();
    const colaboradorId = user.id;
    const publicacionId = payload.publicacionId;

    // 1. Intentar INSERT directo (funciona al primer comentario o si se eliminó el unique constraint en BD)
    const { data: insertado, error: insertError } = await supabaseAdmin
      .from("muro_interacciones")
      .insert({
        publicacion_id: publicacionId,
        colaborador_id: colaboradorId,
        tipo_interaccion: "Comentario",
        contenido_comentario: limpio,
        estatus_moderacion: "Pendiente",
      })
      .select("*, colaboradores!colaborador_id(nombre_completo)")
      .maybeSingle();

    if (!insertError && insertado) {
      return {
        ok: true,
        interaccion: insertado as unknown as InteraccionMuroRow,
        modo: "insertado",
      };
    }

    const textoError = `${insertError?.code ?? ""} ${insertError?.message ?? ""}`.toLowerCase();
    const esConstraintUnico =
      insertError?.code === "23505" ||
      textoError.includes("duplicate key") ||
      textoError.includes("unique constraint") ||
      textoError.includes("muro_interacciones_publicacion_id_colaborador_id_tipo_inter_key");

    if (!esConstraintUnico) {
      return {
        ok: false,
        error: sanitizarErrorPublico(
          insertError,
          "No se pudo registrar el comentario."
        ),
      };
    }

    // 2. Fallback para cuando existe la restricción UNIQUE (publicacion_id, colaborador_id, tipo_interaccion)
    const { data: existente, error: findError } = await supabaseAdmin
      .from("muro_interacciones")
      .select("id")
      .eq("publicacion_id", publicacionId)
      .eq("colaborador_id", colaboradorId)
      .eq("tipo_interaccion", "Comentario")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findError || !existente?.id) {
      return {
        ok: false,
        error: sanitizarErrorPublico(
          findError ?? insertError,
          "No se encontró el comentario previo para actualizar."
        ),
      };
    }

    const { data: actualizado, error: updateError } = await supabaseAdmin
      .from("muro_interacciones")
      .update({
        contenido_comentario: limpio,
        estatus_moderacion: "Pendiente",
        created_at: new Date().toISOString(),
      })
      .eq("id", existente.id)
      .select("*, colaboradores!colaborador_id(nombre_completo)")
      .maybeSingle();

    if (updateError) {
      return {
        ok: false,
        error: sanitizarErrorPublico(
          updateError,
          "No se pudo actualizar el comentario."
        ),
      };
    }

    return {
      ok: true,
      interaccion: (actualizado ?? {
        id: existente.id,
        publicacion_id: publicacionId,
        colaborador_id: colaboradorId,
        tipo_interaccion: "Comentario",
        contenido_comentario: limpio,
        estatus_moderacion: "Pendiente",
        created_at: new Date().toISOString(),
      }) as unknown as InteraccionMuroRow,
      modo: "actualizado",
    };
  } catch (err) {
    return {
      ok: false,
      error: sanitizarErrorPublico(
        err,
        "Error inesperado al enviar el comentario."
      ),
    };
  }
}
