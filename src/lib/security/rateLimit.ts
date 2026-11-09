import { headers } from "next/headers";

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
export function obtenerIpSolicitante(): string {
  try {
    const h = headers();
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
export function verificarOrigenPermitido(): boolean {
  try {
    const h = headers();
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
 * Verifica y registra un intento dentro de una ventana de tiempo (`ventanaMs`).
 */
export function verificarRateLimit(
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
 * Reinicia el contador de intentos para una clave (ej. tras un inicio de sesión exitoso).
 */
export function reiniciarRateLimit(clave: string): void {
  almacenRateLimit.delete(clave);
}
