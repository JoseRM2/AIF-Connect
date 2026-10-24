import type { TipoZona } from "@/types/asistencia";

/**
 * Tipos del módulo de zonas autorizadas.
 *
 * `Zona` es la entidad completa de catálogo (futura tabla de zonas). Para el
 * marcaje de asistencia se proyecta a `ZonaGeocerca`
 * (colaboradores.zonas_geocerca) con `zonaAGeocerca` en `@/lib/zonas`.
 */

export type { TipoZona };

export type EstatusZona = "activa" | "inactiva";

export type EmpresaZona = "AIF" | "ROYAL";

export interface ColaboradorAsignado {
  id: string;
  nombre: string;
  puesto: string;
}

export interface Zona {
  id: string;
  titulo: string;
  /** Alias compatible para el nombre de la zona (`titulo`). */
  nombre?: string;
  direccion: string;
  lat: number;
  lng: number;
  /** Radio de tolerancia en metros. */
  radio_m: number;
  /** "oficina" = sede corporativa; "home_office" = asignada a un colaborador. */
  tipo: TipoZona;
  estatus: EstatusZona;
  empresa: EmpresaZona;
  /** Solo para zonas de tipo "home_office". */
  colaborador: ColaboradorAsignado | null;
  /** Notas u observaciones de RH. */
  notas?: string | null;
}
