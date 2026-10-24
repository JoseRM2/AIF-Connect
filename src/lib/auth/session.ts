import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type RolSistema = "Colaborador" | "Jefatura" | "Recursos Humanos";

export const ROL_RECURSOS_HUMANOS: RolSistema = "Recursos Humanos";

export interface PerfilSesionActual {
  userId: string;
  email: string;
  nombreCompleto: string;
  empresa: string;
  rolSistema: RolSistema;
  esRecursosHumanos: boolean;
}

export function normalizarRolSistema(raw: string | null | undefined): RolSistema {
  const limpio = (raw ?? "").trim();
  if (limpio === "Recursos Humanos") {
    return "Recursos Humanos";
  }
  if (limpio === "Jefatura") {
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

    const { data: colaborador } = await supabase
      .from("colaboradores")
      .select("id, nombre_completo, correo_corporativo, empresa, rol_sistema")
      .eq("id", user.id)
      .maybeSingle();

    const rolSistema = normalizarRolSistema(colaborador?.rol_sistema);

    return {
      userId: user.id,
      email: colaborador?.correo_corporativo || user.email || "",
      nombreCompleto:
        colaborador?.nombre_completo?.trim() ||
        user.email?.split("@")[0] ||
        "Colaborador",
      empresa: colaborador?.empresa || "AIF",
      rolSistema,
      esRecursosHumanos: rolSistema === ROL_RECURSOS_HUMANOS,
    };
  }
);
