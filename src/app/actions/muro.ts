"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import type { InteraccionMuroRow } from "@/types/muro";

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
    const limpio = payload.contenido.trim();
    if (!limpio) {
      return { ok: false, error: "El comentario no puede estar vacío." };
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
        error: insertError?.message ?? "No se pudo registrar el comentario.",
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
        error:
          findError?.message ??
          insertError?.message ??
          "No se encontró el comentario previo para actualizar.",
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
        error: updateError.message,
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
      error:
        err instanceof Error
          ? err.message
          : "Error inesperado al enviar el comentario.",
    };
  }
}
