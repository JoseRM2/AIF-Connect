"use server";

import { revalidatePath } from "next/cache";
import { obtenerFeriadosDinamicosAction } from "@/app/actions/calendario";
import { obtenerSesionYRol } from "@/lib/auth/session";
import { calcularDiasEfectivosSinFeriados } from "@/lib/calendario";
import { verificarOrigenPermitido } from "@/lib/security/rateLimit";
import { sanitizarErrorPublico } from "@/lib/security/safeError";
import { createAdminClient } from "@/lib/supabase/admin";

export interface CancelarSolicitudResult {
  ok: boolean;
  error?: string;
  diasReembolsados?: number;
}

/**
 * Cancela (elimina) una solicitud de vacaciones o permiso del colaborador autenticado (o por RH).
 * - Si la solicitud es de tipo "Vacaciones" y ya había sido aprobada (`Aprobado_Jefe` o `Completado`),
 *   reembolsa automáticamente los días descontados (incluyendo medios días `0.5`) a `colaboradores.saldo_vacaciones`.
 */
export async function cancelarSolicitudAction(
  solicitudId: string
): Promise<CancelarSolicitudResult> {
  try {
    if (!verificarOrigenPermitido()) {
      return { ok: false, error: "Origen de solicitud no autorizado." };
    }

    const sesion = await obtenerSesionYRol();
    if (!sesion) {
      return {
        ok: false,
        error: "Sesión no válida. Inicia sesión nuevamente.",
      };
    }

    const idLimpio = (solicitudId ?? "").trim();
    if (!idLimpio) {
      return { ok: false, error: "Identificador de solicitud no válido." };
    }

    const db = createAdminClient();

    const { data: solicitud, error: getErr } = await db
      .from("solicitudes")
      .select(
        "id, colaborador_id, tipo_solicitud, fecha_inicio, fecha_fin, motivo, estatus"
      )
      .eq("id", idLimpio)
      .maybeSingle();

    if (getErr || !solicitud) {
      return {
        ok: false,
        error: "No se encontró la solicitud que intentas cancelar.",
      };
    }

    const esPropia = solicitud.colaborador_id === sesion.userId;
    if (!esPropia && !sesion.esRecursosHumanos && !sesion.esAdminSistema) {
      return {
        ok: false,
        error: "No tienes permisos para cancelar esta solicitud.",
      };
    }

    const estatusNorm = String(solicitud.estatus ?? "")
      .trim()
      .toLowerCase();
    const tipoNorm = String(solicitud.tipo_solicitud ?? "")
      .trim()
      .toLowerCase();

    let diasReembolsados = 0;

    // Si era de tipo "Vacaciones" y ya se habían descontado días al aprobarse, reembolsar al saldo
    const estabaAprobada =
      estatusNorm === "aprobado_jefe" ||
      estatusNorm === "aprobado" ||
      estatusNorm === "completado";

    if (tipoNorm === "vacaciones" && estabaAprobada) {
      const [{ data: colab }, feriadosDinamicos] = await Promise.all([
        db
          .from("colaboradores")
          .select("id, saldo_vacaciones, empresa")
          .eq("id", solicitud.colaborador_id)
          .maybeSingle(),
        obtenerFeriadosDinamicosAction(),
      ]);

      if (colab) {
        const calculo = calcularDiasEfectivosSinFeriados(
          solicitud.fecha_inicio,
          solicitud.fecha_fin || solicitud.fecha_inicio,
          feriadosDinamicos,
          colab.empresa,
          solicitud.motivo
        );

        if (calculo.diasEfectivos > 0) {
          const saldoActual = Number(colab.saldo_vacaciones ?? 0);
          const nuevoSaldo = Number(
            (saldoActual + calculo.diasEfectivos).toFixed(1)
          );

          let { error: saldoErr } = await db
            .from("colaboradores")
            .update({ saldo_vacaciones: nuevoSaldo })
            .eq("id", colab.id);

          // Fallback si la columna saldo_vacaciones en BD aún es integer y nuevoSaldo tiene .5
          if (saldoErr && /invalid input syntax for type integer/i.test(saldoErr.message)) {
            const retryInt = await db
              .from("colaboradores")
              .update({ saldo_vacaciones: Math.round(nuevoSaldo) })
              .eq("id", colab.id);
            saldoErr = retryInt.error;
          }

          if (!saldoErr) {
            diasReembolsados = calculo.diasEfectivos;
          }
        }
      }
    }

    const { error: delErr } = await db
      .from("solicitudes")
      .delete()
      .eq("id", idLimpio);

    if (delErr) {
      return {
        ok: false,
        error: sanitizarErrorPublico(
          delErr,
          "No fue posible cancelar la solicitud."
        ),
      };
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/solicitudes");
    revalidatePath("/dashboard/jefatura");
    revalidatePath("/dashboard/rh");
    revalidatePath("/dashboard/calendario");

    return {
      ok: true,
      diasReembolsados,
    };
  } catch (err) {
    return {
      ok: false,
      error: sanitizarErrorPublico(
        err,
        "Ocurrió un error al cancelar la solicitud."
      ),
    };
  }
}
