/**
 * Tipos del módulo Muro Corporativo conectados a Supabase (`muro_publicaciones` y `muro_interacciones`).
 */

export type TipoReaccionMuro = "Like" | "Celebrar" | "Interesante" | "Apoyo";

export type TipoInteraccionMuro =
  | TipoReaccionMuro
  | "Comentario"
  | "Acuse_Recibo";

export type EstatusModeracionMuro = "Pendiente" | "Aprobado" | "Rechazado";

export interface AutorPublicacionMuro {
  nombre_completo: string;
}

export interface InteraccionMuroRow {
  id: string;
  publicacion_id: string;
  colaborador_id: string;
  tipo_interaccion: TipoInteraccionMuro;
  contenido_comentario: string | null;
  estatus_moderacion: EstatusModeracionMuro;
  created_at?: string | null;
  colaboradores?: AutorPublicacionMuro | null;
}

export interface PublicacionMuro {
  id: string;
  autor_id?: string | null;
  titulo: string;
  contenido: string;
  requiere_acuse: boolean;
  created_at?: string | null;
  fecha_publicacion?: string | null;
  categoria?: string | null;
  archivo_url?: string | null;
  imagen_url?: string | null;
  colaboradores?: AutorPublicacionMuro | null;
}
