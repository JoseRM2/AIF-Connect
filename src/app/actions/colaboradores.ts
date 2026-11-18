"use server";

import { randomInt } from "node:crypto";
import {
  esCuentaColaboradorActiva,
  normalizarRolSistema,
  obtenerSesionYRol,
} from "@/lib/auth/session";
import { registrarEventoAuditoria } from "@/lib/security/auditLog";
import {
  verificarOrigenPermitido,
  verificarRateLimit,
} from "@/lib/security/rateLimit";
import { sanitizarErrorPublico } from "@/lib/security/safeError";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

type ColaboradorRow = Database["public"]["Tables"]["colaboradores"]["Row"];
type ColaboradorInsert =
  Database["public"]["Tables"]["colaboradores"]["Insert"];

/** Payload mapeado (snake_case) del formulario. El `id` lo asigna el servidor. */
export type CrearColaboradorPayload = Omit<ColaboradorInsert, "id">;

export type CrearColaboradorResultado =
  | { ok: true; colaborador: ColaboradorRow; contrasenaGenerada: string }
  | { ok: false; error: string };

const MAYUSCULAS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const MINUSCULAS = "abcdefghijkmnopqrstuvwxyz";
const NUMEROS = "23456789";
const ESPECIALES = "!@#$%^&*()-_=+?";

/**
 * Genera una contraseña aleatoria con CSPRNG (node:crypto).
 * Garantiza al menos una mayúscula, minúscula, número y carácter especial.
 * Excluye caracteres ambiguos (0/O, 1/l/I) para facilitar su copiado/captura.
 */
function generarPasswordSegura(longitud = 16): string {
  const grupos = [MAYUSCULAS, MINUSCULAS, NUMEROS, ESPECIALES];
  const todos = grupos.join("");
  const tomar = (alfabeto: string) => alfabeto[randomInt(alfabeto.length)];

  const caracteres = grupos.map(tomar);
  while (caracteres.length < longitud) {
    caracteres.push(tomar(todos));
  }

  // Fisher-Yates con CSPRNG para no dejar los grupos en posiciones predecibles
  for (let i = caracteres.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]];
  }

  return caracteres.join("");
}
const ROL_AUTORIZADO = "Recursos Humanos";

function detectarErrorUnicidad(error: {
  code?: string;
  message?: string;
  details?: string;
}): string | null {
  const codigo = (error.code ?? "").trim();
  const textoCompleto = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();

  const esUnicidad =
    codigo === "23505" ||
    textoCompleto.includes("duplicate key") ||
    textoCompleto.includes("unique constraint") ||
    textoCompleto.includes("23505") ||
    textoCompleto.includes("already exists");

  if (!esUnicidad) return null;

  if (textoCompleto.includes("curp")) {
    return "Error: El CURP ingresado ya pertenece a otro colaborador";
  }
  if (textoCompleto.includes("rfc")) {
    return "Error: El RFC ingresado ya pertenece a otro colaborador";
  }
  if (textoCompleto.includes("nss")) {
    return "Error: El NSS ingresado ya pertenece a otro colaborador";
  }
  if (textoCompleto.includes("id2")) {
    return "Error: El ID2 ingresado ya pertenece a otro colaborador";
  }
  if (textoCompleto.includes("correo") || textoCompleto.includes("email")) {
    return "Error: El correo electrónico ingresado ya pertenece a otro colaborador";
  }
  if (
    textoCompleto.includes("no_empleado") ||
    textoCompleto.includes("numero_empleado")
  ) {
    return "Error: El No. de Empleado ingresado ya pertenece a otro colaborador";
  }

  return "Error: Uno de los datos únicos ingresados (RFC, CURP, NSS o ID2) ya pertenece a otro colaborador";
}

