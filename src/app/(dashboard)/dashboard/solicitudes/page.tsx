import { redirect } from "next/navigation";
import GestionSolicitudesEquipo from "@/components/jefatura/GestionSolicitudesEquipo";
import BalanceCards from "@/components/solicitudes/BalanceCards";
import RequestList from "@/components/solicitudes/RequestList";
import RequestsWorkspace from "@/components/solicitudes/RequestsWorkspace";
import { createClient } from "@/lib/supabase/server";
import type {
  EstatusSolicitud,
  SaldoVacaciones,
  Solicitud,
  TipoSolicitud,
} from "@/types/solicitudes";

function normalizarTipoSolicitud(raw: string | null | undefined): TipoSolicitud {
  const limpio = (raw ?? "").toLowerCase().trim();
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

  // 1. Consultar `saldo_vacaciones`, `rol_sistema` y `es_jefatura` actual en `colaboradores`
  const { data: colaborador } = await supabase
    .from("colaboradores")
    .select("saldo_vacaciones, rol_sistema, es_jefatura")
    .eq("id", user.id)
    .maybeSingle();

  const saldoDias = colaborador?.saldo_vacaciones ?? 0;
  const esJefatura =
    (colaborador?.rol_sistema ?? "").trim() === "Jefatura" ||
    Boolean(colaborador?.es_jefatura);

  const saldoReal: SaldoVacaciones = {
    periodos_activos: saldoDias > 0 ? 1 : 0,
    dias_proporcionales: saldoDias,
  };

  // 2. Consultar `solicitudes` filtrando por `colaborador_id`, ordenadas por `created_at` descendente
  const { data: filasSolicitudes } = await supabase
    .from("solicitudes")
    .select(
      "id, colaborador_id, tipo_solicitud, fecha_inicio, fecha_fin, motivo, estatus, created_at"
    )
    .eq("colaborador_id", user.id)
    .order("created_at", { ascending: false });

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

  return (
    <RequestsWorkspace
      saldoVacaciones={saldoDias}
      userId={user.id}
      metrics={<BalanceCards saldo={saldoReal} />}
      list={
        <div className="flex flex-col gap-8">
          {esJefatura && <GestionSolicitudesEquipo />}
          <RequestList solicitudes={solicitudesReales} />
        </div>
      }
    />
  );
}
