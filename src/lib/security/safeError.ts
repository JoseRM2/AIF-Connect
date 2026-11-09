const PATRONES_INTERNOS_BD =
  /pgrst|postgres|22p02|23505|23503|42501|42p01|42703|relation\s+"|column\s+"|violates\s+row-level\s+security|syntax\s+error|schema\s+cache|jwt|service_role|supabase_service_role_key|stack|at\s+Object\./i;

/**
 * Traduce errores de autenticación a mensajes seguros y uniformes en español
 * para impedir enumeración de usuarios y evitar exponer respuestas técnicas de GoTrue.
 */
export function sanitizarErrorAuth(rawMessage?: string | null): string {
  const msg = (rawMessage ?? "").trim().toLowerCase();

  if (
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    msg.includes("over_request_rate_limit")
  ) {
    return "Demasiados intentos de inicio de sesión. Espera unos minutos antes de volver a intentar.";
  }

  if (msg.includes("banned") || msg.includes("user is banned")) {
    return "Tu cuenta se encuentra inactiva o suspendida. Contacta a Recursos Humanos.";
  }

  return "Correo electrónico o contraseña incorrectos.";
}

/**
 * Garantiza que ningún mensaje de error retornado al cliente filtre detalles
 * internos de PostgreSQL, políticas RLS, nombres de tablas o trazas del servidor.
 */
export function sanitizarErrorPublico(
  error: unknown,
  mensajePorDefecto = "No fue posible procesar la solicitud. Intenta nuevamente."
): string {
  if (!error) return mensajePorDefecto;

  const mensajeCrudo =
    error instanceof Error
      ? error.message
      : typeof error === "object" &&
        error !== null &&
        "message" in error &&
        typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : typeof error === "string"
      ? error
      : "";

  const limpio = mensajeCrudo.trim();
  if (!limpio) return mensajePorDefecto;

  if (PATRONES_INTERNOS_BD.test(limpio)) {
    return mensajePorDefecto;
  }

  return limpio;
}
