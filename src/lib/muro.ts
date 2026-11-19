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

export const PREFIJO_AUDIENCIA_JEFATURA = "JEFATURA:";
export const PREFIJO_AUDIENCIA_CELEBRACION_AREA = "CELEBRACION_AREA:";

export function extraerJefeFestejadoId(
  departamentoDestino?: string | null
): string | null {
  const dep = (departamentoDestino ?? "").trim();
  if (!dep.toUpperCase().startsWith(PREFIJO_AUDIENCIA_JEFATURA)) {
    return null;
  }
  const id = dep.slice(PREFIJO_AUDIENCIA_JEFATURA.length).trim();
  return id || null;
}

export function extraerCelebracionArea(
  departamentoDestino?: string | null
): { colaboradorId: string; departamento: string } | null {
  const dep = (departamentoDestino ?? "").trim();
  if (!dep.toUpperCase().startsWith(PREFIJO_AUDIENCIA_CELEBRACION_AREA)) {
    return null;
  }
  const resto = dep.slice(PREFIJO_AUDIENCIA_CELEBRACION_AREA.length).trim();
  if (!resto) return null;
  const idxSep = resto.indexOf("|");
  if (idxSep === -1) {
    return { colaboradorId: resto, departamento: "General" };
  }
  const colaboradorId = resto.slice(0, idxSep).trim();
  const departamento = resto.slice(idxSep + 1).trim() || "General";
  if (!colaboradorId) return null;
  return { colaboradorId, departamento };
}

export function esAudienciaCelebracion(
  departamentoDestino?: string | null
): boolean {
  return Boolean(
    extraerJefeFestejadoId(departamentoDestino) ||
      extraerCelebracionArea(departamentoDestino)
  );
}

/**
 * Formatea el alcance de audiencia de un comunicado ("General", "Exclusivo: ROYAL", "AIF - Ventas",
 * o "Equipo Directo y Jefaturas" para celebraciones de Jefaturas).
 */
export function formatearAlcancePublicacion(
  empresaDestino?: string | null,
  departamentoDestino?: string | null
): string {
  if (extraerJefeFestejadoId(departamentoDestino)) {
    return "Equipo Directo y Jefaturas";
  }

  const celebArea = extraerCelebracionArea(departamentoDestino);
  const emp = (empresaDestino ?? "Ambas").trim() || "Ambas";
  const dep = celebArea
    ? celebArea.departamento
    : (departamentoDestino ?? "Todos").trim() || "Todos";

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

export interface ContextoAudienciaJefatura {
  userId?: string | null;
  esJefatura?: boolean;
  miJefeDirectoId?: string | null;
  miJefeDirectoTexto?: string | null;
  nombreJefeFestejado?: string | null;
  esJefeDirectoDelFestejado?: boolean;
}

/**
 * Evalúa si una publicación cumple el filtro de audiencia para el empleado logueado:
 * - Si `departamento_destino` es `JEFATURA:<jefeId>` (cumpleaños/aniversario de una jefatura):
 *   visible para el festejado, su jefe directo, sus subordinados directos y otras jefaturas.
 * - Si `departamento_destino` es `CELEBRACION_AREA:<colabId>|<departamento>` (cumpleaños/aniversario de colaborador):
 *   visible para el festejado, sus compañeros de área y su jefe directo (aun si pertenece a otra área).
 * - Si no: `empresa_destino` coincide (o "Ambas") y `departamento_destino` coincide (o "Todos").
 */
export function cumpleFiltroAudiencia(
  publicacion: {
    empresa_destino?: string | null;
    departamento_destino?: string | null;
  },
  userEmpresa?: string | null,
  userDepartamento?: string | null,
  contextoJefatura?: ContextoAudienciaJefatura
): boolean {
  const jefeFestejadoId = extraerJefeFestejadoId(
    publicacion.departamento_destino
  );
  if (jefeFestejadoId) {
    if (!contextoJefatura) return false;

    const userIdNorm = (contextoJefatura.userId ?? "").trim().toLowerCase();
    const jefeIdNorm = jefeFestejadoId.trim().toLowerCase();

    // 1. El propio festejado
    if (userIdNorm && userIdNorm === jefeIdNorm) return true;

    // 2. Otras jefaturas o su jefe directo
    if (contextoJefatura.esJefatura || contextoJefatura.esJefeDirectoDelFestejado) {
      return true;
    }

    // 3. Subordinados directos del festejado (por UUID o por nombre en texto)
    const miJefeIdNorm = (contextoJefatura.miJefeDirectoId ?? "")
      .trim()
      .toLowerCase();
    const miJefeTextoNorm = (contextoJefatura.miJefeDirectoTexto ?? "")
      .trim()
      .toLowerCase();
    const nombreFestejadoNorm = (contextoJefatura.nombreJefeFestejado ?? "")
      .trim()
      .toLowerCase();

    if (miJefeIdNorm && miJefeIdNorm === jefeIdNorm) return true;
    if (miJefeTextoNorm && miJefeTextoNorm === jefeIdNorm) return true;
    if (
      nombreFestejadoNorm &&
      miJefeTextoNorm &&
      miJefeTextoNorm === nombreFestejadoNorm
    ) {
      return true;
    }

    return false;
  }

  const celebArea = extraerCelebracionArea(publicacion.departamento_destino);
  if (celebArea) {
    const userIdNorm = (contextoJefatura?.userId ?? "").trim().toLowerCase();
    const festejadoIdNorm = celebArea.colaboradorId.trim().toLowerCase();

    // 1. El propio festejado
    if (userIdNorm && userIdNorm === festejadoIdNorm) return true;

    // 2. Su jefe directo (sin importar si pertenece a otro departamento o empresa)
    if (contextoJefatura?.esJefeDirectoDelFestejado) return true;

    // 3. Compañeros de la misma área y empresa
    const empDestino =
      (publicacion.empresa_destino ?? "Ambas").trim() || "Ambas";
    const empUsuario = (userEmpresa ?? "").trim();
    const depUsuario = (userDepartamento ?? "").trim();

    const cumpleEmpresa =
      empDestino.toLowerCase() === "ambas" ||
      !empUsuario ||
      empDestino.toLowerCase() === empUsuario.toLowerCase();

    const cumpleDepartamento =
      Boolean(depUsuario) &&
      celebArea.departamento.toLowerCase() === depUsuario.toLowerCase();

    return cumpleEmpresa && cumpleDepartamento;
  }

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



