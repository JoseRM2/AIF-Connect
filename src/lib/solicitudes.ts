import type { TipoSolicitud } from "@/types/solicitudes";

export const TIPO_SOLICITUD_LABELS: Record<TipoSolicitud, string> = {
  vacaciones: "Vacaciones",
  vacaciones_extraordinarias: "Vacaciones Extraordinarias",
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

const REGEX_MARCA_EXTRAORDINARIAS = /\[VACACIONES EXTRAORDINARIAS\]\s*/i;

/**
 * Detecta si una solicitud corresponde a Vacaciones Extraordinarias
 * (ya sea por su `tipo_solicitud` o por la marca `[VACACIONES EXTRAORDINARIAS]` en `motivo`).
 */
export function esSolicitudVacacionesExtraordinarias(
  motivo?: string | null,
  tipoSolicitud?: string | null
): boolean {
  const tipoNorm = (tipoSolicitud ?? "").trim().toLowerCase();
  if (tipoNorm.includes("extraordinaria")) return true;
  return REGEX_MARCA_EXTRAORDINARIAS.test(motivo ?? "");
}

/**
 * Incorpora o elimina la marca `[VACACIONES EXTRAORDINARIAS]` en el motivo para
 * identificarla en flujos de Jefatura y RH sin requerir cambios en el ENUM de PostgreSQL.
 */
export function formatearMotivoVacacionesExtraordinarias(
  motivoRaw: string | null | undefined,
  esExtraordinaria: boolean
): string | null {
  const limpio = (motivoRaw ?? "")
    .replace(REGEX_MARCA_EXTRAORDINARIAS, "")
    .trim();
  if (!esExtraordinaria) {
    return limpio || null;
  }
  return limpio
    ? `[VACACIONES EXTRAORDINARIAS] ${limpio}`
    : "[VACACIONES EXTRAORDINARIAS]";
}

/**
 * Detecta si el motivo de una solicitud tiene la marca de medio día (`[MEDIO DÍA]` o `0.5 día`).
 */
export function esSolicitudMedioDia(
  motivo: string | null | undefined,
  diasSolicitados?: number | null
): boolean {
  if (typeof diasSolicitados === "number" && diasSolicitados === 0.5) {
    return true;
  }
  const limpio = (motivo ?? "").trim().toUpperCase();
  return (
    limpio.includes("[MEDIO DÍA") ||
    limpio.includes("[MEDIO DIA") ||
    limpio.includes("(0.5 DÍA") ||
    limpio.includes("(0.5 DIA")
  );
}

/**
 * Construye el texto de motivo incorporando la etiqueta `[MEDIO DÍA · MATUTINO/VESPERTINO (0.5 DÍAS)]`
 * cuando el usuario o RH selecciona medio día.
 */
export function formatearMotivoConMedioDia(
  motivoRaw: string | null | undefined,
  esMedioDia: boolean,
  jornadaMedioDia: "Matutino" | "Vespertino" = "Matutino"
): string | null {
  const limpio = (motivoRaw ?? "")
    .replace(/\[MEDIO D[ÍI]A[^\]]*\]\s*/gi, "")
    .trim();

  if (!esMedioDia) {
    return limpio || null;
  }

  const prefijo = `[MEDIO DÍA · ${jornadaMedioDia.toUpperCase()} (0.5 DÍAS)]`;
  return limpio ? `${prefijo} ${limpio}` : prefijo;
}

const REGEX_MARCA_CANCELACION =
  /\[CANCELADA POR COLABORADOR:\s*([^\]]+)\]/i;

/**
 * Determina si una solicitud fue cancelada por el colaborador (ya sea por `estatus === 'Cancelado'`
 * o por la marca `[CANCELADA POR COLABORADOR: ...]` en `motivo`).
 */
export function esSolicitudCancelada(
  estatus: string | null | undefined,
  motivo?: string | null
): boolean {
  const estNorm = (estatus ?? "").trim().toLowerCase();
  if (estNorm === "cancelado" || estNorm === "cancelada") {
    return true;
  }
  return REGEX_MARCA_CANCELACION.test(motivo ?? "");
}

/**
 * Separa el motivo original de la solicitud y el motivo de cancelación registrado por el usuario.
 */
