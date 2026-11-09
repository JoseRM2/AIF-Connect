import type { createClient } from "@/lib/supabase/client";

type SupabaseBrowserClient = ReturnType<typeof createClient>;

export const BUCKET_EXPEDIENTES = "expedientes";
export const TAMANO_MAXIMO_MB = 5;
export const TAMANO_MAXIMO_BYTES = TAMANO_MAXIMO_MB * 1024 * 1024;
export const ACCEPT_EXPEDIENTES = ".pdf,.jpg,.jpeg,.png";

const EXTENSIONES_PERMITIDAS = ["pdf", "jpg", "jpeg", "png"] as const;
const MIME_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"];

export type TipoDocumentoExpediente =
  | "ine"
  | "curp"
  | "cdsf"
  | "comprobante_domicilio"
  | "nss"
  | "datos_bancarios"
  | "comprobante_estudios"
  | "carta_recomendacion"
  | "contrato"
  | "convenio"
  | "aviso_privacidad"
  | "perfil_descriptivo_puesto"
  | "reglamento_interior_trabajo"
  | "politica_uso_equipos"
  | "responsiva"
  | "pagare"
  | "uso_imagen_auditorias"
  | "codigo_etica"
  | "aceptacion_home_office"
  | "solicitud_home_office";

export type CategoriaDocumentoExpediente =
  | "Identificación y Personal"
  | "Contratación y Normatividad"
  | "Equipos, Responsivas y Home Office";

export interface DefinicionDocumentoExpediente {
  tipo: TipoDocumentoExpediente;
  etiqueta: string;
  categoria: CategoriaDocumentoExpediente;
}

export const CATALOGO_DOCUMENTOS_EXPEDIENTE: readonly DefinicionDocumentoExpediente[] =
  [
    // 1. Identificación y Personal
    {
      tipo: "ine",
      etiqueta: "INE",
      categoria: "Identificación y Personal",
    },
    {
      tipo: "curp",
      etiqueta: "CURP",
      categoria: "Identificación y Personal",
    },
    {
      tipo: "cdsf",
      etiqueta: "CDSF (Constancia de Situación Fiscal)",
      categoria: "Identificación y Personal",
    },
    {
      tipo: "comprobante_domicilio",
      etiqueta: "Comprobante de domicilio",
      categoria: "Identificación y Personal",
    },
    {
      tipo: "nss",
      etiqueta: "NSS",
      categoria: "Identificación y Personal",
    },
    {
      tipo: "datos_bancarios",
      etiqueta: "Datos bancarios",
      categoria: "Identificación y Personal",
    },
    {
      tipo: "comprobante_estudios",
      etiqueta: "Comprobante de estudios",
      categoria: "Identificación y Personal",
    },
    {
      tipo: "carta_recomendacion",
      etiqueta: "Carta de recomendación",
      categoria: "Identificación y Personal",
    },

    // 2. Contratación y Normatividad
    {
      tipo: "contrato",
      etiqueta: "Contrato",
      categoria: "Contratación y Normatividad",
    },
    {
      tipo: "convenio",
      etiqueta: "Convenio",
      categoria: "Contratación y Normatividad",
    },
    {
      tipo: "aviso_privacidad",
      etiqueta: "Aviso de privacidad",
      categoria: "Contratación y Normatividad",
    },
    {
      tipo: "perfil_descriptivo_puesto",
      etiqueta: "Perfil y Descriptivo del puesto",
      categoria: "Contratación y Normatividad",
    },
    {
      tipo: "reglamento_interior_trabajo",
      etiqueta: "Reglamento interior de trabajo",
      categoria: "Contratación y Normatividad",
    },
    {
      tipo: "codigo_etica",
      etiqueta: "Código de ética",
      categoria: "Contratación y Normatividad",
    },

    // 3. Equipos, Responsivas y Home Office
    {
      tipo: "politica_uso_equipos",
      etiqueta: "Política del uso adecuado de equipos",
      categoria: "Equipos, Responsivas y Home Office",
    },
    {
      tipo: "responsiva",
      etiqueta: "Responsiva",
      categoria: "Equipos, Responsivas y Home Office",
    },
    {
      tipo: "pagare",
      etiqueta: "Pagaré",
      categoria: "Equipos, Responsivas y Home Office",
    },
    {
      tipo: "uso_imagen_auditorias",
      etiqueta: "Uso de imagen y Auditorías a dispositivos tecnológicos",
      categoria: "Equipos, Responsivas y Home Office",
    },
    {
      tipo: "aceptacion_home_office",
      etiqueta: "Aceptación de Home Office",
      categoria: "Equipos, Responsivas y Home Office",
    },
    {
      tipo: "solicitud_home_office",
      etiqueta: "Solicitud de Home Office",
      categoria: "Equipos, Responsivas y Home Office",
    },
  ] as const;

