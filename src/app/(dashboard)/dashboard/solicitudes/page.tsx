import { redirect } from "next/navigation";
import { obtenerFeriadosDinamicosAction } from "@/app/actions/calendario";
import { obtenerConfigVacacionesNominaAction } from "@/app/actions/configuracionSolicitudes";
import BalanceCards from "@/components/solicitudes/BalanceCards";
import RequestList from "@/components/solicitudes/RequestList";
import RequestsWorkspace from "@/components/solicitudes/RequestsWorkspace";
import { calcularDiasEfectivosSinFeriados } from "@/lib/calendario";
import { createClient } from "@/lib/supabase/server";
import type {
  EstatusSolicitud,
  SaldoVacaciones,
  Solicitud,
  TipoSolicitud,
} from "@/types/solicitudes";

function normalizarTipoSolicitud(raw: string | null | undefined): TipoSolicitud {
  const limpio = (raw ?? "").toLowerCase().trim();
  if (limpio.includes("pagadas") || limpio === "vacaciones_pagadas") {
    return "vacaciones_pagadas";
  }
  if (limpio.includes("sin goce") || limpio === "permiso_sin_goce") {
    return "permiso_sin_goce";
  }
  if (limpio.includes("con goce") || limpio === "permiso_con_goce") {
    return "permiso_con_goce";
  }
  if (limpio.includes("incapacidad")) {
    return "incapacidad";
  }
  return "vacaciones";
}

function normalizarEstatusSolicitud(
  raw: string | null | undefined
): EstatusSolicitud {
  const valor = (raw ?? "").trim();
  if (
    valor === "Pendiente_Jefe" ||
    valor === "Aprobado_Jefe" ||
    valor === "Pendiente_RH" ||
    valor === "Rechazado" ||
    valor === "Completado"
  ) {
    return valor;
  }

  const limpio = valor.toLowerCase();
  if (limpio === "aprobado_jefe") return "Aprobado_Jefe";
  if (limpio === "pendiente_rh") return "Pendiente_RH";
  if (limpio.includes("complet") || limpio.includes("aprob")) {
    return "Completado";
  }
  if (limpio.includes("rechaz") || limpio.includes("deneg")) {
    return "Rechazado";
  }
  return "Pendiente_Jefe";
}

export default async function SolicitudesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Consultar en paralelo: perfil del colaborador, configuración del interruptor RH, feriados dinámicos y solicitudes del colaborador
  const [
    { data: colaborador },
    configNomina,
    feriadosDinamicos,
    { data: filasSolicitudes },
  ] = await Promise.all([
    supabase
      .from("colaboradores")
      .select("saldo_vacaciones, empresa")
      .eq("id", user.id)
      .maybeSingle(),
    obtenerConfigVacacionesNominaAction(),
    obtenerFeriadosDinamicosAction(),
    supabase
      .from("solicitudes")
      .select(
        "id, colaborador_id, tipo_solicitud, fecha_inicio, fecha_fin, motivo, estatus, created_at"
      )
      .eq("colaborador_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const saldoDias = colaborador?.saldo_vacaciones ?? 0;
  const empresaColaborador = colaborador?.empresa?.trim() || "AIF";
  const listaFeriados = Array.isArray(feriadosDinamicos)
    ? feriadosDinamicos
    : [];

  const saldoReal: SaldoVacaciones = {
    periodos_activos: saldoDias > 0 ? 1 : 0,
    dias_proporcionales: saldoDias,
  };

  const solicitudesReales: Solicitud[] = (filasSolicitudes ?? []).map(
    (fila) => ({
      id: fila.id,
      colaborador_id: fila.colaborador_id,
      tipo: normalizarTipoSolicitud(fila.tipo_solicitud),
      tipo_label: fila.tipo_solicitud || undefined,
      fecha_inicio: fila.fecha_inicio,
      fecha_fin: fila.fecha_fin,
      motivo: fila.motivo ?? "",
      estatus: normalizarEstatusSolicitud(fila.estatus),
    })
  );

  // Días ya comprometidos en solicitudes de "Vacaciones" pendientes de autorización (descontando feriados oficiales y de empresa)
  const diasVacacionesPendientes = (filasSolicitudes ?? []).reduce(
    (acum, fila) => {
      const tipoRaw = (fila.tipo_solicitud ?? "").trim().toLowerCase();
      const estatusNorm = normalizarEstatusSolicitud(fila.estatus);
      if (
        tipoRaw === "vacaciones" &&
        (estatusNorm === "Pendiente_Jefe" || estatusNorm === "Pendiente_RH")
      ) {
        return (
          acum +
          calcularDiasEfectivosSinFeriados(
            fila.fecha_inicio,
            fila.fecha_fin,
            listaFeriados,
            empresaColaborador,
            fila.motivo
          ).diasEfectivos
        );
      }
      return acum;
    },
    0
  );

  return (
    <RequestsWorkspace
      saldoVacaciones={saldoDias}
      diasVacacionesPendientes={diasVacacionesPendientes}
      excepcionVacacionesNominaInicial={configNomina.excepcionActiva}
      userId={user.id}
      metrics={<BalanceCards saldo={saldoReal} />}
      list={<RequestList solicitudes={solicitudesReales} />}
    />
  );
}
