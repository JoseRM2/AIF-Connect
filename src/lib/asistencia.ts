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
