"use server";

import { esCuentaColaboradorActiva } from "@/lib/auth/session";
import { registrarEventoAuditoria } from "@/lib/security/auditLog";
import {
  obtenerIpSolicitante,
  reiniciarRateLimit,
  verificarOrigenPermitido,
  verificarRateLimit,
} from "@/lib/security/rateLimit";
import { sanitizarErrorAuth } from "@/lib/security/safeError";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface IniciarSesionResult {
  ok: boolean;
  error?: string;
}

const VENTANA_LOGIN_MS = 15 * 60 * 1000; // 15 minutos
const MAX_INTENTOS_LOGIN = 5;

/**
 * Autentica al usuario desde el servidor para fijar de forma inmediata y atómica
 * las cookies HTTP de sesión (`sb-*-auth-token`) en la respuesta antes de navegar a `/dashboard`.
 * Incluye protección contra fuerza bruta (Rate Limit), validación de origen, errores seguros
 * y bloqueo automático de cuentas con estatus 'Inactivo' o 'Baja'.
 */
export async function iniciarSesionServerAction(
  email: string,
  password: string
): Promise<IniciarSesionResult> {
  try {
    if (!verificarOrigenPermitido()) {
      return {
        ok: false,
        error: "Origen de solicitud no autorizado.",
      };
    }

    const emailLimpio = (email ?? "").trim().toLowerCase();
    if (!emailLimpio || !password || emailLimpio.length > 254 || password.length > 256) {
      return {
        ok: false,
        error: "Ingresa un correo electrónico y contraseña válidos.",
      };
    }

    const ip = obtenerIpSolicitante();
    const claveRateLimit = `login:${ip}:${emailLimpio}`;
    const controlTasa = verificarRateLimit(
      claveRateLimit,
      MAX_INTENTOS_LOGIN,
      VENTANA_LOGIN_MS
    );

    if (!controlTasa.permitido) {
      void registrarEventoAuditoria({
        evento: "AUTH_RATE_LIMIT_EXCEDIDO",
        actorEmail: emailLimpio,
        detalles: { reintentarEnSegundos: controlTasa.reintentarEnSegundos },
      });
      const minutos = Math.max(1, Math.ceil(controlTasa.reintentarEnSegundos / 60));
      return {
        ok: false,
        error: `Demasiados intentos fallidos. Por seguridad, espera ${minutos} ${
          minutos === 1 ? "minuto" : "minutos"
        } antes de volver a intentar.`,
      };
    }

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailLimpio,
      password,
    });

    if (error || !data.user) {
      void registrarEventoAuditoria({
        evento: "AUTH_LOGIN_FALLIDO",
        actorEmail: emailLimpio,
      });
      return {
        ok: false,
        error: sanitizarErrorAuth(error?.message),
      };
    }

    // Verificar que el colaborador no haya sido dado de baja ('Inactivo' o 'Baja')
    try {
      const admin = createAdminClient();
      let { data: colab } = await admin
        .from("colaboradores")
        .select("id, estatus")
        .eq("id", data.user.id)
        .maybeSingle();

      if (!colab) {
        const { data: colabPorCorreo } = await admin
          .from("colaboradores")
          .select("id, estatus")
          .ilike("correo_corporativo", emailLimpio)
          .maybeSingle();
        colab = colabPorCorreo ?? null;
      }

      if (colab && !esCuentaColaboradorActiva(colab.estatus)) {
        await supabase.auth.signOut();
        void registrarEventoAuditoria({
          evento: "AUTH_CUENTA_INACTIVA_BLOQUEADA",
          actorId: data.user.id,
          actorEmail: emailLimpio,
          detalles: { estatus: colab.estatus },
        });
        return {
          ok: false,
          error:
            "Tu cuenta se encuentra dada de baja o inactiva. Contacta a Recursos Humanos.",
        };
      }
    } catch {
      // Si el cliente admin no está disponible en entorno local, middleware hará la segunda verificación
    }

    reiniciarRateLimit(claveRateLimit);
    void registrarEventoAuditoria({
      evento: "AUTH_LOGIN_EXITOSO",
      actorId: data.user.id,
      actorEmail: emailLimpio,
    });

    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "Ocurrió un error al iniciar sesión. Intenta nuevamente.",
    };
  }
}

export async function cerrarSesionServerAction(): Promise<void> {
  try {
    const supabase = createClient();
    await supabase.auth.signOut();
  } catch {
    // Ignorar errores al limpiar cookies en servidor
  }
}
