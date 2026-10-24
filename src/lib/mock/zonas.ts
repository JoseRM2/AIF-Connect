import type { GeoPoint } from "@/types/asistencia";
import type { ColaboradorAsignado, Zona } from "@/types/zonas";

/**
 * Datos estáticos del módulo de zonas.
 * TODO(supabase): reemplazar por la consulta del catálogo de zonas.
 */

const OFICINA_AIF: Zona = {
  id: "zona-aif-insurgentes",
  titulo: "Oficina Corporativa AIF (Insurgentes)",
  direccion: "Av. Insurgentes Sur 1458, Col. Actipan, Benito Juárez, CDMX",
  lat: 19.3621,
  lng: -99.1804,
  radio_m: 150,
  tipo: "oficina",
  estatus: "activa",
  empresa: "AIF",
  colaborador: null,
};

const HOME_JOSE: Zona = {
  id: "zona-home-jose",
  titulo: "Home Office - Jose Real (Del Valle)",
  direccion: "Calle Adolfo Prieto 1210, Col. Del Valle Centro, Benito Juárez, CDMX",
  lat: 19.3927,
  lng: -99.165,
  radio_m: 100,
  tipo: "home_office",
  estatus: "activa",
  empresa: "AIF",
  colaborador: {
    id: "colab-001",
    nombre: "Jose Real",
    puesto: "Analista Fiscal",
  },
};

const OFICINA_ROYAL: Zona = {
  id: "zona-royal-santa-fe",
  titulo: "Oficina Royal Santa Fe",
  direccion: "Av. Santa Fe 495, Col. Cruz Manca, Cuajimalpa, CDMX",
  lat: 19.3595,
  lng: -99.261,
  radio_m: 150,
  tipo: "oficina",
  estatus: "activa",
  empresa: "ROYAL",
  colaborador: null,
};

export const ZONAS_MOCK: Zona[] = [OFICINA_AIF, HOME_JOSE, OFICINA_ROYAL];

export interface PuntoPrueba {
  id: string;
  label: string;
  punto: GeoPoint;
  variante: "home" | "sede" | "fuera";
}

/** Ubicaciones rápidas del simulador de cobertura. */
export const PUNTOS_PRUEBA: PuntoPrueba[] = [
  {
    id: "prueba-home",
    label: "Col. Del Valle (Home Office Jose)",
    punto: { lat: HOME_JOSE.lat, lng: HOME_JOSE.lng },
    variante: "home",
  },
  {
    id: "prueba-oficina",
    label: "Oficina Matriz AIF",
    punto: { lat: OFICINA_AIF.lat, lng: OFICINA_AIF.lng },
    variante: "sede",
  },
  {
    id: "prueba-cafe",
    label: "Café en Centro Histórico (Fuera de Rango)",
    punto: { lat: 19.4326, lng: -99.1332 },
    variante: "fuera",
  },
];

export interface SugerenciaUbicacion {
  id: string;
  label: string;
  direccion: string;
  punto: GeoPoint;
}

/** Colaboradores asignables a un home office. */
export const COLABORADORES_MOCK: ColaboradorAsignado[] = [
  { id: "colab-001", nombre: "Jose Real", puesto: "Analista Fiscal" },
  { id: "colab-002", nombre: "Ana Sofía", puesto: "Recursos Humanos" },
  { id: "colab-003", nombre: "Carlos Mendoza", puesto: "Auditor" },
];

/** Sugerencias rápidas del formulario de nueva zona. */
export const SUGERENCIAS_UBICACION: SugerenciaUbicacion[] = [
  {
    id: "sug-aif",
    label: "Oficina Matriz AIF",
    direccion: OFICINA_AIF.direccion,
    punto: { lat: OFICINA_AIF.lat, lng: OFICINA_AIF.lng },
  },
  {
    id: "sug-royal",
    label: "Oficina Sucursal ROYAL",
    direccion: OFICINA_ROYAL.direccion,
    punto: { lat: OFICINA_ROYAL.lat, lng: OFICINA_ROYAL.lng },
  },
  {
    id: "sug-del-valle-sur",
    label: "Col. Del Valle Sur",
    direccion: "Col. Del Valle Sur, Benito Juárez, CDMX",
    punto: { lat: 19.3789, lng: -99.1672 },
  },
  {
    id: "sug-roma-norte",
    label: "Col. Roma Norte",
    direccion: "Col. Roma Norte, Cuauhtémoc, CDMX",
    punto: { lat: 19.4195, lng: -99.1617 },
  },
  {
    id: "sug-condesa",
    label: "Col. Condesa",
    direccion: "Col. Condesa, Cuauhtémoc, CDMX",
    punto: { lat: 19.4115, lng: -99.173 },
  },
];
