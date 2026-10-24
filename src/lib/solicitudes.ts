import type { TipoSolicitud } from "@/types/solicitudes";

export const TIPO_SOLICITUD_LABELS: Record<TipoSolicitud, string> = {
  vacaciones: "Vacaciones",
  permiso_con_goce: "Permiso con goce",
  permiso_sin_goce: "Permiso sin goce",
  incapacidad: "Incapacidad",
};

export const TIPOS_SOLICITUD = Object.keys(
  TIPO_SOLICITUD_LABELS,
) as TipoSolicitud[];
