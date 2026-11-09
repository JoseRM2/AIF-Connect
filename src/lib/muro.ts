const MESES = [
  "ENE",
  "FEB",
  "MAR",
  "ABR",
  "MAY",
  "JUN",
  "JUL",
  "AGO",
  "SEP",
  "OCT",
  "NOV",
  "DIC",
] as const;

/**
 * Extrae día ("17") y mes abreviado ("OCT") a partir de un timestamp ISO (`created_at`)
 * o una cadena "YYYY-MM-DD".
 */
export function partesFecha(isoOrDate: string | null | undefined): {
  dia: string;
  mes: string;
} {
  if (!isoOrDate) {
    const ahora = new Date();
    return {
      dia: String(ahora.getDate()).padStart(2, "0"),
      mes: MESES[ahora.getMonth()] ?? "",
    };
  }

  const soloFecha = isoOrDate.slice(0, 10);
  const partes = soloFecha.split("-").map(Number);
  const mesNum = partes[1];
  const diaNum = partes[2];

  if (!Number.isNaN(diaNum) && !Number.isNaN(mesNum) && mesNum >= 1 && mesNum <= 12) {
    return {
      dia: String(diaNum).padStart(2, "0"),
      mes: MESES[mesNum - 1] ?? "",
    };
  }

  const parsed = new Date(isoOrDate);
  if (!Number.isNaN(parsed.getTime())) {
    return {
      dia: String(parsed.getDate()).padStart(2, "0"),
      mes: MESES[parsed.getMonth()] ?? "",
    };
  }

  return { dia: "--", mes: "---" };
}

/**
 * Formatea `created_at` de forma amigable para la tarjeta del Muro Corporativo.
 * Ejemplo: "17 de octubre de 2026, 10:30 p.m."
 */
