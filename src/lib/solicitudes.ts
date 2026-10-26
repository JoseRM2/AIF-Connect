import type { TipoSolicitud } from "@/types/solicitudes";

export const TIPO_SOLICITUD_LABELS: Record<TipoSolicitud, string> = {
  vacaciones: "Vacaciones",
  permiso_con_goce: "Permiso con goce de sueldo",
  permiso_sin_goce: "Permiso sin goce de sueldo",
  incapacidad: "Incapacidad",
};

export const TIPOS_SOLICITUD: TipoSolicitud[] = [
  "vacaciones",
  "permiso_con_goce",
  "permiso_sin_goce",
  "incapacidad",
];
