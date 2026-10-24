import type { createClient } from "@/lib/supabase/client";

type SupabaseBrowserClient = ReturnType<typeof createClient>;

export const BUCKET_EXPEDIENTES = "expedientes";
export const TAMANO_MAXIMO_MB = 5;
export const TAMANO_MAXIMO_BYTES = TAMANO_MAXIMO_MB * 1024 * 1024;
export const ACCEPT_EXPEDIENTES = ".pdf,.jpg,.jpeg,.png";

const EXTENSIONES_PERMITIDAS = ["pdf", "jpg", "jpeg", "png"] as const;
const MIME_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"];

export type TipoDocumentoExpediente =
  | "comprobante_estudios"
  | "carta_recomendacion";

const COLUMNA_URL = {
  comprobante_estudios: "comprobante_estudios_url",
  carta_recomendacion: "carta_recomendacion_url",
} as const;

const ETIQUETA_DOCUMENTO: Record<TipoDocumentoExpediente, string> = {
  comprobante_estudios: "Comprobante de estudios",
  carta_recomendacion: "Carta de recomendación",
};

function obtenerExtension(nombre: string): string {
  const partes = nombre.toLowerCase().split(".");
  return partes.length > 1 ? (partes[partes.length - 1] ?? "") : "";
}

/** Devuelve un mensaje de error, o null si el archivo es válido. */
export function validarArchivoExpediente(archivo: File): string | null {
  const extension = obtenerExtension(archivo.name);
  const extensionValida = (EXTENSIONES_PERMITIDAS as readonly string[]).includes(
    extension
  );
  const mimeValido = !archivo.type || MIME_PERMITIDOS.includes(archivo.type);

  if (!extensionValida || !mimeValido) {
    return "Formato no permitido. Usa PDF, JPG, JPEG o PNG.";
  }
  if (archivo.size > TAMANO_MAXIMO_BYTES) {
    return `El archivo excede el máximo de ${TAMANO_MAXIMO_MB} MB.`;
  }
  if (archivo.size === 0) {
    return "El archivo está vacío.";
  }
  return null;
}

/**
 * Sube un documento a `expedientes/{colaboradorId}/{tipo}_{timestamp}.{ext}`
 * y devuelve su URL pública.
 */
async function subirDocumento(
  supabase: SupabaseBrowserClient,
  colaboradorId: string,
  tipo: TipoDocumentoExpediente,
  archivo: File
): Promise<string> {
  const extension = obtenerExtension(archivo.name) || "pdf";
  const ruta = `${colaboradorId}/${tipo}_${Date.now()}.${extension}`;

  const { error } = await supabase.storage
    .from(BUCKET_EXPEDIENTES)
    .upload(ruta, archivo, {
      contentType: archivo.type || undefined,
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    throw new Error(error.message);
  }

  const { data } = supabase.storage.from(BUCKET_EXPEDIENTES).getPublicUrl(ruta);
  return data.publicUrl;
}

export interface ResultadoSubidaExpediente {
  /** Columnas de URL listas para un UPDATE en `colaboradores` (solo las subidas con éxito). */
  urls: {
    comprobante_estudios_url?: string;
    carta_recomendacion_url?: string;
  };
  /** Mensajes de error por documento que falló. */
  errores: string[];
}

/** Sube en paralelo los documentos recibidos (los nulos se omiten). */
export async function subirDocumentosExpediente(
  supabase: SupabaseBrowserClient,
  colaboradorId: string,
  archivos: Partial<Record<TipoDocumentoExpediente, File | null>>
): Promise<ResultadoSubidaExpediente> {
  const pendientes = (
    Object.entries(archivos) as [TipoDocumentoExpediente, File | null][]
  ).filter((par): par is [TipoDocumentoExpediente, File] => par[1] !== null);

  const resultados = await Promise.allSettled(
    pendientes.map(([tipo, archivo]) =>
      subirDocumento(supabase, colaboradorId, tipo, archivo)
    )
  );

  const salida: ResultadoSubidaExpediente = { urls: {}, errores: [] };

  resultados.forEach((resultado, i) => {
    const tipo = pendientes[i][0];
    if (resultado.status === "fulfilled") {
      salida.urls[COLUMNA_URL[tipo]] = resultado.value;
    } else {
      const motivo =
        resultado.reason instanceof Error
          ? resultado.reason.message
          : "error desconocido";
      salida.errores.push(`${ETIQUETA_DOCUMENTO[tipo]}: ${motivo}`);
    }
  });

  return salida;
}
