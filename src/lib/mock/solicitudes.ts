import type { SaldoVacaciones, Solicitud } from "@/types/solicitudes";

/**
 * Datos estáticos del módulo de solicitudes.
 * TODO(supabase): reemplazar por consultas a `solicitudes` y
 * `colaboradores.saldo_vacaciones`.
 */

export const SALDO_MOCK: SaldoVacaciones = {
  periodos_activos: 1,
  dias_proporcionales: 6,
};

export const SOLICITUDES_MOCK: Solicitud[] = [
  {
    id: "sol-003",
    colaborador_id: "colab-001",
    tipo: "vacaciones",
    fecha_inicio: "2023-12-20",
    fecha_fin: "2023-12-31",
    motivo: "Vacaciones decembrinas",
    estatus: "Completado",
  },
  {
    id: "sol-002",
    colaborador_id: "colab-001",
    tipo: "permiso_sin_goce",
    fecha_inicio: "2023-11-15",
    fecha_fin: "2023-11-15",
    motivo: "Trámite personal",
    estatus: "Pendiente_Jefe",
  },
  {
    id: "sol-001",
    colaborador_id: "colab-001",
    tipo: "permiso_con_goce",
    fecha_inicio: "2023-10-05",
    fecha_fin: "2023-10-06",
    motivo: "Cita médica familiar",
    estatus: "Aprobado_Jefe",
  },
];
