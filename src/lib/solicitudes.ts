import type { TipoSolicitud } from "@/types/solicitudes";

export const TIPO_SOLICITUD_LABELS: Record<TipoSolicitud, string> = {
  vacaciones: "Vacaciones",
  vacaciones_pagadas: "Vacaciones Pagadas",
  permiso_con_goce: "Permiso con goce de sueldo",
  permiso_sin_goce: "Permiso sin goce de sueldo",
  incapacidad: "Incapacidad",
};

export const TIPOS_SOLICITUD: TipoSolicitud[] = [
  "vacaciones",
  "vacaciones_pagadas",
  "permiso_con_goce",
  "permiso_sin_goce",
  "incapacidad",
];

export const MESES_NOMBRES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

export function esDiaEnSemanaNomina(dia: number): boolean {
  return (dia >= 9 && dia <= 15) || (dia >= 23 && dia <= 30);
}

/**
 * Valida la regla de límite en semana de nómina para solicitudes de vacaciones:
 * - No es posible solicitar vacaciones en la misma semana de nómina (del 9 al 15 y del 23 al 30)
 *   cuando se solicitan para el MISMO MES en curso (cierres de nómina días 15 y 30).
 * - Si `excepcionRhActiva` es `true`, Recursos Humanos ha habilitado el interruptor
 *   para casos extraordinarios y se permite la solicitud.
 * - Devuelve `null` si la solicitud es válida, o el mensaje de bloqueo si aplica la restricción.
 */
export function validarRestriccionSemanaNomina(
  fechaInicio: string,
  fechaFin: string,
  excepcionRhActiva: boolean,
  fechaReferencia: Date = new Date()
): string | null {
  if (excepcionRhActiva) return null;
  if (!fechaInicio || !fechaFin) return null;

  const [y1, m1, d1] = fechaInicio.split("-").map(Number);
  const [y2, m2, d2] = fechaFin.split("-").map(Number);
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return null;

  const inicioUtc = Date.UTC(y1, m1 - 1, d1);
  const finUtc = Date.UTC(y2, m2 - 1, d2);
  if (finUtc < inicioUtc) return null;

  const anioActual = fechaReferencia.getFullYear();
  const mesActual = fechaReferencia.getMonth() + 1;
  const diaHoy = fechaReferencia.getDate();
  const nombreMesActual = MESES_NOMBRES[mesActual - 1] ?? "este mes";

  const MS_POR_DIA = 86_400_000;
  let solicitaParaMismoMes = false;
  let incluyeDiasNominaDelMismoMes = false;

  for (let ms = inicioUtc; ms <= finUtc; ms += MS_POR_DIA) {
    const fechaDia = new Date(ms);
    const anioDia = fechaDia.getUTCFullYear();
    const mesDia = fechaDia.getUTCMonth() + 1;
    const numDia = fechaDia.getUTCDate();

    if (anioDia === anioActual && mesDia === mesActual) {
      solicitaParaMismoMes = true;
      if (esDiaEnSemanaNomina(numDia)) {
        incluyeDiasNominaDelMismoMes = true;
      }
    }
  }

  // Solo aplica cuando las vacaciones se solicitan para el mismo mes en curso
  if (!solicitaParaMismoMes) {
    return null;
  }

  const hoyEnSemanaNomina = esDiaEnSemanaNomina(diaHoy);

  if (hoyEnSemanaNomina || incluyeDiasNominaDelMismoMes) {
    return `Restricción de semana de nómina: Del 9 al 15 y del 23 al 30 del mismo mes (${nombreMesActual} ${anioActual}) no es posible solicitar vacaciones por corte de nómina (días 15 y 30). Para casos extraordinarios, Recursos Humanos puede habilitar el interruptor de excepción.`;
  }

  return null;
}
