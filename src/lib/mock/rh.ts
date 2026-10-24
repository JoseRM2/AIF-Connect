import type {
  AlertaGeolocalizacionRh,
  ComentarioModeracionRh,
  Empleado,
  MetricasMonitorRh,
  SolicitudRh,
  TicketOmisionRh,
} from "@/types/rh";

/**
 * Datos estáticos del directorio.
 * TODO(supabase): reemplazar por la consulta a `colaboradores`.
 */
export const EMPLEADOS_MOCK: Empleado[] = [
  {
    id: "emp-001",
    nombre: "Jose Real",
    correo: "jreal@aif.com",
    puesto: "Mejora Continua",
    departamento: "Operaciones",
    empresa: "AIF",
    rol: "colaborador",
    estatus: "activo",
  },
  {
    id: "emp-002",
    nombre: "Mayra Avila",
    correo: "mavila@aif.com",
    puesto: "Directora de Operaciones",
    departamento: "Operaciones",
    empresa: "AIF",
    rol: "rh",
    estatus: "activo",
  },
  {
    id: "emp-003",
    nombre: "Ana Sofía",
    correo: "asofia@royal.com",
    puesto: "Analista C",
    departamento: "Operaciones",
    empresa: "ROYAL",
    rol: "colaborador",
    estatus: "activo",
  },
];

/**
 * Solicitudes pre-aprobadas por Jefatura pendientes de firma de RH.
 * TODO(supabase): consultar `solicitudes` con estatus pre-aprobado.
 */
export const BANDEJA_SOLICITUDES_RH_MOCK: SolicitudRh[] = [
  {
    id: "sol-rh-001",
    colaborador_id: "emp-002",
    colaborador_nombre: "Mayra Avila",
    tipo_label: "PERMISO SIN GOCE",
    resumen: "Ausencia por motivos personales (2 días)",
    dias: 2,
    fecha_inicio: "2026-10-19",
    fecha_fin: "2026-10-20",
    estatus_firma: "pendiente_rh",
  },
  {
    id: "sol-rh-002",
    colaborador_id: "emp-001",
    colaborador_nombre: "Jose Real",
    tipo_label: "PERMISO CON GOCE",
    resumen: "Ausencia por motivos personales (0 días)",
    dias: 0,
    fecha_inicio: "2026-10-22",
    fecha_fin: "2026-10-22",
    estatus_firma: "pendiente_rh",
  },
];

/**
 * Métricas acumuladas del monitor de asistencia RH.
 */
export const METRICAS_MONITOR_RH_MOCK: MetricasMonitorRh = {
  retardos_quincena: 14,
  faltas_por_retardos: 4,
};

/**
 * Alertas visuales de marcajes registrados fuera de geocerca.
 */
export const ALERTAS_GEOLOCALIZACION_RH_MOCK: AlertaGeolocalizacionRh[] = [
  {
    id: "alerta-geo-001",
    colaborador_id: "emp-003",
    colaborador_nombre: "Ana Sofía",
    exceso_metros: 3200,
    fecha_hora: "2023-10-25 a las 09:05 AM",
    zona_mas_cercana: "Home Office - Ana Sofía (Roma Norte)",
    lat: 19.435,
    lng: -99.1412,
    nota_alerta:
      "ALERTA: Registro realizado a 3.2 km fuera del perímetro permitido.",
    archivada: false,
  },
];

/**
 * Tickets enviados por colaboradores por omisión de marcaje o justificación.
 */
export const TICKETS_OMISION_RH_MOCK: TicketOmisionRh[] = [
  {
    id: "tkt-rh-001",
    folio: "TICKET #T1024",
    colaborador_id: "emp-001",
    colaborador_nombre: "Jose Real",
    fecha_afectada: "2023-10-19",
    horario_propuesto: "Entrada 08:50 AM / Salida 06:00 PM",
    motivo_colaborador:
      "Falla en conexión de internet al terminar la jornada, no se pudo enviar el marcado de salida.",
    estatus: "pendiente",
  },
  {
    id: "tkt-rh-002",
    folio: "TICKET #T1025",
    colaborador_id: "emp-003",
    colaborador_nombre: "Ana Sofía",
    fecha_afectada: "2023-10-25",
    horario_propuesto: "Entrada - / Salida -",
    motivo_colaborador:
      "Tuve que desplazarme a una sucursal bancaria en Centro Histórico para trámite corporativo urgente.",
    estatus: "pendiente",
  },
];

/**
 * Comentarios del Muro Corporativo pendientes de moderación por RH.
 * TODO(supabase): consultar `muro_interacciones` con estatus pendiente.
 */
export const COMENTARIOS_MODERACION_RH_MOCK: ComentarioModeracionRh[] = [
  {
    id: "com-mod-001",
    colaborador_id: "emp-001",
    colaborador_nombre: "Jose Real",
    publicacion_id: "pub-001",
    publicacion_titulo: "Actualización de Políticas de Home Office Q4",
    comentario:
      "¿A partir de qué fecha entra en vigor el nuevo radio de validación para las geocercas autorizadas?",
    fecha: "2026-10-16 · 10:15 AM",
    estatus: "pendiente",
  },
];