export async function crearColaboradorAction(
  payload: CrearColaboradorPayload
): Promise<CrearColaboradorResultado> {
  try {
    if (!verificarOrigenPermitido()) {
      return { ok: false, error: "Origen de solicitud no autorizado." };
    }

    // 0. Autorización: el service role omite RLS, por lo que solo RH puede invocarlo.
    const sesion = createSessionClient();
    const {
      data: { user: solicitante },
    } = await sesion.auth.getUser();

    if (!solicitante) {
      return { ok: false, error: "Sesión no válida. Inicia sesión nuevamente." };
    }

    const controlTasa = verificarRateLimit(
      `rh-alta:${solicitante.id}`,
      15,
      60 * 1000
    );
    if (!controlTasa.permitido) {
      return {
        ok: false,
        error: "Has realizado demasiadas operaciones seguidas. Espera un momento.",
      };
    }

    const supabaseAdmin = createAdminClient();

    const { data: perfilSolicitante } = await supabaseAdmin
      .from("colaboradores")
      .select("rol_sistema, estatus")
      .eq("id", solicitante.id)
      .maybeSingle();

    if (
      !esCuentaColaboradorActiva(perfilSolicitante?.estatus) ||
      normalizarRolSistema(perfilSolicitante?.rol_sistema) !== ROL_AUTORIZADO
    ) {
      return {
        ok: false,
        error: "No cuentas con permisos de Recursos Humanos para dar de alta colaboradores.",
      };
    }

    // Validaciones mínimas del lado servidor
    const correo = payload.correo_corporativo?.trim().toLowerCase();
    if (!correo) {
      return { ok: false, error: "El correo corporativo es obligatorio." };
    }
    if (!payload.nombre_completo?.trim()) {
      return { ok: false, error: "El nombre completo es obligatorio." };
    }
    if (payload.empresa !== "AIF" && payload.empresa !== "ROYAL") {
      return { ok: false, error: "La empresa debe ser AIF o ROYAL." };
    }

    // Paso 1: crear usuario en Auth con contraseña definitiva autogenerada
    // (no afecta la sesión actual de RH)
    const contrasenaGenerada = generarPasswordSegura(16);
    const { data: creado, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email: correo,
        password: contrasenaGenerada,
        email_confirm: true,
      });

    if (authError || !creado.user) {
      const yaExiste = /already|registered|exists/i.test(authError?.message ?? "");
      return {
        ok: false,
        error: yaExiste
          ? `Ya existe una cuenta con el correo ${correo}.`
          : sanitizarErrorPublico(
              authError,
              "No se pudo crear la cuenta de acceso del colaborador."
            ),
      };
    }

    const userId = creado.user.id;

    // Paso 2: insertar el expediente con id = auth.users.id
    const payloadInsert: ColaboradorInsert = {
      ...payload,
      correo_corporativo: correo,
      id: userId,
      zonas_geocerca: [],
    };

    const { data: colaborador, error: insertError } = await supabaseAdmin
      .from("colaboradores")
      .insert(payloadInsert)
      .select("*")
      .single();

    if (insertError || !colaborador) {
      // Rollback: evitar usuarios huérfanos en Auth
      await supabaseAdmin.auth.admin.deleteUser(userId);
      const mensajeUnicidad = insertError
        ? detectarErrorUnicidad(insertError)
        : null;
      return {
        ok: false,
        error:
          mensajeUnicidad ??
          sanitizarErrorPublico(
            insertError,
            "No se pudo registrar el expediente del colaborador."
          ),
      };
    }

    void registrarEventoAuditoria({
      evento: "RH_ALTA_COLABORADOR",
      actorId: solicitante.id,
      actorEmail: solicitante.email ?? null,
      objetivoId: userId,
      detalles: {
        correoCorporativo: correo,
        empresa: payload.empresa,
        rolSistema: payload.rol_sistema,
      },
    });

    return {
      ok: true,
      colaborador: colaborador as ColaboradorRow,
      contrasenaGenerada,
    };
  } catch (err) {
    return {
      ok: false,
      error: sanitizarErrorPublico(
        err,
        "Error inesperado al crear el colaborador."
      ),
    };
  }
}

/**
 * Sincroniza el estatus laboral ('Activo' vs 'Inactivo' / 'Baja') con `auth.users`
 * para bloquear o rehabilitar inmediatamente el acceso a la plataforma.
 * Exclusivo para Recursos Humanos.
 */
