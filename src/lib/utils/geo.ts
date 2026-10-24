import type { ZonaGeocerca } from "@/types/asistencia";

const EARTH_RADIUS_METERS = 6_371_000;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Calcula la distancia exacta en metros entre dos coordenadas geográficas
 * utilizando la Fórmula de Haversine.
 */
export function calcularDistancia(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

/**
 * Alias de compatibilidad para `calcularDistancia`.
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  return calcularDistancia(lat1, lon1, lat2, lon2);
}

export interface GeofenceZoneCandidate {
  id?: string;
  nombre?: string;
  titulo?: string;
  direccion?: string;
  tipo?: "oficina" | "home_office";
  estatus?: "activa" | "inactiva";
  empresa?: "AIF" | "ROYAL";
  lat?: number | string;
  latitud?: number | string;
  lng?: number | string;
  lon?: number | string;
  longitud?: number | string;
  radio_m?: number | string;
  radio_metros?: number | string;
  radius?: number | string;
  notas?: string | null;
}

function parseNumero(valor: unknown): number | null {
  if (typeof valor === "number" && Number.isFinite(valor)) return valor;
  if (typeof valor === "string" && valor.trim() !== "") {
    const parsed = Number(valor);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * Normaliza un arreglo (o un objeto único) JSONB de `colaboradores.zonas_geocerca` a `ZonaGeocerca[]`.
 * Soporta tanto `{ nombre, lat, lng, radio_m }` como `{ nombre, latitud, longitud, radio_metros }`.
 */
export function normalizeZones(
  zonesInput: unknown,
  defaultRadiusMeters = 100
): ZonaGeocerca[] {
  const rawList: unknown[] = Array.isArray(zonesInput)
    ? zonesInput
    : zonesInput && typeof zonesInput === "object"
    ? [zonesInput]
    : [];

  if (rawList.length === 0) return [];

  const result: ZonaGeocerca[] = [];

  rawList.forEach((raw, index) => {
    if (!raw || typeof raw !== "object") return;
    const candidate = raw as GeofenceZoneCandidate;

    if (candidate.estatus === "inactiva") return;

    const lat =
      parseNumero(candidate.lat) ?? parseNumero(candidate.latitud);
    const lng =
      parseNumero(candidate.lng) ??
      parseNumero(candidate.lon) ??
      parseNumero(candidate.longitud);

    if (lat === null || lng === null) return;

    const radio =
      parseNumero(candidate.radio_m) ??
      parseNumero(candidate.radio_metros) ??
      parseNumero(candidate.radius) ??
      defaultRadiusMeters;

    const nombre =
      (typeof candidate.nombre === "string" && candidate.nombre.trim()) ||
      (typeof candidate.titulo === "string" && candidate.titulo.trim()) ||
      `Zona Autorizada ${index + 1}`;

    result.push({
      id: candidate.id || `zona-${index + 1}`,
      nombre,
      tipo: candidate.tipo === "oficina" ? "oficina" : "home_office",
      lat,
      lng,
      radio_m: radio > 0 ? radio : defaultRadiusMeters,
    });
  });

  return result;
}

/**
 * Determina si las coordenadas del usuario (`userLat`, `userLon`) se encuentran
 * dentro de alguna de las geocercas permitidas en `zonesArray` (`zonas_geocerca` JSONB).
 */
export function isWithinGeofence(
  userLat: number,
  userLon: number,
  zonesArray: unknown,
  radiusInMeters = 100
): boolean {
  const zones = normalizeZones(zonesArray, radiusInMeters);
  if (zones.length === 0) return false;

  return zones.some((zone) => {
    const allowedRadius = zone.radio_m > 0 ? zone.radio_m : radiusInMeters;
    const distance = calcularDistancia(userLat, userLon, zone.lat, zone.lng);
    return distance <= allowedRadius;
  });
}

export interface GeofenceEvaluation {
  within: boolean;
  closestZone: ZonaGeocerca | null;
  distanceMeters: number | null;
}

/**
 * Evalúa la posición del usuario frente a sus geocercas y devuelve además
 * la zona más cercana y su distancia en metros para alimentar la UI.
 */
export function evaluateGeofence(
  userLat: number,
  userLon: number,
  zonesArray: unknown,
  radiusInMeters = 100
): GeofenceEvaluation {
  const zones = normalizeZones(zonesArray, radiusInMeters);
  let closestZone: ZonaGeocerca | null = null;
  let minDistance: number | null = null;
  let matchedZone: ZonaGeocerca | null = null;
  let matchedDistance: number | null = null;

  for (const zone of zones) {
    const allowedRadius = zone.radio_m > 0 ? zone.radio_m : radiusInMeters;
    const d = calcularDistancia(userLat, userLon, zone.lat, zone.lng);

    if (minDistance === null || d < minDistance) {
      minDistance = d;
      closestZone = zone;
    }

    if (
      d <= allowedRadius &&
      (matchedDistance === null || d < matchedDistance)
    ) {
      matchedDistance = d;
      matchedZone = zone;
    }
  }

  if (matchedZone && matchedDistance !== null) {
    return {
      within: true,
      closestZone: matchedZone,
      distanceMeters: matchedDistance,
    };
  }

  return {
    within: false,
    closestZone,
    distanceMeters: minDistance,
  };
}