export const ETIQUETA_DOCUMENTO: Record<TipoDocumentoExpediente, string> =
  CATALOGO_DOCUMENTOS_EXPEDIENTE.reduce(
    (acc, doc) => {
      acc[doc.tipo] = doc.etiqueta;
      return acc;
    },
    {} as Record<TipoDocumentoExpediente, string>
  );

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
 * Inspecciona la firma binaria real (Magic Bytes) de los primeros 12 bytes del archivo
 * para impedir que archivos ejecutables, HTML o SVG maliciosos se disfracen renombrando su extensión.
 */
export async function validarMagicBytesArchivo(
  archivo: File,
  permitirPdf = true
): Promise<string | null> {
  try {
    const buffer = await archivo.slice(0, 12).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes.length < 4) {
      return "El archivo no contiene una cabecera válida.";
    }

    // %PDF- (25 50 44 46 2D)
    const esPdf =
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46;

    // JPEG (FF D8 FF)
    const esJpeg =
      bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

    // PNG (89 50 4E 47 0D 0A 1A 0A)
    const esPng =
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47;

    // WebP (RIFF .... WEBP)
    const esWebp =
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50;

    if (permitirPdf && esPdf) return null;
    if (esJpeg || esPng || esWebp) return null;

    return permitirPdf
      ? "El contenido real del archivo no corresponde a un PDF, JPG o PNG válido."
      : "El contenido real del archivo no corresponde a una imagen JPG, PNG o WebP válida.";
  } catch {
    return "No fue posible verificar la integridad del archivo.";
  }
}

/**
 * Sube un documento a `expedientes/{colaboradorId}/{tipo}_{timestamp}.{ext}`,
 * obtiene su URL pública y registra el UPSERT en `public.expedientes_documentos`.
 */
