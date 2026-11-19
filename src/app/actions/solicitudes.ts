"use server";

import { revalidatePath } from "next/cache";
import { obtenerFeriadosDinamicosAction } from "@/app/actions/calendario";
import { obtenerSesionYRol } from "@/lib/auth/session";
import { calcularDiasEfectivosSinFeriados } from "@/lib/calendario";
import { verificarOrigenPermitido } from "@/lib/security/rateLimit";
import { sanitizarErrorPublico } from "@/lib/security/safeError";
import {
  anexarMotivoCancelacion,
  esSolicitudCancelada,
} from "@/lib/solicitudes";
import { createAdminClient } from "@/lib/supabase/admin";

export interface CancelarSolicitudResult {
  ok: boolean;
  error?: string;
  diasReembolsados?: number;
  motivoActualizado?: string;
}

/**
 * Marca una solicitud como Cancelada registrando el motivo de cancelación del colaborador
 * para que Jefatura y RH puedan consultarlo y ya no puedan aprobarla.
 * - Si la solicitud era de tipo "Vacaciones" y ya había sido aprobada (`Aprobado_Jefe` o `Completado`),
 *   reembolsa automáticamente los días descontados (incluyendo medios días `0.5`) a `colaboradores.saldo_vacaciones`.
 */
export async function cancelarSolicitudAction(
  solicitudId: string,
  motivoCancelacion: string
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

    const motivoCancelLimpio = (motivoCancelacion ?? "").trim();
    if (motivoCancelLimpio.length < 3) {
      return {
        ok: false,
        error:
          "Ingresa el motivo de cancelación (mínimo 3 caracteres) para informar a tu Jefatura y a RH.",
      };
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

    if (esSolicitudCancelada(solicitud.estatus, solicitud.motivo)) {
      return {
        ok: false,
        error: "Esta solicitud ya fue cancelada previamente.",
      };
    }

    const estatusNorm = String(solicitud.estatus ?? "")
      .trim()
      .toLowerCase();
    const tipoNorm = String(solicitud.tipo_solicitud ?? "")
      .trim()
      .toLowerCase();

    let diasReembolsados = 0;

    // Si era de tipo "Vacaciones" o "Vacaciones Pagadas" y ya se habían descontado días al aprobarse, reembolsar al saldo
    const estabaAprobada =
      estatusNorm === "aprobado_jefe" ||
      estatusNorm === "aprobado" ||
      estatusNorm === "completado";

    const esTipoConDescuentoSaldo =
      tipoNorm === "vacaciones" || tipoNorm === "vacaciones pagadas";

    if (esTipoConDescuentoSaldo && estabaAprobada) {
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

          if (
            saldoErr &&
            /invalid input syntax for type integer/i.test(saldoErr.message)
          ) {
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

    const motivoActualizado = anexarMotivoCancelacion(
      solicitud.motivo,
      motivoCancelLimpio
    );

    // Intentar marcar como estatus 'Cancelado' en el ENUM; si el valor aún no se agrega en BD,
    // usar 'Rechazado' conservando la marca `[CANCELADA POR COLABORADOR: ...]` para que toda la UI la muestre como Cancelada.
    let { error: updErr } = await db
      .from("solicitudes")
      .update({
        estatus: "Cancelado",
        motivo: motivoActualizado,
      })
      .eq("id", idLimpio);

    if (updErr && /invalid input value for enum/i.test(updErr.message)) {
      const retry = await db
        .from("solicitudes")
        .update({
          estatus: "Rechazado",
          motivo: motivoActualizado,
        })
        .eq("id", idLimpio);
      updErr = retry.error;
    }

    if (updErr) {
      return {
        ok: false,
        error: sanitizarErrorPublico(
          updErr,
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
      motivoActualizado,
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
