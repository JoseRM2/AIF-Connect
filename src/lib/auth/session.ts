import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type RolSistema = "Colaborador" | "Jefatura" | "Recursos Humanos";

export const ROL_RECURSOS_HUMANOS: RolSistema = "Recursos Humanos";

export interface PerfilSesionActual {
  userId: string;
  email: string;
  nombreCompleto: string;
  empresa: string;
  departamento: string;
  rolSistema: RolSistema;
  esJefatura: boolean;
  esRecursosHumanos: boolean;
}

export function normalizarRolSistema(raw: string | null | undefined): RolSistema {
  const limpio = (raw ?? "").trim();
  if (limpio === "Recursos Humanos" || limpio === "RH") {
    return "Recursos Humanos";
  }
  if (limpio === "Jefatura" || limpio === "Jefe") {
    return "Jefatura";
  }
  return "Colaborador";
}

/**
 * Obtiene el usuario autenticado y su `rol_sistema` desde `colaboradores`.
 * Envuelto en `React.cache` para deduplicar la consulta dentro del mismo
 * ciclo de renderizado entre Layouts y Server Components.
 */
export const obtenerSesionYRol = cache(
  async (): Promise<PerfilSesionActual | null> => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return null;
    }

    // Usamos select("*") para evitar errores PostgREST si alguna columna opcional (como `area`) no existe en la BD
    let { data: colaborador } = await supabase
      .from("colaboradores")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    // Fallback por correo corporativo en caso de que el registro aún no coincida por UUID
    if (!colaborador && user.email) {
      const { data: colabPorCorreo } = await supabase
        .from("colaboradores")
        .select("*")
        .ilike("correo_corporativo", user.email.trim())
        .maybeSingle();
      colaborador = colabPorCorreo ?? null;
    }

    const rolSistema = normalizarRolSistema(colaborador?.rol_sistema);
    const esJefatura =
      rolSistema === "Jefatura" || Boolean(colaborador?.es_jefatura);

    return {
      userId: user.id,
      email: colaborador?.correo_corporativo || user.email || "",
      nombreCompleto:
        colaborador?.nombre_completo?.trim() ||
        user.email?.split("@")[0] ||
        "Colaborador",
      empresa: colaborador?.empresa?.trim() || "AIF",
      departamento:
        colaborador?.departamento?.trim() ||
        colaborador?.area?.trim() ||
        "Todos",
      rolSistema,
      esJefatura,
      esRecursosHumanos: rolSistema === ROL_RECURSOS_HUMANOS,
    };
  }
);
