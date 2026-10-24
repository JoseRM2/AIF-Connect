import type { ZonaGeocerca } from "@/types/asistencia";
import type { ColaboradorAsignado, Zona } from "@/types/zonas";

/** Proyecta una zona del catálogo al formato de `colaboradores.zonas_geocerca`. */
export function zonaAGeocerca(zona: Zona): ZonaGeocerca {
  return {
    id: zona.id,
    nombre: zona.titulo,
    tipo: zona.tipo,
    lat: zona.lat,
    lng: zona.lng,
    radio_m: zona.radio_m,
  };
}

/** Colaboradores únicos con al menos una zona asignada. */
export function colaboradoresDeZonas(zonas: Zona[]): ColaboradorAsignado[] {
  const porId = new Map<string, ColaboradorAsignado>();
  for (const { colaborador } of zonas) {
    if (colaborador) porId.set(colaborador.id, colaborador);
  }
  return Array.from(porId.values());
}

export function formatCoordenada(
  valor: number | string | null | undefined,
  decimales = 4
): string {
  const num = Number.parseFloat(String(valor ?? ""));
  if (Number.isNaN(num) || !Number.isFinite(num)) {
    return (0).toFixed(decimales);
  }
  return num.toFixed(decimales);
}
