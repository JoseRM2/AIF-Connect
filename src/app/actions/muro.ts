"use server";

import { revalidatePath } from "next/cache";
import { obtenerSesionYRol } from "@/lib/auth/session";
import {
  construirMarcaEliminacionProgramada,
  cumpleFiltroAudiencia,
  esAudienciaCelebracion,
  estaVencidaParaEliminacion,
  extraerCelebracionArea,
  extraerJefeFestejadoId,
  PREFIJO_ELIMINACION_PROGRAMADA,
} from "@/lib/muro";
import {
  verificarOrigenPermitido,
  verificarRateLimit,
} from "@/lib/security/rateLimit";
import { comentarioMuroSchema, validarConZod } from "@/lib/security/schemas";
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
/**
 * Elimina automáticamente de `muro_publicaciones` (y sus interacciones vinculadas)
 * cualquier comunicado cuya fecha/hora programada de eliminación (`categoria = ELIMINAR_EN:<ISO>`)
 * ya se haya cumplido.
 */
export async function depurarPublicacionesEliminacionVencida(): Promise<number> {
  try {
    const db = createAdminClient();
    const { data: programadas, error } = await db
      .from("muro_publicaciones")
      .select("id, categoria")
      .like("categoria", `${PREFIJO_ELIMINACION_PROGRAMADA}%`);

    if (error || !programadas || programadas.length === 0) {
      return 0;
    }

    const ahoraMs = Date.now();
    const idsVencidos = programadas
      .filter((p) => estaVencidaParaEliminacion(p.categoria, ahoraMs))
      .map((p) => p.id);

    if (idsVencidos.length === 0) return 0;

    await db
      .from("muro_interacciones")
      .delete()
      .in("publicacion_id", idsVencidos);

    const { error: errDel } = await db
      .from("muro_publicaciones")
      .delete()
      .in("id", idsVencidos);

    if (errDel) return 0;

    return idsVencidos.length;
  } catch {
    return 0;
  }
}

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

    await depurarPublicacionesEliminacionVencida();

    const db = createAdminClient();
    const esRH = sesion.esRecursosHumanos;
    const ahoraIso = new Date().toISOString();

    let queryPub = db
      .from("muro_publicaciones")
      .select("*, colaboradores!autor_id(nombre_completo)");

    if (!esRH) {
      queryPub = queryPub.lte("fecha_publicacion", ahoraIso);
    }

    const [pubRes, intRes, colabsRes] = await Promise.all([
      queryPub.order("fecha_publicacion", { ascending: false }),
      db
        .from("muro_interacciones")
        .select("*, colaboradores!colaborador_id(nombre_completo)")
        .order("created_at", { ascending: true }),
      !esRH
        ? db
            .from("colaboradores")
            .select(
              "id, nombre_completo, rol_sistema, es_jefatura, jefe_directo_id, jefe_directo"
            )
        : Promise.resolve({ data: null, error: null }),
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

    // Construir contexto de jefatura y relación jefe-subordinado para filtrar celebraciones
    const listaColabs = colabsRes.data ?? [];
    const miColab = listaColabs.find((c) => c.id === sesion.userId);
    const mapaColabPorId = new Map<
      string,
      {
        nombre_completo: string;
        jefe_directo_id: string | null;
        jefe_directo: string | null;
      }
    >();
    const referenciasJefesConEquipo = new Set<string>();

    for (const c of listaColabs) {
      if (c.id) {
        mapaColabPorId.set(c.id, {
          nombre_completo: (c.nombre_completo ?? "").trim(),
          jefe_directo_id: c.jefe_directo_id ?? null,
          jefe_directo: c.jefe_directo ?? null,
        });
      }
      const jId = (c.jefe_directo_id ?? "").trim().toLowerCase();
      const jTxt = (c.jefe_directo ?? "").trim().toLowerCase();
      if (jId) referenciasJefesConEquipo.add(jId);
      if (jTxt) referenciasJefesConEquipo.add(jTxt);
    }

    const miIdNorm = sesion.userId.trim().toLowerCase();
    const miNombreNorm = (miColab?.nombre_completo ?? sesion.nombreCompleto ?? "")
      .trim()
      .toLowerCase();
    const soyJefaturaEfectiva =
      sesion.esJefatura ||
      Boolean(miColab?.es_jefatura) ||
      referenciasJefesConEquipo.has(miIdNorm) ||
      (Boolean(miNombreNorm) && referenciasJefesConEquipo.has(miNombreNorm));

    const publicacionesFiltradas = (
      (pubRes.data ?? []) as unknown as PublicacionMuro[]
    )
      .filter((p) => {
        if (esRH) return true;
        const fechaLista =
          !p.fecha_publicacion ||
          new Date(p.fecha_publicacion).getTime() <= Date.now();
        if (!fechaLista) return false;

        const jefeFestejadoId = extraerJefeFestejadoId(p.departamento_destino);
        const celebArea = extraerCelebracionArea(p.departamento_destino);
        const festejadoId = jefeFestejadoId ?? celebArea?.colaboradorId ?? null;

        let esJefeDirectoDelFestejado = false;
        let nombreJefeFestejado: string | null = null;
        if (festejadoId) {
          const festejado = mapaColabPorId.get(festejadoId);
          if (festejado) {
            nombreJefeFestejado = festejado.nombre_completo || null;
            const festJefeId = (festejado.jefe_directo_id ?? "")
              .trim()
              .toLowerCase();
            const festJefeTxt = (festejado.jefe_directo ?? "")
              .trim()
              .toLowerCase();
            esJefeDirectoDelFestejado =
              (Boolean(festJefeId) && festJefeId === miIdNorm) ||
              (Boolean(festJefeTxt) && festJefeTxt === miIdNorm) ||
              (Boolean(miNombreNorm) &&
                Boolean(festJefeTxt) &&
                festJefeTxt === miNombreNorm);
          }
        }

        return cumpleFiltroAudiencia(p, sesion.empresa, sesion.departamento, {
          userId: sesion.userId,
          esJefatura: soyJefaturaEfectiva,
          miJefeDirectoId: miColab?.jefe_directo_id ?? null,
          miJefeDirectoTexto: miColab?.jefe_directo ?? null,
          nombreJefeFestejado,
          esJefeDirectoDelFestejado,
        });
      })
      .map((p) =>
        esAudienciaCelebracion(p.departamento_destino)
          ? {
              ...p,
              colaboradores: { nombre_completo: "Recursos Humanos" },
            }
          : p
      );

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
    if (!(await verificarOrigenPermitido())) {
      return { ok: false, error: "Origen de solicitud no autorizado." };
    }

    const validacion = validarConZod(comentarioMuroSchema, payload);
    if (!validacion.ok) {
      return { ok: false, error: validacion.error };
    }
    const { publicacionId, contenido: limpio } = validacion.data;

    const sesion = await createSessionClient();
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

    const controlTasa = await verificarRateLimit(
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

export interface ActualizarPublicacionMuroPayload {
  id: string;
  titulo: string;
  contenido: string;
  empresa_destino: "Ambas" | "AIF" | "ROYAL" | string;
  departamento_destino: string;
  fecha_publicacion: string;
  requiere_acuse: boolean;
  imagen_url: string | null;
}

/**
 * Actualiza un comunicado existente en `muro_publicaciones`.
 * Exclusivo para usuarios con rol Recursos Humanos (o Administrador del Sistema).
 */
export async function actualizarPublicacionMuroAction(
  payload: ActualizarPublicacionMuroPayload
): Promise<{
  ok: boolean;
  error?: string;
  publicacion?: Record<string, unknown>;
}> {
  try {
    if (!(await verificarOrigenPermitido())) {
      return { ok: false, error: "Origen de solicitud no autorizado." };
    }

    const sesion = await obtenerSesionYRol();
    if (!sesion || (!sesion.esRecursosHumanos && !sesion.esAdminSistema)) {
      return {
        ok: false,
        error: "Solo Recursos Humanos puede editar comunicados oficiales.",
      };
    }

    const idLimpio = (payload.id ?? "").trim();
    const tituloLimpio = (payload.titulo ?? "").trim();
    const contenidoLimpio = (payload.contenido ?? "").trim();

    if (!idLimpio || !tituloLimpio || !contenidoLimpio) {
      return {
        ok: false,
        error: "El título y el contenido del comunicado son obligatorios.",
      };
    }

    const db = createAdminClient();
    const { data, error } = await db
      .from("muro_publicaciones")
      .update({
        titulo: tituloLimpio,
        contenido: contenidoLimpio,
        empresa_destino: payload.empresa_destino || "Ambas",
        departamento_destino: payload.departamento_destino || "Todos",
        fecha_publicacion: payload.fecha_publicacion,
        requiere_acuse: Boolean(payload.requiere_acuse),
        imagen_url: payload.imagen_url,
      })
      .eq("id", idLimpio)
      .select("*")
      .single();

    if (error || !data) {
      return {
        ok: false,
        error: sanitizarErrorPublico(
          error,
          "No se pudo actualizar el comunicado en el Muro."
        ),
      };
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/muro");
    revalidatePath("/dashboard/rh");

    return {
      ok: true,
      publicacion: data as unknown as Record<string, unknown>,
    };
  } catch (err) {
    return {
      ok: false,
      error: sanitizarErrorPublico(
        err,
        "Ocurrió un error al actualizar el comunicado."
      ),
    };
  }
}

/**
 * Elimina un comunicado de `muro_publicaciones` junto con sus interacciones vinculadas.
 * Exclusivo para Recursos Humanos (o Administrador del Sistema).
 */
export async function eliminarPublicacionMuroAction(
  publicacionId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!(await verificarOrigenPermitido())) {
      return { ok: false, error: "Origen de solicitud no autorizado." };
    }

    const sesion = await obtenerSesionYRol();
    if (!sesion || (!sesion.esRecursosHumanos && !sesion.esAdminSistema)) {
      return {
        ok: false,
        error: "Solo Recursos Humanos puede eliminar comunicados oficiales.",
      };
    }

    const idLimpio = (publicacionId ?? "").trim();
    if (!idLimpio) {
      return { ok: false, error: "Identificador de comunicado inválido." };
    }

    const db = createAdminClient();

    // Limpiar interacciones dependientes primero por si la FK no tiene ON DELETE CASCADE
    await db
      .from("muro_interacciones")
      .delete()
      .eq("publicacion_id", idLimpio);

    const { error } = await db
      .from("muro_publicaciones")
      .delete()
      .eq("id", idLimpio);

    if (error) {
      return {
        ok: false,
        error: sanitizarErrorPublico(
          error,
          "No se pudo eliminar el comunicado."
        ),
      };
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/muro");
    revalidatePath("/dashboard/rh");

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: sanitizarErrorPublico(
        err,
        "Ocurrió un error al eliminar el comunicado."
      ),
    };
  }
}

/**
 * Programa (o cancela si `fechaEliminacionIso` es `null`) la fecha y hora de eliminación
 * automática de un comunicado en `muro_publicaciones`.
 * Exclusivo para Recursos Humanos (o Administrador del Sistema).
 */
export async function programarEliminacionPublicacionMuroAction(
  publicacionId: string,
  fechaEliminacionIso: string | null
): Promise<{
  ok: boolean;
  categoria?: string | null;
  error?: string;
}> {
  try {
    if (!(await verificarOrigenPermitido())) {
      return { ok: false, error: "Origen de solicitud no autorizado." };
    }

    const sesion = await obtenerSesionYRol();
    if (!sesion || (!sesion.esRecursosHumanos && !sesion.esAdminSistema)) {
      return {
        ok: false,
        error:
          "Solo Recursos Humanos puede programar la eliminación de comunicados.",
      };
    }

    const idLimpio = (publicacionId ?? "").trim();
    if (!idLimpio) {
      return { ok: false, error: "Identificador de comunicado inválido." };
    }

    let categoriaNueva: string | null = null;
    if (fechaEliminacionIso) {
      const fechaObj = new Date(fechaEliminacionIso);
      if (Number.isNaN(fechaObj.getTime())) {
        return {
          ok: false,
          error: "La fecha y hora programada de eliminación no es válida.",
        };
      }
      if (fechaObj.getTime() <= Date.now()) {
        return {
          ok: false,
          error:
            "La fecha y hora de eliminación debe ser posterior al momento actual.",
        };
      }
      categoriaNueva = construirMarcaEliminacionProgramada(
        fechaObj.toISOString()
      );
    }

    const db = createAdminClient();
    const { error } = await db
      .from("muro_publicaciones")
      .update({ categoria: categoriaNueva })
      .eq("id", idLimpio);

    if (error) {
      return {
        ok: false,
        error: sanitizarErrorPublico(
          error,
          "No se pudo programar la eliminación del comunicado."
        ),
      };
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/muro");
    revalidatePath("/dashboard/rh");

    return { ok: true, categoria: categoriaNueva };
  } catch (err) {
    return {
      ok: false,
      error: sanitizarErrorPublico(
        err,
        "Ocurrió un error al programar la eliminación del comunicado."
      ),
    };
  }
}
