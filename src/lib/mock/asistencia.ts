import type {
  Asistencia,
  Colaborador,
  HorarioLaboral,
  MetricasAsistencia,
  UbicacionMarcaje,
  UbicacionSimulada,
  ZonaGeocerca,
} from "@/types/asistencia";

/**
 * Datos estáticos del módulo de asistencia.
 * TODO(supabase): reemplazar por consultas a `colaboradores` y `asistencias`.
 */

const ZONA_HOME: ZonaGeocerca = {
  id: "zona-home",
  nombre: "Home Office - Jose Real (Del Valle)",
  tipo: "home_office",
  lat: 19.3927,
  lng: -99.165,
  radio_m: 100,
};

const ZONA_OFICINA: ZonaGeocerca = {
  id: "zona-oficina",
  nombre: "Oficina Corporativa",
  tipo: "oficina",
  lat: 19.4326,
  lng: -99.1332,
  radio_m: 150,
};

export const COLABORADOR_MOCK: Colaborador = {
  id: "colab-001",
  nombre: "Jose Real",
  zonas_geocerca: [ZONA_HOME, ZONA_OFICINA],
};

export const HORARIO_MOCK: HorarioLaboral = {
  entrada: "09:00",
  tolerancia_min: 15,
};

export const UBICACIONES_SIMULADAS: UbicacionSimulada[] = [
  {
    id: "sim-home",
    label: "Home Office",
    punto: { lat: ZONA_HOME.lat, lng: ZONA_HOME.lng },
  },
  {
    id: "sim-oficina",
    label: "Oficina Corporativa",
    punto: { lat: ZONA_OFICINA.lat, lng: ZONA_OFICINA.lng },
  },
  {
    id: "sim-cafeteria",
    label: "Cafetería (fuera de zona)",
    punto: { lat: 19.3965, lng: -99.159 },
  },
];

export const METRICAS_MOCK: MetricasAsistencia = {
  retardos_quincena: 1,
  limite_retardos: 3,
  faltas_injustificadas: 1,
  alertas_fuera_de_rango: 0,
  omisiones: 1,
};

const marcajeEnZona = (
  zona: ZonaGeocerca,
  capturadoEn: string,
): UbicacionMarcaje => ({
  lat: zona.lat,
  lng: zona.lng,
  precision_m: 12,
  capturado_en: capturadoEn,
  fuente: "gps",
  dentro_de_zona: true,
  zona_id: zona.id,
  zona_nombre: zona.nombre,
  distancia_m: 0,
});

export const HISTORIAL_MOCK: Asistencia[] = [
  {
    id: "asist-003",
    colaborador_id: COLABORADOR_MOCK.id,
    fecha: "2023-10-25",
    hora_entrada: "08:55",
    hora_salida: "18:05",
    estatus: "a_tiempo",
    ubicacion_entrada: marcajeEnZona(ZONA_HOME, "2023-10-25T14:55:00.000Z"),
    ubicacion_salida: marcajeEnZona(ZONA_HOME, "2023-10-26T00:05:00.000Z"),
  },
  {
    id: "asist-002",
    colaborador_id: COLABORADOR_MOCK.id,
    fecha: "2023-10-24",
    hora_entrada: "09:32",
    hora_salida: "18:10",
    estatus: "retardo",
    ubicacion_entrada: marcajeEnZona(ZONA_OFICINA, "2023-10-24T15:32:00.000Z"),
    ubicacion_salida: marcajeEnZona(ZONA_OFICINA, "2023-10-25T00:10:00.000Z"),
  },
  {
    id: "asist-001",
    colaborador_id: COLABORADOR_MOCK.id,
    fecha: "2023-10-23",
    hora_entrada: null,
    hora_salida: null,
    estatus: "falta",
    ubicacion_entrada: null,
    ubicacion_salida: null,
  },
];