export function formatearFechaPublicacion(
  isoOrDate: string | null | undefined
): string {
  if (!isoOrDate) return "Fecha reciente";
  const parsed = new Date(isoOrDate);
  if (Number.isNaN(parsed.getTime())) return isoOrDate;

  return parsed.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type SegmentoContenidoMuro =
  | { tipo: "texto"; valor: string }
  | { tipo: "enlace"; url: string; texto: string };

function esUrlHttpSegura(candidata: string): boolean {
  try {
    const parsed = new URL(candidata);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Divide un texto en segmentos puros de texto y enlaces validados (`http:` / `https:`)
 * para renderizarlos con nodos nativos de React sin utilizar `dangerouslySetInnerHTML`.
 */
export function segmentarContenidoConEnlaces(
  texto: string | null | undefined
): SegmentoContenidoMuro[] {
  if (!texto) return [];
  const urlRegex = /(https?:\/\/[^\s<>"']+)/gi;
  const segmentos: SegmentoContenidoMuro[] = [];
  let ultimoIndice = 0;

  let match: RegExpExecArray | null;
  while ((match = urlRegex.exec(texto)) !== null) {
    const inicio = match.index;
    const coincidencia = match[0];

    if (inicio > ultimoIndice) {
      segmentos.push({
        tipo: "texto",
        valor: texto.slice(ultimoIndice, inicio),
      });
    }

    const matchPuntuacion = coincidencia.match(/^(.*?)([.,;:!?)]*)$/);
    const urlLimpia = matchPuntuacion ? matchPuntuacion[1] : coincidencia;
    const puntuacionFinal = matchPuntuacion ? matchPuntuacion[2] : "";

    if (urlLimpia && esUrlHttpSegura(urlLimpia)) {
      segmentos.push({
        tipo: "enlace",
        url: urlLimpia,
        texto: urlLimpia,
      });
      if (puntuacionFinal) {
        segmentos.push({
          tipo: "texto",
          valor: puntuacionFinal,
        });
      }
    } else {
      segmentos.push({
        tipo: "texto",
        valor: coincidencia,
      });
    }

    ultimoIndice = inicio + coincidencia.length;
  }

  if (ultimoIndice < texto.length) {
    segmentos.push({
      tipo: "texto",
      valor: texto.slice(ultimoIndice),
    });
  }

  return segmentos;
}

/**
 * Escapa el texto para prevenir XSS y convierte cualquier URL (http:// o https://)
 * en una etiqueta `<a>` segura con `target="_blank"` y `rel="noopener noreferrer"`.
 */
export function formatearContenidoConEnlaces(texto: string): string {
  if (!texto) return "";
  const textoSeguro = escaparHtml(texto);
  const urlRegex = /(https?:\/\/[^\s<>"']+)/gi;

  return textoSeguro.replace(urlRegex, (coincidencia) => {
    // Separar puntuación final común (.,;:!?) para no incluirla en el href
    const matchPuntuacion = coincidencia.match(/^(.*?)([.,;:!?)]*)$/);
    const urlLimpia = matchPuntuacion ? matchPuntuacion[1] : coincidencia;
    const puntuacionFinal = matchPuntuacion ? matchPuntuacion[2] : "";

    return `<a href="${urlLimpia}" target="_blank" rel="noopener noreferrer" class="font-semibold text-brand-gold underline decoration-brand-gold/60 underline-offset-2 transition-colors hover:text-brand-dark">${urlLimpia}</a>${puntuacionFinal}`;
  });
}

/**
 * Formatea el alcance de audiencia de un comunicado ("General", "Exclusivo: ROYAL", "AIF - Ventas").
 */
export function formatearAlcancePublicacion(
  empresaDestino?: string | null,
  departamentoDestino?: string | null
): string {
  const emp = (empresaDestino ?? "Ambas").trim() || "Ambas";
  const dep = (departamentoDestino ?? "Todos").trim() || "Todos";

  const esEmpGeneral = emp.toLowerCase() === "ambas";
  const esDepGeneral = dep.toLowerCase() === "todos";

  if (esEmpGeneral && esDepGeneral) {
    return "General";
  }
  if (!esEmpGeneral && esDepGeneral) {
    return `Exclusivo: ${emp}`;
  }
  if (esEmpGeneral && !esDepGeneral) {
    return `General - ${dep}`;
  }
  return `${emp} - ${dep}`;
}

/**
 * Evalúa si una publicación cumple el filtro de audiencia para el empleado logueado:
 * - empresa_destino es igual a la empresa del usuario, o es "Ambas" (o nulo/vacío en registros previos)
 * - departamento_destino es igual al departamento del usuario, o es "Todos" (o nulo/vacío en registros previos)
 */
export function cumpleFiltroAudiencia(
  publicacion: {
    empresa_destino?: string | null;
    departamento_destino?: string | null;
  },
  userEmpresa?: string | null,
  userDepartamento?: string | null
): boolean {
  const empDestino = (publicacion.empresa_destino ?? "Ambas").trim() || "Ambas";
  const depDestino =
    (publicacion.departamento_destino ?? "Todos").trim() || "Todos";

  const empUsuario = (userEmpresa ?? "").trim();
  const depUsuario = (userDepartamento ?? "").trim();

  const cumpleEmpresa =
    empDestino.toLowerCase() === "ambas" ||
    !empUsuario ||
    empDestino.toLowerCase() === empUsuario.toLowerCase();

  const cumpleDepartamento =
    depDestino.toLowerCase() === "todos" ||
    !depUsuario ||
    depDestino.toLowerCase() === depUsuario.toLowerCase();

  return cumpleEmpresa && cumpleDepartamento;
}

/**
 * Extrae de forma segura la lista ordenada de URLs de imágenes de una publicación.
 * Soporta tanto una URL única en texto plano como un arreglo JSON serializado en `imagen_url`.
 */
export function extraerUrlsImagenes(imagenUrl?: string | null): string[] {
  if (!imagenUrl) return [];
  const limpio = imagenUrl.trim();
  if (!limpio) return [];

  if (limpio.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(limpio);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean);
      }
    } catch {
      // Si no es JSON válido, tratar como URL simple
    }
  }

  return [limpio];
}

/**
 * Serializa un arreglo ordenado de URLs de imágenes para almacenarlo en `muro_publicaciones.imagen_url`.
 * - 0 imágenes -> `null`
 * - 1 imagen -> cadena directa con la URL (100% compatible con registros existentes)
 * - 2+ imágenes -> JSON array respetando el orden definido
 */
export function serializarUrlsImagenes(urls: string[]): string | null {
  const limpias = urls.map((u) => u.trim()).filter(Boolean);
  if (limpias.length === 0) return null;
  if (limpias.length === 1) return limpias[0];
  return JSON.stringify(limpias);
}



