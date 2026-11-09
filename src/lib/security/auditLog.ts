import { obtenerIpSolicitante } from "@/lib/security/rateLimit";
import { createAdminClient } from "@/lib/supabase/admin";

export type TipoEventoAuditoria =
  | "AUTH_LOGIN_EXITOSO"
  | "AUTH_LOGIN_FALLIDO"
  | "AUTH_CUENTA_INACTIVA_BLOQUEADA"
  | "AUTH_RATE_LIMIT_EXCEDIDO"
  | "RH_ALTA_COLABORADOR"
  | "RH_CAMBIO_ESTATUS_COLABORADOR"
  | "RH_CONFIG_VACACIONES_NOMINA"
  | "JEFATURA_RESOLUCION_SOLICITUD";

export interface EventoAuditoriaPayload {
  evento: TipoEventoAuditoria;
  actorId?: string | null;
  actorEmail?: string | null;
  objetivoId?: string | null;
  detalles?: Record<string, unknown>;
}

/**
 * Registra de forma asíncrona y no bloqueante un evento relevante de seguridad
 * tanto en la salida estructurada del servidor como en `public.bitacora_auditoria_seguridad` (si existe).
 */
export async function registrarEventoAuditoria(
  payload: EventoAuditoriaPayload
): Promise<void> {
  const ip = obtenerIpSolicitante();
  const timestamp = new Date().toISOString();

  try {
    // 1. Intentar persistir en la tabla de auditoría en PostgreSQL (sin bloquear si aún no se ha corrido el SQL del Punto 5)
    const admin = createAdminClient();
    await admin.from("bitacora_auditoria_seguridad" as never).insert({
      evento: payload.evento,
      actor_id: payload.actorId ?? null,
      actor_email: payload.actorEmail ?? null,
      objetivo_id: payload.objetivoId ?? null,
      ip_origen: ip,
      detalles: payload.detalles ?? {},
      created_at: timestamp,
    } as never);
  } catch {
    // Silencioso: nunca interrumpir la operación principal del usuario
  }
}