export async function sincronizarEstatusAccesoColaboradorAction(payload: {
  colaboradorId: string;
  nuevoEstatus: "Activo" | "Inactivo" | "Baja" | string;
  motivoBaja?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!verificarOrigenPermitido()) {
      return { ok: false, error: "Origen de solicitud no autorizado." };
    }

    const sesion = createSessionClient();
    const {
      data: { user: solicitante },
    } = await sesion.auth.getUser();

    if (!solicitante) {
      return { ok: false, error: "Sesión no válida. Inicia sesión nuevamente." };
    }

    const supabaseAdmin = createAdminClient();
    const { data: perfilSolicitante } = await supabaseAdmin
      .from("colaboradores")
      .select("rol_sistema, estatus")
      .eq("id", solicitante.id)
      .maybeSingle();

    if (
      !esCuentaColaboradorActiva(perfilSolicitante?.estatus) ||
      normalizarRolSistema(perfilSolicitante?.rol_sistema) !== ROL_AUTORIZADO
    ) {
      return {
        ok: false,
        error: "Solo Recursos Humanos puede modificar el estatus de acceso.",
      };
    }

    const targetId = (payload.colaboradorId ?? "").trim();
    if (!targetId || targetId.startsWith("row-")) {
      return { ok: false, error: "Identificador de colaborador no válido." };
    }

    const cuentaActiva = esCuentaColaboradorActiva(payload.nuevoEstatus);

    // Bloquear ('876000h' = ~100 años) o rehabilitar ('none') en auth.users
    await supabaseAdmin.auth.admin.updateUserById(targetId, {
      ban_duration: cuentaActiva ? "none" : "876000h",
    });

    void registrarEventoAuditoria({
      evento: "RH_CAMBIO_ESTATUS_COLABORADOR",
      actorId: solicitante.id,
      actorEmail: solicitante.email ?? null,
      objetivoId: targetId,
      detalles: {
        nuevoEstatus: payload.nuevoEstatus,
        cuentaActiva,
        motivoBaja: payload.motivoBaja ?? null,
      },
    });

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: sanitizarErrorPublico(
        err,
        "No se pudo sincronizar el estatus de acceso del colaborador."
      ),
    };
  }
}

export interface ResultadoFilaImportacion {
  filaIndice: number;
  nombreCompleto: string;
  correoCorporativo: string;
  empresa: string;
  rolSistema: string;
  departamento: string;
  puesto: string;
  ok: boolean;
  modo?: "creado" | "actualizado";
  contrasenaGenerada?: string | null;
  colaboradorId?: string;
  error?: string;
}

export interface ResultadoImportacionMasivaAdmin {
  ok: boolean;
  errorGeneral?: string;
  totalRecibidos: number;
  totalExitosos: number;
  totalFallidos: number;
  jefeIdsEnlazados: number;
  resultados: ResultadoFilaImportacion[];
}

function normalizarNombreBusqueda(valor: string | null | undefined): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function clavesBusquedaNombre(valor: string | null | undefined): string[] {
  const raw = (valor ?? "").trim();
  if (!raw) return [];
  const claves = new Set<string>();
  const base = normalizarNombreBusqueda(raw);
  if (base) claves.add(base);

  if (raw.includes(",")) {
    const [apellidos, ...resto] = raw.split(",");
    const invertido = normalizarNombreBusqueda(
      `${resto.join(" ")} ${apellidos ?? ""}`
    );
    if (invertido) claves.add(invertido);
  }
  return Array.from(claves);
}

function sanitizarCorreoUnicoServidor(
  raw: string | null | undefined,
  correosUsadosLote?: Set<string>
): string {
  if (!raw) return "";
  const coincidencias = raw.match(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
  );
  if (!coincidencias || coincidencias.length === 0) {
    return raw.split(/[;,/\s]+/)[0]?.trim().toLowerCase() ?? "";
  }
  const limpios = coincidencias.map((c) => c.trim().toLowerCase());
  if (correosUsadosLote) {
    const disponibles = limpios.filter((c) => !correosUsadosLote.has(c));
    if (disponibles.length > 0) {
      const dispAif = disponibles.find((c) => c.includes("@aif."));
      return dispAif ?? disponibles[0]!;
    }
  }
  const preferidoAif = limpios.find((c) => c.includes("@aif."));
  return preferidoAif ?? limpios[0]!;
}

/**
 * Importa en lote colaboradores desde el asistente de Excel.
 * EXCLUSIVO para el Administrador del Sistema (`esAdminSistema === true`, ej. jrealmedina@gmail.com).
 * - Pasada 1: Crea la cuenta en `auth.users` con contraseña CSPRNG de 16 caracteres (o reutiliza el UUID si ya existe en Auth)
 *             e inserta/actualiza el expediente completo en `public.colaboradores` guardando `jefe_directo` en texto.
 * - Pasada 2: Enlaza automáticamente `jefe_directo_id` (UUID) buscando coincidencias por nombre entre los recién creados
 *             y toda la plantilla existente en `public.colaboradores`.
 */
