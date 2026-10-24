import type { GeoPoint, ZonaGeocerca } from "@/types/asistencia";

const EARTH_RADIUS_M = 6_371_000;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Calcula la distancia exacta en metros entre dos coordenadas geográficas
 * utilizando la Fórmula de Haversine.
 */
export function calcularDistancia(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lon2 - lon1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Distancia en metros entre dos puntos (fórmula de Haversine). */
export function distanciaMetros(a: GeoPoint, b: GeoPoint): number {
  return calcularDistancia(a.lat, a.lng, b.lat, b.lng);
}

export interface EvaluacionZona {
  /** Zona más cercana (o null si el colaborador no tiene zonas). */
  zona: ZonaGeocerca | null;
  distancia_m: number | null;
  dentro: boolean;
}

/** Evalúa un punto contra las zonas del colaborador (`zonas_geocerca`). */
export function evaluarUbicacion(
  punto: GeoPoint,
  zonas: ZonaGeocerca[],
): EvaluacionZona {
  let zona: ZonaGeocerca | null = null;
  let distancia: number | null = null;

  for (const candidata of zonas) {
    const d = distanciaMetros(punto, candidata);
    if (distancia === null || d < distancia) {
      zona = candidata;
      distancia = d;
    }
  }

  return {
    zona,
    distancia_m: distancia,
    dentro: zona !== null && distancia !== null && distancia <= zona.radio_m,
  };
}

/** Envuelve `navigator.geolocation.getCurrentPosition` en una Promise. */
export function obtenerPosicionNavegador(): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Tu navegador no soporta geolocalización."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve({
          lat: coords.latitude,
          lng: coords.longitude,
          precision_m: coords.accuracy,
        }),
      (error) =>
        reject(
          new Error(
            error.code === error.PERMISSION_DENIED
              ? "Permiso de ubicación denegado."
              : "No fue posible obtener tu ubicación.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  });
}
