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

/**
 * Calcula para un año y mes (1-12) el conjunto de días del mes que corresponden
 * a los 5 días hábiles (Lunes a Viernes) previos a cada quincena (día 15 y día 30 / fin de mes).
 */
export function obtenerDiasHabilesPreviosQuincena(
  anio: number,
  mes1a12: number
): Set<number> {
  const diasBloqueados = new Set<number>();
  const ultimoDiaMes = new Date(Date.UTC(anio, mes1a12, 0)).getUTCDate();
  const diaSegundaQuincena = Math.min(30, ultimoDiaMes);

  const cortesQuincena = [15, diaSegundaQuincena];

  for (const diaCorte of cortesQuincena) {
    let habilesContados = 0;
    let diaCursor = diaCorte;

    while (diaCursor >= 1 && habilesContados < 5) {
      const diaSemana = new Date(
        Date.UTC(anio, mes1a12 - 1, diaCursor)
      ).getUTCDay(); // 0 = Dom, 1..5 = Lun..Vie, 6 = Sáb

      if (diaSemana >= 1 && diaSemana <= 5) {
        diasBloqueados.add(diaCursor);
        habilesContados += 1;
      }
      diaCursor -= 1;
    }
  }

  return diasBloqueados;
}

export function esDiaEnSemanaNomina(
  dia: number,
  anio = new Date().getFullYear(),
  mes1a12 = new Date().getMonth() + 1
): boolean {
  return obtenerDiasHabilesPreviosQuincena(anio, mes1a12).has(dia);
}

/**
 * Valida la regla de restricción en los 5 días hábiles antes de quincena para solicitudes de vacaciones:
 * - El colaborador SÍ puede crear solicitudes en cualquier fecha (por ejemplo, el 10 de noviembre
 *   puede solicitar vacaciones para el 16 al 22 de noviembre o para el 19 de noviembre).
 * - Lo que NO se permite (salvo excepción activa de RH) es que los DÍAS SOLICITADOS de vacaciones
 *   (`fechaInicio` a `fechaFin`) incluyan alguno de los 5 días hábiles previos a quincena (día 15 y día 30/fin de mes).
 */
export function validarRestriccionSemanaNomina(
  fechaInicio: string,
  fechaFin: string,
  excepcionRhActiva: boolean
): string | null {
  if (excepcionRhActiva) return null;
  if (!fechaInicio || !fechaFin) return null;

  const [y1, m1, d1] = fechaInicio.slice(0, 10).split("-").map(Number);
  const [y2, m2, d2] = fechaFin.slice(0, 10).split("-").map(Number);
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return null;

  const inicioUtc = Date.UTC(y1, m1 - 1, d1);
  const finUtc = Date.UTC(y2, m2 - 1, d2);
  if (finUtc < inicioUtc) return null;

  const mapasPorMes = new Map<string, Set<number>>();
  const diasEnConflicto: string[] = [];
  const MS_POR_DIA = 86_400_000;

  for (let ms = inicioUtc; ms <= finUtc; ms += MS_POR_DIA) {
    const fechaDia = new Date(ms);
    const anioDia = fechaDia.getUTCFullYear();
    const mesDia = fechaDia.getUTCMonth() + 1;
    const numDia = fechaDia.getUTCDate();
    const claveMes = `${anioDia}-${mesDia}`;

    if (!mapasPorMes.has(claveMes)) {
      mapasPorMes.set(
        claveMes,
        obtenerDiasHabilesPreviosQuincena(anioDia, mesDia)
      );
    }

    const restringidosMes = mapasPorMes.get(claveMes)!;
    if (restringidosMes.has(numDia)) {
      const nombreMes = MESES_NOMBRES[mesDia - 1] ?? "";
      diasEnConflicto.push(`${numDia} de ${nombreMes}`);
    }
  }

  if (diasEnConflicto.length > 0) {
    const listaDias = diasEnConflicto.slice(0, 5).join(", ");
    return `Restricción de nómina: No es posible solicitar días de vacaciones dentro de los 5 días hábiles previos a quincena (días en conflicto: ${listaDias}). Puedes solicitar fechas posteriores o, para casos extraordinarios, Recursos Humanos puede habilitar el interruptor de excepción.`;
  }

  return null;
}
