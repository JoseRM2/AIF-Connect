import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

interface RegistroRateLimit {
  conteo: number;
  expiraEn: number;
}

const LIMITE_ENTRADAS_MEMORIA = 5000;
const almacenRateLimit = new Map<string, RegistroRateLimit>();

function limpiarExpirados(ahora: number): void {
  if (almacenRateLimit.size < LIMITE_ENTRADAS_MEMORIA) return;
  almacenRateLimit.forEach((registro, clave) => {
    if (registro.expiraEn <= ahora) {
      almacenRateLimit.delete(clave);
    }
  });
}

/**
 * Obtiene de forma segura la IP del cliente desde las cabeceras HTTP de Next.js.
 */
export async function obtenerIpSolicitante(): Promise<string> {
  try {
    const h = await headers();
    const xForwardedFor = h.get("x-forwarded-for");
    if (xForwardedFor) {
      const primeraIp = xForwardedFor.split(",")[0]?.trim();
      if (primeraIp) return primeraIp;
    }
    const xRealIp = h.get("x-real-ip")?.trim();
    if (xRealIp) return xRealIp;
  } catch {
    // Fallback cuando se invoca fuera de un contexto de request directo
  }
  return "ip-local";
}

/**
 * Valida que el origen de un Server Action coincida con el Host del servidor
 * para mitigar invocaciones cruzadas no autorizadas (CSRF / Locked Origin).
 */
export async function verificarOrigenPermitido(): Promise<boolean> {
  try {
    const h = await headers();
    const origin = h.get("origin");
    const host = h.get("x-forwarded-host") || h.get("host");
    if (!origin || !host) {
      return true;
    }
    const urlOrigin = new URL(origin);
    return urlOrigin.host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

export interface ResultadoRateLimit {
  permitido: boolean;
  restantes: number;
  reintentarEnSegundos: number;
}

/**
 * Respaldo local en memoria (para desarrollo sin SERVICE_ROLE_KEY o mientras
 * se aplica la migración SQL `20261124_fase1_rate_limit_distribuido.sql`).
 */
function verificarRateLimitEnMemoria(
  clave: string,
  maxIntentos: number,
  ventanaMs: number
): ResultadoRateLimit {
  const ahora = Date.now();
  limpiarExpirados(ahora);

  const actual = almacenRateLimit.get(clave);
  if (!actual || actual.expiraEn <= ahora) {
    almacenRateLimit.set(clave, {
      conteo: 1,
      expiraEn: ahora + ventanaMs,
    });
    return {
      permitido: true,
      restantes: Math.max(0, maxIntentos - 1),
      reintentarEnSegundos: Math.ceil(ventanaMs / 1000),
    };
  }

  if (actual.conteo >= maxIntentos) {
    return {
      permitido: false,
      restantes: 0,
      reintentarEnSegundos: Math.max(
        1,
        Math.ceil((actual.expiraEn - ahora) / 1000)
      ),
    };
  }

  actual.conteo += 1;
  almacenRateLimit.set(clave, actual);

  return {
    permitido: true,
    restantes: Math.max(0, maxIntentos - actual.conteo),
    reintentarEnSegundos: Math.max(
      1,
      Math.ceil((actual.expiraEn - ahora) / 1000)
    ),
  };
}

/**
 * Verifica y registra de forma atómica y distribuida un intento dentro de `ventanaMs`
 * usando PostgreSQL/Supabase (`public.verificar_rate_limit_atomico`), con fallback
 * automático a memoria si el RPC aún no está disponible.
 */
export async function verificarRateLimit(
  clave: string,
  maxIntentos: number,
  ventanaMs: number
): Promise<ResultadoRateLimit> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("verificar_rate_limit_atomico", {
      p_clave: clave,
      p_max_intentos: maxIntentos,
      p_ventana_ms: ventanaMs,
    });

    const fila = Array.isArray(data) ? data[0] : data;
    if (!error && fila && typeof fila.permitido === "boolean") {
      return {
        permitido: fila.permitido,
        restantes: Math.max(0, Number(fila.restantes ?? 0)),
        reintentarEnSegundos: Math.max(
          1,
          Number(fila.reintentar_en_segundos ?? Math.ceil(ventanaMs / 1000))
        ),
      };
    }
  } catch {
    // Fallback silencioso a memoria local
  }

  return verificarRateLimitEnMemoria(clave, maxIntentos, ventanaMs);
}

/**
 * Reinicia el contador de intentos para una clave (ej. tras un inicio de sesión exitoso)
 * tanto en memoria local como en la tabla distribuida de Supabase.
 */
export async function reiniciarRateLimit(clave: string): Promise<void> {
  almacenRateLimit.delete(clave);
  try {
    const admin = createAdminClient();
    await admin.from("seguridad_rate_limits").delete().eq("clave", clave);
  } catch {
    // Ignorar si no existe aún la tabla o no está configurada la llave de servicio
  }
}
