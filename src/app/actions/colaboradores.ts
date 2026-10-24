"use server";

import { randomInt } from "node:crypto";
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

export async function crearColaboradorAction(
  payload: CrearColaboradorPayload
): Promise<CrearColaboradorResultado> {
  try {
    // 0. Autorización: el service role omite RLS, por lo que solo RH puede invocarlo.
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
      .select("rol_sistema")
      .eq("id", solicitante.id)
      .maybeSingle();

    if (perfilSolicitante?.rol_sistema !== ROL_AUTORIZADO) {
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
          : `No se pudo crear la cuenta de acceso: ${authError?.message ?? "error desconocido"}`,
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
      return {
        ok: false,
        error: `No se pudo registrar el expediente: ${insertError?.message ?? "error desconocido"}`,
      };
    }

    return {
      ok: true,
      colaborador: colaborador as ColaboradorRow,
      contrasenaGenerada,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error inesperado al crear el colaborador.",
    };
  }
}
