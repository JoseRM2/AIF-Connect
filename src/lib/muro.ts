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

