/**
 * Tipos del módulo de solicitudes.
 *
 * Preparados para Supabase:
 *  - tabla `solicitudes`                 -> Solicitud
 *  - columna `colaboradores.saldo_vacaciones` -> SaldoVacaciones
 */

export type TipoSolicitud =
  | "vacaciones"
  | "permiso_con_goce"
  | "permiso_sin_goce"
  | "incapacidad";

export type EstatusSolicitud =
  | "Pendiente_Jefe"
  | "Aprobado_Jefe"
  | "Pendiente_RH"
  | "Rechazado"
  | "Completado";

/** Fila de la tabla `solicitudes`. Fechas en formato "YYYY-MM-DD". */
export interface Solicitud {
  id: string;
  colaborador_id: string;
  tipo: TipoSolicitud;
  tipo_label?: string;
  fecha_inicio: string;
  fecha_fin: string;
  motivo: string;
  estatus: EstatusSolicitud;
}

/** Contenido de `colaboradores.saldo_vacaciones`. */
export interface SaldoVacaciones {
  periodos_activos: number;
  /** Días de vacaciones proporcionales del año en curso. */
  dias_proporcionales: number;
}

/** Datos capturados por el formulario (payload de un insert en `solicitudes`). */
export interface SolicitudFormData {
  tipo: TipoSolicitud;
  fecha_inicio: string;
  fecha_fin: string;
  motivo: string;
}
