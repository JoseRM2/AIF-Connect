"use server";

import { revalidatePath } from "next/cache";
import { obtenerSesionYRol } from "@/lib/auth/session";
import { registrarEventoAuditoria } from "@/lib/security/auditLog";
import { verificarOrigenPermitido } from "@/lib/security/rateLimit";
import { sanitizarErrorPublico } from "@/lib/security/safeError";
import { BUCKET_EXPEDIENTES } from "@/lib/storage/expedientes";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSessionClient } from "@/lib/supabase/server";

const RUTA_CONFIG_STORAGE = "_sistema/config_vacaciones_nomina.json";

export interface ConfigVacacionesNomina {
  /**
   * Interruptor controlado exclusivamente por Recursos Humanos:
   * - `false` (por defecto): Bloquea solicitudes de vacaciones del 9 al 15 y del 23 al 30 del mismo mes en curso.
   * - `true`: Permite solicitar vacaciones de forma extraordinaria durante esos periodos.
   */
  excepcionActiva: boolean;
  actualizadoPor?: string | null;
  updatedAt?: string | null;
}

// Caché en memoria del proceso servidor como respaldo instantáneo
let cacheMemoriaConfig: ConfigVacacionesNomina = {
  excepcionActiva: false,
  actualizadoPor: null,
  updatedAt: null,
};

function obtenerClienteStorage() {
  try {
    return createAdminClient();
  } catch {
    return createSessionClient() as unknown as ReturnType<
      typeof createAdminClient
    >;
  }
}

/**
 * Obtiene el estado actual del interruptor de excepción para solicitudes de vacaciones
 * en semana de nómina (días 9 al 15 y 23 al 30 del mismo mes).
 */
export async function obtenerConfigVacacionesNominaAction(): Promise<ConfigVacacionesNomina> {
  try {
    const db = obtenerClienteStorage();
    const { data, error } = await db.storage
      .from(BUCKET_EXPEDIENTES)
      .download(RUTA_CONFIG_STORAGE);

    if (error || !data) {
      return cacheMemoriaConfig;
    }

    const texto = await data.text();
    const parsed = JSON.parse(texto) as Partial<ConfigVacacionesNomina>;
    const config: ConfigVacacionesNomina = {
      excepcionActiva: Boolean(parsed.excepcionActiva),
      actualizadoPor: parsed.actualizadoPor ?? null,
      updatedAt: parsed.updatedAt ?? null,
    };
    cacheMemoriaConfig = config;
    return config;
  } catch {
    return cacheMemoriaConfig;
  }
}

export interface ActualizarConfigVacacionesResult {
  ok: boolean;
  config: ConfigVacacionesNomina;
  error?: string;
}

/**
 * Activa o desactiva el interruptor extraordinario para permitir solicitudes de vacaciones
 * en semana de nómina. Exclusivo para usuarios con `rol_sistema === 'Recursos Humanos'`.
 */
export async function actualizarConfigVacacionesNominaAction(
  excepcionActiva: boolean
): Promise<ActualizarConfigVacacionesResult> {
  try {
    if (!verificarOrigenPermitido()) {
      return {
        ok: false,
        config: cacheMemoriaConfig,
        error: "Origen de solicitud no autorizado.",
      };
    }

    const perfil = await obtenerSesionYRol();
    if (!perfil || perfil.rolSistema !== "Recursos Humanos") {
      return {
        ok: false,
        config: cacheMemoriaConfig,
        error:
          "Solo el personal de Recursos Humanos puede modificar este interruptor.",
      };
    }

    const nuevaConfig: ConfigVacacionesNomina = {
      excepcionActiva: Boolean(excepcionActiva),
      actualizadoPor: perfil.nombreCompleto || perfil.email || "RH",
      updatedAt: new Date().toISOString(),
    };

    cacheMemoriaConfig = nuevaConfig;

    try {
      const db = obtenerClienteStorage();
      const contenido = JSON.stringify(nuevaConfig, null, 2);
      const blob = new Blob([contenido], { type: "application/json" });

      await db.storage
        .from(BUCKET_EXPEDIENTES)
        .upload(RUTA_CONFIG_STORAGE, blob, {
          contentType: "application/json",
          cacheControl: "0",
          upsert: true,
        });
    } catch {
      // Si el bucket no permite escritura en ese instante, se mantiene en cacheMemoriaConfig
    }

    void registrarEventoAuditoria({
      evento: "RH_CONFIG_VACACIONES_NOMINA",
      actorId: perfil.userId,
      actorEmail: perfil.email,
      detalles: { excepcionActiva: nuevaConfig.excepcionActiva },
    });

    revalidatePath("/dashboard/solicitudes");
    revalidatePath("/dashboard/rh");

    return {
      ok: true,
      config: nuevaConfig,
    };
  } catch (err) {
    return {
      ok: false,
      config: cacheMemoriaConfig,
      error: sanitizarErrorPublico(
        err,
        "No fue posible actualizar el interruptor."
      ),
    };
  }
}
