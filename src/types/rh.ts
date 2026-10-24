import type { EmpresaZona } from "@/types/zonas";

/**
 * Tipos del módulo de Administración RH.
 * TODO(supabase): mapear a la tabla `colaboradores`.
 */

export type Empresa = EmpresaZona;

export type RolEmpleado = "rh" | "colaborador";

export type EstatusEmpleado = "activo" | "inactivo";

export interface Empleado {
  id: string;
  nombre: string;
  correo: string;
  puesto: string;
  departamento: string;
  empresa: Empresa;
  rol: RolEmpleado;
  estatus: EstatusEmpleado;
}

export type EstatusFirmaRh = "pendiente_rh" | "firmada" | "rechazada";

/** Solicitud en la Bandeja de Entrada de RH (pre-aprobada por Jefatura). */
export interface SolicitudRh {
  id: string;
  colaborador_id: string;
  colaborador_nombre: string;
  tipo_label: string;
  resumen: string;
  dias: number;
  fecha_inicio: string;
  fecha_fin: string;
  estatus_firma: EstatusFirmaRh;
}

/** Payload del formulario exclusivo de RH para Vacaciones Pagadas. */
export interface VacacionesPagadasForm {
  colaborador_id: string;
  fecha_inicio: string;
  fecha_fin: string;
  dias_a_pagar: number;
}

/**
 * Alerta visual de marcaje fuera de geocerca.
 * TODO(supabase): derivar de `asistencias.ubicacion_entrada` / `ubicacion_salida` vs `colaboradores.zonas_geocerca`.
 */
export interface AlertaGeolocalizacionRh {
  id: string;
  colaborador_id: string;
  colaborador_nombre: string;
  exceso_metros: number;
  fecha_hora: string;
  zona_mas_cercana: string;
  lat: number;
  lng: number;
  nota_alerta: string;
  archivada: boolean;
}

export type EstatusTicketRh = "pendiente" | "aprobado" | "rechazado";

/**
 * Ticket enviado por colaborador ante omisión de marcaje o justificación de asistencia.
 * TODO(supabase): mapear a la tabla de tickets / incidencias de `asistencias`.
 */
export interface TicketOmisionRh {
  id: string;
  folio: string;
  colaborador_id: string;
  colaborador_nombre: string;
  fecha_afectada: string;
  horario_propuesto: string;
  motivo_colaborador: string;
  estatus: EstatusTicketRh;
}

export interface MetricasMonitorRh {
  retardos_quincena: number;
  faltas_por_retardos: number;
}

/**
 * Formulario de creación de comunicado oficial en el Muro Corporativo desde RH.
 * TODO(supabase): insertar en `muro_publicaciones`.
 */
export interface NuevaPublicacionRhForm {
  titulo: string;
  contenido: string;
  archivo_adjunto_nombre: string;
  enlace_https: string;
  requiere_acuse: boolean;
}

export type EstatusComentarioRh = "pendiente" | "aprobado" | "eliminado";

/**
 * Comentario de colaborador pendiente de moderación en el Muro Corporativo.
 * TODO(supabase): mapear a `muro_interacciones`.
 */
export interface ComentarioModeracionRh {
  id: string;
  colaborador_id: string;
  colaborador_nombre: string;
  publicacion_id: string;
  publicacion_titulo: string;
  comentario: string;
  fecha: string;
  estatus: EstatusComentarioRh;
}