export function extraerMotivoCancelacion(motivo: string | null | undefined): {
  motivoOriginal: string;
  motivoCancelacion: string | null;
} {
  const raw = (motivo ?? "").trim();
  if (!raw) {
    return { motivoOriginal: "", motivoCancelacion: null };
  }
  const match = raw.match(REGEX_MARCA_CANCELACION);
  if (!match) {
    return { motivoOriginal: raw, motivoCancelacion: null };
  }
  const motivoCancelacion = (match[1] ?? "").trim() || null;
  const motivoOriginal = raw
    .replace(REGEX_MARCA_CANCELACION, "")
    .replace(/\s*\|\s*$/, "")
    .trim();

  return { motivoOriginal, motivoCancelacion };
}

/**
 * Combina el motivo original con el motivo de cancelación del colaborador en formato trazable.
 */
export function anexarMotivoCancelacion(
  motivoOriginal: string | null | undefined,
  motivoCancelacion: string
): string {
  const baseLimpia = extraerMotivoCancelacion(motivoOriginal).motivoOriginal;
  const cancelLimpio = motivoCancelacion
    .replace(/[\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
  const marca = `[CANCELADA POR COLABORADOR: ${cancelLimpio}]`;
  return baseLimpia ? `${baseLimpia} | ${marca}` : marca;
}

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

export const DIAS_ANTICIPACION_VACACIONES = 10;

/**
 * Valida que la solicitud de vacaciones se realice con al menos 10 días naturales de anticipación
 * respecto a la fecha actual (zona horaria `America/Mexico_City`), salvo que RH haya activado
 * el interruptor de excepción.
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

  // Obtener la fecha actual en zona horaria America/Mexico_City
  const ahora = new Date();
  let anioHoy = ahora.getFullYear();
  let mesHoy = ahora.getMonth() + 1;
  let diaHoy = ahora.getDate();

  try {
    const partes = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Mexico_City",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(ahora);
    const y = Number(partes.find((p) => p.type === "year")?.value ?? 0);
    const m = Number(partes.find((p) => p.type === "month")?.value ?? 0);
    const d = Number(partes.find((p) => p.type === "day")?.value ?? 0);
    if (y && m && d) {
      anioHoy = y;
      mesHoy = m;
      diaHoy = d;
    }
  } catch {
    // Respaldo con fecha local del navegador/servidor
  }

  const hoyUtc = Date.UTC(anioHoy, mesHoy - 1, diaHoy);
  const MS_POR_DIA = 86_400_000;
  const diasAnticipacion = Math.round((inicioUtc - hoyUtc) / MS_POR_DIA);

  if (diasAnticipacion < DIAS_ANTICIPACION_VACACIONES) {
    return "La solicitud debe realizarse con 10 días de anticipación";
  }

  return null;
}

/**
 * Calcula los días de vacaciones correspondientes conforme al Art. 76 de la LFT
 * (Reforma "Vacaciones Dignas"):
 * - Menos de 1 año cumplido (`anios < 1`): 0 días
 * - 1 año: 12 días
 * - 2 años: 14 días
 * - 3 años: 16 días
 * - 4 años: 18 días
 * - 5 años: 20 días
 * - 6 a 10 años: 22 días, aumentando +2 días por cada bloque adicional de 5 años.
 */
export function calcularDiasVacacionesPorAniosLft(
  aniosCumplidos: number
): number {
  if (!Number.isFinite(aniosCumplidos)) return 0;
  const anios = Math.floor(aniosCumplidos);
  if (anios < 1) return 0;
  if (anios === 1) return 12;
  if (anios === 2) return 14;
  if (anios === 3) return 16;
  if (anios === 4) return 18;
  if (anios === 5) return 20;
  return 22 + Math.floor((anios - 6) / 5) * 2;
}

/**
 * Calcula los años completos de antigüedad a partir de `fecha_ingreso` (`YYYY-MM-DD`)
 * usando la fecha actual en zona horaria `America/Mexico_City` (o `fechaReferencia` si se indica).
 */
export function calcularAniosAntiguedadCumplidos(
  fechaIngresoIso?: string | null,
  fechaReferencia?: Date
): number {
  if (!fechaIngresoIso) return 0;
  const soloFecha = fechaIngresoIso.trim().slice(0, 10);
  const [anioIng, mesIng, diaIng] = soloFecha.split("-").map(Number);
  if (!anioIng || !mesIng || !diaIng) return 0;

  const ref = fechaReferencia ?? new Date();
  let anioRef = ref.getFullYear();
  let mesRef = ref.getMonth() + 1;
  let diaRef = ref.getDate();

  if (!fechaReferencia) {
    try {
      const partes = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Mexico_City",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(ref);
      const y = Number(partes.find((p) => p.type === "year")?.value ?? 0);
      const m = Number(partes.find((p) => p.type === "month")?.value ?? 0);
      const d = Number(partes.find((p) => p.type === "day")?.value ?? 0);
      if (y && m && d) {
        anioRef = y;
        mesRef = m;
        diaRef = d;
      }
    } catch {
      // Respaldo con fecha local del entorno
    }
  }

  let anios = anioRef - anioIng;
  if (mesRef < mesIng || (mesRef === mesIng && diaRef < diaIng)) {
    anios -= 1;
  }

  return Math.max(0, anios);
}

export interface CalculoVacacionesExtraordinarias {
  diasTranscurridos: number;
  diasAnioEnCurso: number;
  factorDiario: number;
  proporcionalBruto: number;
  limiteDisponibleMediosDias: number;
}

/**
 * Calcula el límite máximo de Vacaciones Extraordinarias (adelanto proporcional)
 * redondeado hacia abajo a medios días (0.5):
 * - Días transcurridos (inclusive) desde `fecha_ingreso` (o desde el último aniversario laboral).
 * - Factor diario = (días LFT correspondientes al año laboral en curso) / 365.
 * - Proporcional bruto = factor diario × días transcurridos.
 * - Límite disponible = floor((proporcional + min(0, saldoActual) - diasPendientes) * 2) / 2.
 */
export function calcularVacacionesProporcionalesExtraordinarias(
  fechaIngresoIso?: string | null,
  saldoActual = 0,
  diasPendientes = 0,
  fechaReferencia?: Date
): CalculoVacacionesExtraordinarias {
  if (!fechaIngresoIso) {
    return {
      diasTranscurridos: 0,
      diasAnioEnCurso: 12,
      factorDiario: 12 / 365,
      proporcionalBruto: 0,
      limiteDisponibleMediosDias: 0,
    };
  }

  const soloFecha = fechaIngresoIso.trim().slice(0, 10);
  const [anioIng, mesIng, diaIng] = soloFecha.split("-").map(Number);
  if (!anioIng || !mesIng || !diaIng) {
    return {
      diasTranscurridos: 0,
      diasAnioEnCurso: 12,
      factorDiario: 12 / 365,
      proporcionalBruto: 0,
      limiteDisponibleMediosDias: 0,
    };
  }

  const ref = fechaReferencia ?? new Date();
  let anioRef = ref.getFullYear();
  let mesRef = ref.getMonth() + 1;
  let diaRef = ref.getDate();

  if (!fechaReferencia) {
    try {
      const partes = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Mexico_City",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(ref);
      const y = Number(partes.find((p) => p.type === "year")?.value ?? 0);
      const m = Number(partes.find((p) => p.type === "month")?.value ?? 0);
      const d = Number(partes.find((p) => p.type === "day")?.value ?? 0);
      if (y && m && d) {
        anioRef = y;
        mesRef = m;
        diaRef = d;
      }
    } catch {
      // Respaldo con fecha local
    }
  }

  const aniosCumplidos = calcularAniosAntiguedadCumplidos(
    fechaIngresoIso,
    fechaReferencia
  );
  const diasAnioEnCurso = calcularDiasVacacionesPorAniosLft(
    aniosCumplidos + 1
  );
  const factorDiario = diasAnioEnCurso / 365;

  const anioInicioPeriodo = anioIng + aniosCumplidos;
  const ultimoDiaMesInicio = new Date(
    Date.UTC(anioInicioPeriodo, mesIng, 0)
  ).getUTCDate();
  const diaInicioPeriodo = Math.min(diaIng, ultimoDiaMesInicio);

  const inicioPeriodoUtc = Date.UTC(
    anioInicioPeriodo,
    mesIng - 1,
    diaInicioPeriodo
  );
  const hoyUtc = Date.UTC(anioRef, mesRef - 1, diaRef);

  const MS_POR_DIA = 86_400_000;
  const diasTranscurridos =
    hoyUtc >= inicioPeriodoUtc
      ? Math.round((hoyUtc - inicioPeriodoUtc) / MS_POR_DIA) + 1
      : 0;

  const proporcionalBruto = factorDiario * diasTranscurridos;
  const saldoNegativoPrevio = Math.min(0, Number(saldoActual) || 0);
  const pendientes = Math.max(0, Number(diasPendientes) || 0);
  const limiteNeto = proporcionalBruto + saldoNegativoPrevio - pendientes;
  const limiteDisponibleMediosDias = Math.max(
    0,
    Math.floor(limiteNeto * 2) / 2
  );

  return {
    diasTranscurridos,
    diasAnioEnCurso,
    factorDiario,
    proporcionalBruto,
    limiteDisponibleMediosDias,
  };
}