async function subirYRegistrarDocumento(
  supabase: SupabaseBrowserClient,
  colaboradorId: string,
  tipo: TipoDocumentoExpediente,
  archivo: File
): Promise<string> {
  const errBasico = validarArchivoExpediente(archivo);
  if (errBasico) {
    throw new Error(errBasico);
  }
  const errMagic = await validarMagicBytesArchivo(archivo, true);
  if (errMagic) {
    throw new Error(errMagic);
  }

  const extension = obtenerExtension(archivo.name) || "pdf";
  const colaboradorIdSeguro = colaboradorId.replace(/[^a-zA-Z0-9_-]/g, "");
  const ruta = `${colaboradorIdSeguro}/${tipo}_${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_EXPEDIENTES)
    .upload(ruta, archivo, {
      contentType: archivo.type || undefined,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data } = supabase.storage.from(BUCKET_EXPEDIENTES).getPublicUrl(ruta);
  const publicUrl = data.publicUrl;

  const { error: upsertError } = await supabase
    .from("expedientes_documentos")
    .upsert(
      {
        colaborador_id: colaboradorId,
        tipo_documento: tipo,
        archivo_url: publicUrl,
        nombre_archivo: archivo.name,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "colaborador_id,tipo_documento" }
    );

  if (upsertError) {
    throw new Error(upsertError.message);
  }

  return publicUrl;
}

export interface ResultadoSubidaExpediente {
  /** Columnas legadas en `colaboradores` por retrocompatibilidad. */
  urls: {
    comprobante_estudios_url?: string;
    carta_recomendacion_url?: string;
  };
  /** Mapa completo de URLs públicas subidas por tipo de documento. */
  urlsPorTipo: Partial<Record<TipoDocumentoExpediente, string>>;
  /** Mensajes de error por documento que falló. */
  errores: string[];
}

/** Sube en paralelo los documentos recibidos y los persiste en `expedientes_documentos`. */
export async function subirDocumentosExpediente(
  supabase: SupabaseBrowserClient,
  colaboradorId: string,
  archivos: Partial<Record<TipoDocumentoExpediente, File | null>>
): Promise<ResultadoSubidaExpediente> {
  const pendientes = (
    Object.entries(archivos) as [TipoDocumentoExpediente, File | null][]
  ).filter((par): par is [TipoDocumentoExpediente, File] => Boolean(par[1]));

  const resultados = await Promise.allSettled(
    pendientes.map(([tipo, archivo]) =>
      subirYRegistrarDocumento(supabase, colaboradorId, tipo, archivo)
    )
  );

  const salida: ResultadoSubidaExpediente = {
    urls: {},
    urlsPorTipo: {},
    errores: [],
  };

  resultados.forEach((resultado, i) => {
    const tipo = pendientes[i][0];
    if (resultado.status === "fulfilled") {
      salida.urlsPorTipo[tipo] = resultado.value;
      if (tipo === "comprobante_estudios") {
        salida.urls.comprobante_estudios_url = resultado.value;
      } else if (tipo === "carta_recomendacion") {
        salida.urls.carta_recomendacion_url = resultado.value;
      }
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

/**
 * Extrae y sanea la ruta relativa dentro del bucket `expedientes`
 * previniendo Path Traversal (`..`) y soportando tanto rutas relativas
 * como URLs completas (`public` o `sign`).
 */
export function extraerRutaInternaExpediente(
  rutaOUrl: string | null | undefined
): string | null {
  const limpio = (rutaOUrl ?? "").trim();
  if (!limpio) return null;

  const marcadorPublic = `/storage/v1/object/public/${BUCKET_EXPEDIENTES}/`;
  const marcadorSign = `/storage/v1/object/sign/${BUCKET_EXPEDIENTES}/`;
  let rutaArchivo = limpio;

  if (limpio.includes(marcadorPublic)) {
    const idx = limpio.indexOf(marcadorPublic);
    rutaArchivo = decodeURIComponent(
      limpio.slice(idx + marcadorPublic.length).split("?")[0] ?? ""
    );
  } else if (limpio.includes(marcadorSign)) {
    const idx = limpio.indexOf(marcadorSign);
    rutaArchivo = decodeURIComponent(
      limpio.slice(idx + marcadorSign.length).split("?")[0] ?? ""
    );
  } else if (/^https?:\/\//i.test(limpio)) {
    return null;
  } else {
    rutaArchivo = limpio.split("?")[0]?.replace(/^\/+/, "") ?? "";
  }

  // Prevenir ataques de Path Traversal (eliminar segmentos '..' o '.')
  const segmentosSeguros = rutaArchivo
    .split("/")
    .map((s) => s.trim())
    .filter((s) => Boolean(s) && s !== "." && s !== "..");

  return segmentosSeguros.length > 0 ? segmentosSeguros.join("/") : null;
}

/**
 * Consulta todos los documentos registrados en `public.expedientes_documentos`
 * para un colaborador, genera URLs firmadas temporales (vigencia de 1 hora = 3600s)
 * para máxima privacidad en Storage y respalda con `getPublicUrl` si aplica.
 */
export async function obtenerMapaDocumentosExpediente(
  supabase: SupabaseBrowserClient,
  colaboradorId: string,
  fallbackLegado?: {
    comprobante_estudios_url?: string | null;
    carta_recomendacion_url?: string | null;
  }
): Promise<Partial<Record<TipoDocumentoExpediente, string>>> {
  const mapa: Partial<Record<TipoDocumentoExpediente, string>> = {};
  const rutasPorTipo = new Map<TipoDocumentoExpediente, string>();

  if (fallbackLegado?.comprobante_estudios_url) {
    const url = obtenerUrlPublicaExpediente(
      supabase,
      fallbackLegado.comprobante_estudios_url
    );
    if (url) mapa.comprobante_estudios = url;
    const rutaInterna = extraerRutaInternaExpediente(
      fallbackLegado.comprobante_estudios_url
    );
    if (rutaInterna) rutasPorTipo.set("comprobante_estudios", rutaInterna);
  }
  if (fallbackLegado?.carta_recomendacion_url) {
    const url = obtenerUrlPublicaExpediente(
      supabase,
      fallbackLegado.carta_recomendacion_url
    );
    if (url) mapa.carta_recomendacion = url;
    const rutaInterna = extraerRutaInternaExpediente(
      fallbackLegado.carta_recomendacion_url
    );
    if (rutaInterna) rutasPorTipo.set("carta_recomendacion", rutaInterna);
  }

  if (!colaboradorId) return mapa;

  const { data } = await supabase
    .from("expedientes_documentos")
    .select("tipo_documento, archivo_url")
    .eq("colaborador_id", colaboradorId);

  for (const fila of data ?? []) {
    const tipo = fila.tipo_documento as TipoDocumentoExpediente;
    const urlPublica = obtenerUrlPublicaExpediente(supabase, fila.archivo_url);
    if (tipo && urlPublica) {
      mapa[tipo] = urlPublica;
    }
    const rutaInterna = extraerRutaInternaExpediente(fila.archivo_url);
    if (tipo && rutaInterna) {
      rutasPorTipo.set(tipo, rutaInterna);
    }
  }

  // Emitir URLs firmadas temporales (3600s) en lote para compatibilidad con bucket privado o público
  if (rutasPorTipo.size > 0) {
    try {
      const entradas = Array.from(rutasPorTipo.entries());
      const listaRutas = entradas.map(([, ruta]) => ruta);
      const { data: firmadas } = await supabase.storage
        .from(BUCKET_EXPEDIENTES)
        .createSignedUrls(listaRutas, 3600);

      if (Array.isArray(firmadas)) {
        firmadas.forEach((item, idx) => {
          const tipoDoc = entradas[idx]?.[0];
          if (tipoDoc && item?.signedUrl) {
            mapa[tipoDoc] = item.signedUrl;
          }
        });
      }
    } catch {
      // Si el cliente no puede firmar en ese instante, conserva el fallback de mapa[tipo]
    }
  }

  return mapa;
}

/**
 * Extrae la ruta interna del bucket `expedientes` y obtiene su URL
 * utilizando `supabase.storage.from('expedientes').getPublicUrl(ruta_del_archivo)`.
 * Devuelve `null` si la columna está vacía (`null`, `undefined` o string vacío).
 */
export function obtenerUrlPublicaExpediente(
  supabase: SupabaseBrowserClient,
  rutaOUrl: string | null | undefined
): string | null {
  const limpio = (rutaOUrl ?? "").trim();
  if (!limpio) return null;

  const rutaArchivo = extraerRutaInternaExpediente(limpio);
  if (!rutaArchivo) {
    return /^https?:\/\//i.test(limpio) ? limpio : null;
  }

  const { data } = supabase.storage
    .from(BUCKET_EXPEDIENTES)
    .getPublicUrl(rutaArchivo);

  return data?.publicUrl?.trim() ? data.publicUrl : null;
}
