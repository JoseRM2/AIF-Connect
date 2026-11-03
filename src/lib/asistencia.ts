import type { HorarioLaboral } from "@/types/asistencia";

const pad = (n: number) => String(n).padStart(2, "0");

const aMinutos = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** "18:05" -> "06:05 PM". */
export function formatHora12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${pad(h12)}:${pad(m)} ${h >= 12 ? "PM" : "AM"}`;
}

/** Hora límite de entrada (entrada + tolerancia) en formato "HH:mm". */
export function horaLimite(horario: HorarioLaboral): string {
  const total = aMinutos(horario.entrada) + horario.tolerancia_min;
  return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
}

export interface EstatusEntrada {
  estatus: "a_tiempo" | "retardo";
  /** Minutos transcurridos desde la hora de entrada (0 si aún no llega). */
  minutos_retardo: number;
}

/** Calcula el estatus que tendría una entrada registrada en `ahora`. */
export function calcularEstatusEntrada(
  ahora: Date,
  horario: HorarioLaboral,
): EstatusEntrada {
  const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();
  const minutos = Math.max(0, minutosAhora - aMinutos(horario.entrada));
  return {
    estatus: minutos > horario.tolerancia_min ? "retardo" : "a_tiempo",
    minutos_retardo: minutos,
  };
}

export function formatReloj(fecha: Date): string {
  return `${pad(fecha.getHours())}:${pad(fecha.getMinutes())}:${pad(fecha.getSeconds())}`;
}

const FECHA_LARGA = new Intl.DateTimeFormat("es-MX", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** "sábado, 10 de octubre de 2026" (se muestra en mayúsculas vía CSS). */
export function formatFechaLarga(fecha: Date): string {
  return FECHA_LARGA.format(fecha);
}

/**
 * Devuelve la fecha local en formato `YYYY-MM-DD` para la zona horaria
 * de México (`America/Mexico_City`), garantizando consistencia entre SSR y Cliente.
 */
export function obtenerFechaHoyLocal(fecha: Date = new Date()): string {
  return fecha.toLocaleDateString("en-CA", {
    timeZone: "America/Mexico_City",
  });
}

export const LIMITE_DESCANSO_MINUTOS = 60;
export const HORA_ENTRADA_REGULAR_DEFAULT = "09:00";
export const TOLERANCIA_ENTRADA_DEFAULT = 15;
export const HORA_SALIDA_REGULAR_DEFAULT = "18:00";

/**
 * Convierte una cadena de hora ("HH:mm", "HH:mm:ss" o ISO timestamp) a minutos desde medianoche.
 */
export function parsearHoraAMinutos(
  valor: string | null | undefined
): number | null {
  if (!valor) return null;
  const limpio = valor.trim();
  const match = limpio.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match) {
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (Number.isFinite(h) && Number.isFinite(m)) {
      return h * 60 + m;
    }
  }
  const fecha = new Date(limpio);
  if (!Number.isNaN(fecha.getTime())) {
    return fecha.getHours() * 60 + fecha.getMinutes();
  }
  return null;
}

/**
 * Calcula los minutos transcurridos entre `horaInicio` y `horaFin` de descanso.
 */
export function calcularMinutosDescanso(
  horaInicio: string | null | undefined,
  horaFin: string | null | undefined
): number | null {
  const inicioMin = parsearHoraAMinutos(horaInicio);
  const finMin = parsearHoraAMinutos(horaFin);
  if (inicioMin === null || finMin === null) return null;
  const diff = finMin - inicioMin;
  return diff >= 0 ? diff : null;
}

export interface IndicadoresVisualesHorario {
  /** Minutos totales de descanso (null si no hay inicio y fin). */
  minutosDescanso: number | null;
  /** true si el descanso supera los 60 minutos permitidos. */
  descansoExcedido: boolean;
  /** Minutos por encima del límite de 60 min (solo informativo visual). */
  minutosExcesoDescanso: number;
  /** true si el descanso está en curso (tiene inicio pero no fin). */
  descansoEnCurso: boolean;
  /** true si ingresó después de la hora límite establecida o su estatus es Retardo. */
  esRetardo: boolean;
  /** Minutos posteriores a la hora de entrada regular (solo informativo visual). */
  minutosRetardo: number;
  /** true si la hora_salida es posterior al horario regular de salida (Tiempo Adicional). */
  esSalidaTardia: boolean;
  /** Minutos posteriores a la hora de salida regular (solo informativo visual). */
  minutosTiempoAdicional: number;
  /** Alias visual de minutosTiempoAdicional. */
  minutosAdicionales: number;
  /** Etiquetas visuales legibles para tablas y exportación Excel. */
  etiquetasVisuales: string[];
}

/**
 * Evalúa de forma exclusivamente visual las banderas de horario de un registro de asistencia:
 * - Descanso Excedido (> 60 min)
 * - Retardo (comparando hora_entrada con horario establecido + tolerancia)
 * - Salida Tardía / Tiempo Adicional (comparando hora_salida con horario regular de salida)
 * No ejecuta ningún cálculo algorítmico de deducciones de nómina ni bonificaciones.
 */
export function evaluarIndicadoresVisualesAsistencia(params: {
  horaEntrada?: string | null;
  hora_entrada?: string | null;
  horaInicioDescanso?: string | null;
  hora_inicio_descanso?: string | null;
  horaFinDescanso?: string | null;
  hora_fin_descanso?: string | null;
  horaSalida?: string | null;
  hora_salida?: string | null;
  estatus?: string | null;
  horaEntradaRegular?: string;
  toleranciaMin?: number;
  horaSalidaRegular?: string;
  limiteDescansoMin?: number;
}): IndicadoresVisualesHorario {
  const entradaRegMin =
    parsearHoraAMinutos(
      params.horaEntradaRegular ?? HORA_ENTRADA_REGULAR_DEFAULT
    ) ?? 9 * 60;
  const tolerancia = params.toleranciaMin ?? TOLERANCIA_ENTRADA_DEFAULT;
  const salidaRegMin =
    parsearHoraAMinutos(
      params.horaSalidaRegular ?? HORA_SALIDA_REGULAR_DEFAULT
    ) ?? 18 * 60;
  const limiteDescanso = params.limiteDescansoMin ?? LIMITE_DESCANSO_MINUTOS;

  const horaEntradaVal = params.horaEntrada ?? params.hora_entrada;
  const horaInicioDescVal =
    params.horaInicioDescanso ?? params.hora_inicio_descanso;
  const horaFinDescVal = params.horaFinDescanso ?? params.hora_fin_descanso;
  const horaSalidaVal = params.horaSalida ?? params.hora_salida;

  const entradaRealMin = parsearHoraAMinutos(horaEntradaVal);
  const salidaRealMin = parsearHoraAMinutos(horaSalidaVal);
  const minutosDescanso = calcularMinutosDescanso(
    horaInicioDescVal,
    horaFinDescVal
  );
  const descansoEnCurso = Boolean(horaInicioDescVal) && !horaFinDescVal;

  const descansoExcedido =
    minutosDescanso !== null && minutosDescanso > limiteDescanso;
  const minutosExcesoDescanso = descansoExcedido
    ? minutosDescanso - limiteDescanso
    : 0;

  const estatusLower = (params.estatus ?? "").trim().toLowerCase();
  const esJustificado = estatusLower.includes("justificad");
  const retardoPorHora =
    !esJustificado &&
    entradaRealMin !== null &&
    entradaRealMin > entradaRegMin + tolerancia;
  const esRetardo = estatusLower.includes("retardo") || retardoPorHora;
  const minutosRetardo =
    esRetardo && entradaRealMin !== null && entradaRealMin > entradaRegMin
      ? entradaRealMin - entradaRegMin
      : 0;

  const esSalidaTardia =
    salidaRealMin !== null && salidaRealMin > salidaRegMin;
  const minutosTiempoAdicional =
    esSalidaTardia && salidaRealMin !== null
      ? salidaRealMin - salidaRegMin
      : 0;

  const etiquetasVisuales: string[] = [];
  if (esRetardo) {
    etiquetasVisuales.push(
      minutosRetardo > 0 ? `Retardo (+${minutosRetardo} min)` : "Retardo"
    );
  }
  if (descansoExcedido && minutosDescanso !== null) {
    etiquetasVisuales.push(
      `Descanso Excedido (${minutosDescanso} min / +${minutosExcesoDescanso} min)`
    );
  } else if (descansoEnCurso) {
    etiquetasVisuales.push("En Descanso");
  }
  if (esSalidaTardia) {
    etiquetasVisuales.push(
      minutosTiempoAdicional > 0
        ? `Tiempo Adicional (+${minutosTiempoAdicional} min)`
        : "Tiempo Adicional"
    );
  }

  return {
    minutosDescanso,
    descansoExcedido,
    minutosExcesoDescanso,
    descansoEnCurso,
    esRetardo,
    minutosRetardo,
    esSalidaTardia,
    minutosTiempoAdicional,
    minutosAdicionales: minutosTiempoAdicional,
    etiquetasVisuales,
  };
}
