import { calcularDistancia } from "@/lib/utils/geo";
import type { GeoPoint, ZonaGeocerca } from "@/types/asistencia";

export { calcularDistancia };

/** Distancia en metros entre dos puntos (fórmula de Haversine). */
export function distanciaMetros(a: GeoPoint, b: GeoPoint): number {
  return calcularDistancia(a.lat, a.lng, b.lat, b.lng);
}

export interface EvaluacionZona {
  /** Zona coincidente dentro de rango, o la más cercana si ninguna coincide. */
  zona: ZonaGeocerca | null;
  distancia_m: number | null;
  dentro: boolean;
}

/** Evalúa un punto contra las zonas del colaborador (`zonas_geocerca`). */
export function evaluarUbicacion(
  punto: GeoPoint,
  zonas: ZonaGeocerca[],
): EvaluacionZona {
  let zonaMasCercana: ZonaGeocerca | null = null;
  let distanciaMinima: number | null = null;
  let zonaEnRango: ZonaGeocerca | null = null;
  let distanciaEnRango: number | null = null;

  for (const candidata of zonas) {
    const d = distanciaMetros(punto, candidata);
    if (distanciaMinima === null || d < distanciaMinima) {
      zonaMasCercana = candidata;
      distanciaMinima = d;
    }
    if (
      d <= candidata.radio_m &&
      (distanciaEnRango === null || d < distanciaEnRango)
    ) {
      zonaEnRango = candidata;
      distanciaEnRango = d;
    }
  }

  if (zonaEnRango && distanciaEnRango !== null) {
    return {
      zona: zonaEnRango,
      distancia_m: distanciaEnRango,
      dentro: true,
    };
  }

  return {
    zona: zonaMasCercana,
    distancia_m: distanciaMinima,
    dentro: false,
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
