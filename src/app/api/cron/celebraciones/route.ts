import { timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ejecutarPublicacionesCelebracionesHoyCron } from "@/app/actions/calendario";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function esTokenValido(authHeader: string | null, secret: string): boolean {
  if (!authHeader) return false;
  const esperado = `Bearer ${secret}`;
  const a = Buffer.from(authHeader);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Endpoint invocado diariamente por Vercel Cron al inicio del horario laboral
 * (08:00 AM hora CDMX = 14:00 UTC) para emitir automáticamente las publicaciones
 * de cumpleaños y aniversario en el Muro Corporativo.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (!esTokenValido(authHeader, cronSecret)) {
      return NextResponse.json(
        { ok: false, error: "No autorizado." },
        { status: 401 }
      );
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        ok: false,
        error: "CRON_SECRET no está configurado en las variables de entorno.",
      },
      { status: 503 }
    );
  }

  const resultado = await ejecutarPublicacionesCelebracionesHoyCron();

  if (!resultado.ok) {
    return NextResponse.json(
      {
        ok: false,
        fechaMexico: resultado.fechaMexico,
        error: resultado.error ?? "No se pudieron procesar las celebraciones.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    fechaMexico: resultado.fechaMexico,
    publicadas: resultado.publicadas,
    claves: resultado.claves,
    abonosVacaciones: resultado.abonosVacaciones,
    clavesAbonos: resultado.clavesAbonos,
    ejecutadoEn: new Date().toISOString(),
  });
}
