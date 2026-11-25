import type { CellObject, Row, SheetData } from "write-excel-file/browser";

/** Límite defensivo de 5 MB para mitigar agotamiento de memoria al leer hojas externas. */
export const MAX_TAMANO_ARCHIVO_EXCEL_BYTES = 5 * 1024 * 1024;

export interface EstiloCeldaExcel {
  backgroundColor?: string;
  textColor?: string;
  fontWeight?: "bold";
}

export interface ExportarFilasExcelOpciones<
  T extends Record<string, string | number> = Record<string, string | number>,
> {
  filas: T[];
  nombreArchivo: string;
  nombreHoja: string;
  obtenerEstiloCelda?: (params: {
    fila: T;
    filaIndice: number;
    columna: string;
    columnaIndice: number;
  }) => EstiloCeldaExcel | undefined;
}

/**
 * Parsea contenido CSV (RFC 4180) soportando BOM UTF-8, comillas escapadas y
 * autodetección de delimitador coma (`,`) o punto y coma (`;`, común en Excel en español).
 */
function parsearCsvAFilas(contenidoRaw: string): string[][] {
  const texto = contenidoRaw.replace(/^\uFEFF/, "");
  const primeraLinea = texto.split(/\r?\n/, 1)[0] ?? "";
  const conteoComas = (primeraLinea.match(/,/g) ?? []).length;
  const conteoPuntoComa = (primeraLinea.match(/;/g) ?? []).length;
  const delimitador = conteoPuntoComa > conteoComas ? ";" : ",";

  const filas: string[][] = [];
  let filaActual: string[] = [];
  let celdaActual = "";
  let enComillas = false;

  for (let i = 0; i < texto.length; i += 1) {
    const ch = texto[i]!;
    const sig = texto[i + 1];

    if (enComillas) {
      if (ch === '"' && sig === '"') {
        celdaActual += '"';
        i += 1;
      } else if (ch === '"') {
        enComillas = false;
      } else {
        celdaActual += ch;
      }
      continue;
    }

    if (ch === '"') {
      enComillas = true;
    } else if (ch === delimitador) {
      filaActual.push(celdaActual);
      celdaActual = "";
    } else if (ch === "\r" && sig === "\n") {
      filaActual.push(celdaActual);
      filas.push(filaActual);
      filaActual = [];
      celdaActual = "";
      i += 1;
    } else if (ch === "\n" || ch === "\r") {
      filaActual.push(celdaActual);
      filas.push(filaActual);
      filaActual = [];
      celdaActual = "";
    } else {
      celdaActual += ch;
    }
  }

  if (celdaActual.length > 0 || filaActual.length > 0) {
    filaActual.push(celdaActual);
    filas.push(filaActual);
  }

  return filas;
}

function convertirMatrizAObjetos(
  matriz: ReadonlyArray<ReadonlyArray<unknown>>
): Record<string, unknown>[] {
  const indiceEncabezado = matriz.findIndex((fila) =>
    fila.some((celda) => celda !== null && celda !== undefined && String(celda).trim() !== "")
  );

  if (indiceEncabezado === -1) {
    return [];
  }

  const filaEncabezados = matriz[indiceEncabezado] ?? [];
  const encabezados = filaEncabezados.map((celda, idx) => {
    const limpio = celda !== null && celda !== undefined ? String(celda).trim() : "";
    return limpio || `__EMPTY_${idx}`;
  });

  const objetos: Record<string, unknown>[] = [];

  for (let r = indiceEncabezado + 1; r < matriz.length; r += 1) {
    const fila = matriz[r] ?? [];
    const tieneContenido = fila.some(
      (celda) => celda !== null && celda !== undefined && String(celda).trim() !== ""
    );
    if (!tieneContenido) continue;

    const registro: Record<string, unknown> = {};
    for (let c = 0; c < encabezados.length; c += 1) {
      const clave = encabezados[c]!;
      const valor = fila[c];
      registro[clave] = valor === null || valor === undefined ? "" : valor;
    }
    objetos.push(registro);
  }

  return objetos;
}

/**
 * Lee de forma segura un archivo `.xlsx` o `.csv` en el navegador y devuelve sus filas
 * como arreglo de objetos (`defval: ""`), reemplazando al paquete legado `xlsx@0.18.5`.
 */
export async function leerHojaCalculoComoJson(
  file: File,
  maxBytes: number = MAX_TAMANO_ARCHIVO_EXCEL_BYTES
): Promise<Record<string, unknown>[]> {
  if (file.size > maxBytes) {
    const maxMb = Math.round((maxBytes / (1024 * 1024)) * 10) / 10;
    throw new Error(
      `El archivo supera el tamaño máximo permitido (${maxMb} MB).`
    );
  }

  const nombreLower = file.name.trim().toLowerCase();

  if (nombreLower.endsWith(".xls")) {
    throw new Error(
      "Por seguridad, el formato antiguo .xls (Excel 97-2003) no es admitido. Guarda tu plantilla como .xlsx o .csv e inténtalo de nuevo."
    );
  }

  if (nombreLower.endsWith(".csv")) {
    const contenido = await file.text();
    const matrizCsv = parsearCsvAFilas(contenido);
    return convertirMatrizAObjetos(matrizCsv);
  }

  if (!nombreLower.endsWith(".xlsx")) {
    throw new Error(
      "Formato de archivo no soportado. Selecciona un archivo .xlsx o .csv válido."
    );
  }

  const { readSheet } = await import("read-excel-file/browser");
  const matrizXlsx = await readSheet(file);
  return convertirMatrizAObjetos(matrizXlsx);
}

/**
 * Genera y descarga un archivo `.xlsx` bajo demanda (`import()` dinámico) con ajuste
 * automático de ancho de columnas y soporte real de colores/estilos por celda.
 */
export async function exportarFilasAExcel<
  T extends Record<string, string | number>,
>({
  filas,
  nombreArchivo,
  nombreHoja,
  obtenerEstiloCelda,
}: ExportarFilasExcelOpciones<T>): Promise<void> {
  if (filas.length === 0) return;

  const { default: writeXlsxFile } = await import("write-excel-file/browser");

  const encabezados = Object.keys(filas[0] ?? {});

  const columns = encabezados.map((key) => {
    const maxLen = filas.reduce((acc, row) => {
      const val = String(row[key] ?? "");
      return Math.max(acc, val.length);
    }, key.length);
    return { width: Math.min(Math.max(maxLen + 4, 14), 48) };
  });

  const filaHeader: Row = encabezados.map(
    (titulo): CellObject => ({
      type: String,
      value: titulo,
      fontWeight: "bold",
      backgroundColor: "#1A181C",
      textColor: "#FFFFFF",
    })
  );

  const filasDatos: Row[] = filas.map((fila, filaIndice) =>
    encabezados.map((columna, columnaIndice): CellObject => {
      const valorCrudo = fila[columna] ?? "";
      const estilo = obtenerEstiloCelda?.({
        fila,
        filaIndice,
        columna,
        columnaIndice,
      });

      if (typeof valorCrudo === "number" && Number.isFinite(valorCrudo)) {
        return {
          type: Number,
          value: valorCrudo,
          ...(estilo ?? {}),
        };
      }

      return {
        type: String,
        value: String(valorCrudo),
        ...(estilo ?? {}),
      };
    })
  );

  const sheetData: SheetData = [filaHeader, ...filasDatos];
  const nombreHojaSeguro =
    nombreHoja.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || "Reporte";

  await writeXlsxFile(sheetData, {
    sheet: nombreHojaSeguro,
    columns,
  }).toFile(nombreArchivo);
}