export async function importarColaboradoresMasivoAdminAction(
  filas: CrearColaboradorPayload[]
): Promise<ResultadoImportacionMasivaAdmin> {
  try {
    if (!verificarOrigenPermitido()) {
      return {
        ok: false,
        errorGeneral: "Origen de solicitud no autorizado.",
        totalRecibidos: 0,
        totalExitosos: 0,
        totalFallidos: 0,
        jefeIdsEnlazados: 0,
        resultados: [],
      };
    }

    const sesion = await obtenerSesionYRol();
    if (!sesion || !sesion.esAdminSistema) {
      return {
        ok: false,
        errorGeneral:
          "Acceso denegado. Esta función es exclusiva del Administrador del Sistema.",
        totalRecibidos: 0,
        totalExitosos: 0,
        totalFallidos: 0,
        jefeIdsEnlazados: 0,
        resultados: [],
      };
    }

    if (!Array.isArray(filas) || filas.length === 0) {
      return {
        ok: false,
        errorGeneral: "No se recibieron registros para importar.",
        totalRecibidos: 0,
        totalExitosos: 0,
        totalFallidos: 0,
        jefeIdsEnlazados: 0,
        resultados: [],
      };
    }

    if (filas.length > 200) {
      return {
        ok: false,
        errorGeneral: "El límite máximo por lote de importación es de 200 registros.",
        totalRecibidos: filas.length,
        totalExitosos: 0,
        totalFallidos: filas.length,
        jefeIdsEnlazados: 0,
        resultados: [],
      };
    }

    const supabaseAdmin = createAdminClient();

    // Consultar usuarios existentes en Auth y en colaboradores para soportar re-ejecución limpia
    const { data: listUsersData } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    const mapaAuthPorCorreo = new Map<string, string>();
    for (const u of listUsersData?.users ?? []) {
      if (u.email) {
        mapaAuthPorCorreo.set(u.email.trim().toLowerCase(), u.id);
      }
    }

    const resultados: ResultadoFilaImportacion[] = [];
    const idsProcesadosConJefeTexto: Array<{
      id: string;
      jefeTexto: string;
    }> = [];
    const correosAsignadosEnLote = new Set<string>();

    // PASADA 1: Crear cuenta en Auth + Insertar/Actualizar en `public.colaboradores`
    for (let i = 0; i < filas.length; i++) {
      const fila = filas[i];
      const nombreCompleto = (fila.nombre_completo ?? "").trim();
      const correo = sanitizarCorreoUnicoServidor(
        fila.correo_corporativo,
        correosAsignadosEnLote
      );
      if (correo) {
        correosAsignadosEnLote.add(correo);
      }
      const empresaNorm =
        (fila.empresa ?? "AIF").trim().toUpperCase() === "ROYAL"
          ? "ROYAL"
          : "AIF";
      const rolNorm = normalizarRolSistema(fila.rol_sistema);

      if (!nombreCompleto || !correo || !correo.includes("@")) {
        resultados.push({
          filaIndice: i + 1,
          nombreCompleto: nombreCompleto || `Fila #${i + 1}`,
          correoCorporativo: correo || "Sin correo",
          empresa: empresaNorm,
          rolSistema: rolNorm,
          departamento: fila.departamento ?? "General",
          puesto: fila.puesto ?? "Colaborador",
          ok: false,
          error: "Falta nombre completo o correo corporativo válido.",
        });
        continue;
      }

      let userId = mapaAuthPorCorreo.get(correo) ?? null;
      let contrasenaGenerada: string | null = null;
      let creadoEnEstaCorrida = false;

      if (!userId) {
        contrasenaGenerada = generarPasswordSegura(16);
        const { data: creado, error: authErr } =
          await supabaseAdmin.auth.admin.createUser({
            email: correo,
            password: contrasenaGenerada,
            email_confirm: true,
          });

        if (authErr || !creado.user) {
          resultados.push({
            filaIndice: i + 1,
            nombreCompleto,
            correoCorporativo: correo,
            empresa: empresaNorm,
            rolSistema: rolNorm,
            departamento: fila.departamento ?? "General",
            puesto: fila.puesto ?? "Colaborador",
            ok: false,
            error: sanitizarErrorPublico(
              authErr,
              "No se pudo crear la cuenta en Supabase Auth."
            ),
          });
          continue;
        }

        userId = creado.user.id;
        creadoEnEstaCorrida = true;
        mapaAuthPorCorreo.set(correo, userId);
      }

      const estatusNorm =
        (fila.estatus ?? "Activo").trim().toLowerCase() === "inactivo"
          ? "Inactivo"
          : (fila.estatus ?? "Activo").trim().toLowerCase() === "baja"
          ? "Baja"
          : "Activo";

      const payloadGuardar: ColaboradorInsert = {
        ...fila,
        id: userId,
        nombre_completo: nombreCompleto,
        correo_corporativo: correo,
        empresa: empresaNorm,
        rol_sistema: rolNorm,
        es_jefatura:
          rolNorm === "Jefatura" || Boolean(fila.es_jefatura),
        estatus: estatusNorm,
        fecha_ingreso:
          fila.fecha_ingreso?.trim() || new Date().toISOString().slice(0, 10),
        jefe_directo: fila.jefe_directo?.trim() || null,
        jefe_directo_id: null, // Se resuelve en la Pasada 2 para evitar fallos de FK si el jefe viene más abajo
        zonas_geocerca: fila.zonas_geocerca ?? [],
      };

      const { error: upsertError } = await supabaseAdmin
        .from("colaboradores")
        .upsert(payloadGuardar, { onConflict: "id" });

      if (upsertError) {
        if (creadoEnEstaCorrida) {
          await supabaseAdmin.auth.admin.deleteUser(userId);
          mapaAuthPorCorreo.delete(correo);
        }
        const msgUnicidad = detectarErrorUnicidad(upsertError);
        resultados.push({
          filaIndice: i + 1,
          nombreCompleto,
          correoCorporativo: correo,
          empresa: empresaNorm,
          rolSistema: rolNorm,
          departamento: fila.departamento ?? "General",
          puesto: fila.puesto ?? "Colaborador",
          ok: false,
          error:
            msgUnicidad ??
            sanitizarErrorPublico(
              upsertError,
              "Error al insertar el expediente en colaboradores."
            ),
        });
        continue;
      }

      if (payloadGuardar.jefe_directo) {
        idsProcesadosConJefeTexto.push({
          id: userId,
          jefeTexto: payloadGuardar.jefe_directo,
        });
      }

      resultados.push({
        filaIndice: i + 1,
        nombreCompleto,
        correoCorporativo: correo,
        empresa: empresaNorm,
        rolSistema: rolNorm,
        departamento: fila.departamento ?? "General",
        puesto: fila.puesto ?? "Colaborador",
        ok: true,
        modo: creadoEnEstaCorrida ? "creado" : "actualizado",
        contrasenaGenerada,
        colaboradorId: userId,
      });
    }

    // PASADA 2: Enlazar `jefe_directo_id` por coincidencia de nombre completo (si el jefe ya existe en BD o fue importado en el lote)
    let jefeIdsEnlazados = 0;
    if (idsProcesadosConJefeTexto.length > 0) {
      const { data: todosColabs } = await supabaseAdmin
        .from("colaboradores")
        .select("id, nombre_completo");

      const mapaPorNombre = new Map<string, string>();
      for (const c of todosColabs ?? []) {
        for (const clave of clavesBusquedaNombre(c.nombre_completo)) {
          mapaPorNombre.set(clave, c.id);
        }
      }

      for (const item of idsProcesadosConJefeTexto) {
        const clavesJefe = clavesBusquedaNombre(item.jefeTexto);
        const jefeUuid =
          clavesJefe.map((k) => mapaPorNombre.get(k)).find(Boolean) ?? null;
        if (jefeUuid && jefeUuid !== item.id) {
          const { error: linkErr } = await supabaseAdmin
            .from("colaboradores")
            .update({ jefe_directo_id: jefeUuid })
            .eq("id", item.id);
          if (!linkErr) {
            jefeIdsEnlazados += 1;
          }
        }
      }
    }

    const totalExitosos = resultados.filter((r) => r.ok).length;
    const totalFallidos = resultados.length - totalExitosos;

    void registrarEventoAuditoria({
      evento: "RH_ALTA_COLABORADOR",
      actorId: sesion.userId,
      actorEmail: sesion.email,
      detalles: {
        tipo: "IMPORTACION_MASIVA_EXCEL_ADMIN",
        totalRecibidos: filas.length,
        totalExitosos,
        totalFallidos,
        jefeIdsEnlazados,
      },
    });

    return {
      ok: true,
      totalRecibidos: filas.length,
      totalExitosos,
      totalFallidos,
      jefeIdsEnlazados,
      resultados,
    };
  } catch (err) {
    return {
      ok: false,
      errorGeneral: sanitizarErrorPublico(
        err,
        "Ocurrió un error durante la importación masiva."
      ),
      totalRecibidos: filas.length,
      totalExitosos: 0,
      totalFallidos: filas.length,
      jefeIdsEnlazados: 0,
      resultados: [],
    };
  }
}
