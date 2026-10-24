/**
 * Tipos del módulo de asistencia.
 *
 * Diseñados para mapear 1:1 con Supabase:
 *  - colaboradores.zonas_geocerca  (JSONB) -> ZonaGeocerca[]
 *  - asistencias.ubicacion_entrada (JSONB) -> UbicacionMarcaje | null
 *  - asistencias.ubicacion_salida  (JSONB) -> UbicacionMarcaje | null
 */

export type TipoZona = "oficina" | "home_office";

export interface GeoPoint {
  lat: number;
  lng: number;
  /** Precisión reportada por el navegador, en metros. */
  precision_m?: number;
}

/** Elemento del JSONB `colaboradores.zonas_geocerca`. */
export interface ZonaGeocerca {
  id: string;
  nombre: string;
  tipo: TipoZona;
  lat: number;
  lng: number;
  /** Radio permitido en metros. */
  radio_m: number;
}

export interface Colaborador {
  id: string;
  nombre: string;
  zonas_geocerca: ZonaGeocerca[];
}

export type FuenteUbicacion = "gps" | "simulada";

/** Contenido del JSONB `asistencias.ubicacion_entrada` / `ubicacion_salida`. */
export interface UbicacionMarcaje extends GeoPoint {
  /** ISO 8601. */
  capturado_en: string;
  fuente: FuenteUbicacion;
  dentro_de_zona: boolean;
  zona_id: string | null;
  zona_nombre: string | null;
  distancia_m: number | null;
}

export type EstatusAsistencia =
  | "a_tiempo"
  | "retardo"
  | "falta"
  | "justificado";

/** Fila de la tabla `asistencias`. Horas en formato "HH:mm" (columna `time`). */
export interface Asistencia {
  id: string;
  colaborador_id: string;
  /** "YYYY-MM-DD". */
  fecha: string;
  hora_entrada: string | null;
  hora_salida: string | null;
  estatus: EstatusAsistencia;
  ubicacion_entrada: UbicacionMarcaje | null;
  ubicacion_salida: UbicacionMarcaje | null;
}

export interface HorarioLaboral {
  /** "HH:mm". */
  entrada: string;
  tolerancia_min: number;
}

export interface MetricasAsistencia {
  retardos_quincena: number;
  limite_retardos: number;
  faltas_injustificadas: number;
  alertas_fuera_de_rango: number;
  omisiones: number;
}

/** Ubicación predefinida para el simulador de GPS. */
export interface UbicacionSimulada {
  id: string;
  label: string;
  punto: GeoPoint;
}
