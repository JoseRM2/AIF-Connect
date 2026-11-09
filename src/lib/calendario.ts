/**
 * Motor de Calendario Corporativo AIF Connect:
 * - Días feriados oficiales conforme al Artículo 74 de la Ley Federal del Trabajo (LFT - México)
 * - Días feriados dinámicos dados de alta por Recursos Humanos
 * - Cálculo de días efectivos de vacaciones descontando feriados oficiales y de empresa
 * - Plantillas y variables dinámicas para felicitaciones de cumpleaños y aniversarios
 */

export type TipoEventoCalendario =
  | "vacaciones"
  | "cumpleanos"
  | "aniversario"
  | "feriado_lft"
  | "feriado_empresa"
  | "conmemorativo_muro";

export interface FeriadoEmpresaItem {
  id: string;
  fecha: string; // "YYYY-MM-DD"
  titulo: string;
  descripcion?: string | null;
  empresaDestino: "Ambas" | "AIF" | "ROYAL";
  esRecurrenteAnual: boolean;
  creadoPor?: string | null;
  createdAt: string;
}

export interface FechaConmemorativaMuroItem {
  id: string;
  fecha: string; // "YYYY-MM-DD"
  titulo: string;
  contenido: string;
  imagenesUrls: string[];
  empresaDestino: "Ambas" | "AIF" | "ROYAL";
  departamentoDestino: string;
  requiereAcuse: boolean;
  muroPublicacionId?: string | null;
  creadoPor?: string | null;
  createdAt: string;
}

export interface ConfigPlantillaCelebracion {
  publicarEnMuro: boolean;
  mostrarOverlayPrivado: boolean;
  alcanceMuro: "General" | "Departamento";
  tituloPlantilla: string;
  mensajePlantilla: string;
  imagenesPlantilla: string[];
}

export interface ConfigCelebracionesRh {
  cumpleanos: ConfigPlantillaCelebracion;
  aniversario: ConfigPlantillaCelebracion;
}

export interface ConfigCalendarioRhStorage {
  feriadosDinamicos: FeriadoEmpresaItem[];
  fechasConmemorativas: FechaConmemorativaMuroItem[];
  celebraciones: ConfigCelebracionesRh;
  /** Registro de claves anuales ya publicadas en el muro (ej. "cumpleanos-2026-uuid") para evitar duplicados */
  publicacionesAutomaticasEmitidas: Record<string, string>;
  updatedAt?: string | null;
}

export interface EventoCalendario {
  id: string;
  tipo: TipoEventoCalendario;
  fechaInicio: string; // "YYYY-MM-DD"
  fechaFin: string; // "YYYY-MM-DD"
  titulo: string;
  subtitulo?: string;
  descripcion?: string;
  colaboradorId?: string;
  nombreColaborador?: string;
  departamento?: string;
  empresa?: string;
  esPropio?: boolean;
  aniosServicio?: number;
  imagenesUrls?: string[];
}

export interface CelebracionPrivadaOverlay {
  idCelebracionAnual: string;
  tipo: "cumpleanos" | "aniversario";
  fechaCelebracion: string;
  titulo: string;
  mensaje: string;
  imagenesUrls: string[];
  nombreColaborador: string;
  primerNombre: string;
  departamento: string;
  empresa: string;
  aniosServicio?: number;
}

export const CONFIG_CELEBRACIONES_DEFAULT: ConfigCelebracionesRh = {
  cumpleanos: {
    publicarEnMuro: true,
    mostrarOverlayPrivado: true,
    alcanceMuro: "General",
    tituloPlantilla: "🎂 ¡Feliz cumpleaños, {nombre}!",
    mensajePlantilla:
      "Hoy celebramos con mucho entusiasmo el cumpleaños de {nombre}, integrante de nuestro equipo de {departamento} en {empresa}. ¡Te deseamos un año lleno de éxitos, salud y alegría!",
    imagenesPlantilla: [],
  },
  aniversario: {
    publicarEnMuro: true,
    mostrarOverlayPrivado: true,
    alcanceMuro: "General",
    tituloPlantilla:
      "🏆 ¡Feliz {anios_servicio}° aniversario en {empresa}, {nombre}!",
    mensajePlantilla:
      "Reconocemos y agradecemos la dedicación de {nombre} ({puesto} · {departamento}) al cumplir {anios_servicio} año(s) formando parte de {empresa}. ¡Gracias por crecer con nosotros!",
    imagenesPlantilla: [],
  },
};

export const MESES_COMPLETOS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

const MAPA_MESES_TEXTO: Record<string, number> = {
  "1": 1,
  "01": 1,
  ene: 1,
  enero: 1,
  jan: 1,
  january: 1,
  "2": 2,
  "02": 2,
  feb: 2,
  febrero: 2,
  february: 2,
  "3": 3,
  "03": 3,
  mar: 3,
  marzo: 3,
  march: 3,
  "4": 4,
  "04": 4,
  abr: 4,
  abril: 4,
  apr: 4,
  april: 4,
  "5": 5,
  "05": 5,
  may: 5,
  mayo: 5,
  "6": 6,
  "06": 6,
  jun: 6,
  junio: 6,
  june: 6,
  "7": 7,
  "07": 7,
  jul: 7,
  julio: 7,
  july: 7,
  "8": 8,
  "08": 8,
  ago: 8,
  agosto: 8,
  aug: 8,
  august: 8,
  "9": 9,
  "09": 9,
  sep: 9,
  sept: 9,
  septiembre: 9,
  setiembre: 9,
  september: 9,
  "10": 10,
  oct: 10,
  octubre: 10,
  october: 10,
  "11": 11,
  nov: 11,
  noviembre: 11,
  november: 11,
  "12": 12,
  dic: 12,
  diciembre: 12,
  dec: 12,
  december: 12,
};

/**
 * Convierte `mes_cumpleanos` ("Octubre", "OCT", "10", 10) en número de mes (1-12).
 */
export function parsearMesCumpleanos(
  mesRaw: string | number | null | undefined
): number | null {
  if (mesRaw === null || mesRaw === undefined) return null;
  if (typeof mesRaw === "number") {
    return mesRaw >= 1 && mesRaw <= 12 ? mesRaw : null;
  }
  const limpio = String(mesRaw)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!limpio) return null;

  if (MAPA_MESES_TEXTO[limpio]) {
    return MAPA_MESES_TEXTO[limpio];
  }

  const num = Number(limpio);
  if (!Number.isNaN(num) && num >= 1 && num <= 12) {
    return Math.floor(num);
  }
  return null;
}

export function formatearFechaIso(
  anio: number,
  mes1a12: number,
  dia1a31: number
): string {
  const m = String(mes1a12).padStart(2, "0");
  const d = String(dia1a31).padStart(2, "0");
  return `${anio}-${m}-${d}`;
}

/**
 * Obtiene el N-ésimo lunes (1 = primer lunes, 3 = tercer lunes) de un mes (1-12) y año dados.
 */
function obtenerNesimoLunesDelMes(
  anio: number,
  mes1a12: number,
  nLunes: number
): string {
  const primerDiaSemana = new Date(Date.UTC(anio, mes1a12 - 1, 1)).getUTCDay(); // 0=Dom, 1=Lun...
  const desplazamientoPrimerLunes = (1 - primerDiaSemana + 7) % 7;
  const diaPrimerLunes = 1 + desplazamientoPrimerLunes;
  const diaObjetivo = diaPrimerLunes + (nLunes - 1) * 7;
  return formatearFechaIso(anio, mes1a12, diaObjetivo);
}

export interface FeriadoOficialLft {
  fecha: string; // "YYYY-MM-DD"
  titulo: string;
  fundamento: string;
}

/**
 * Calcula los días de descanso obligatorio conforme al Artículo 74 de la LFT (México) para un año.
 */
export function obtenerFeriadosLftPorAnio(anio: number): FeriadoOficialLft[] {
  const primerLunesFebrero = obtenerNesimoLunesDelMes(anio, 2, 1);
  const tercerLunesMarzo = obtenerNesimoLunesDelMes(anio, 3, 3);
  const tercerLunesNoviembre = obtenerNesimoLunesDelMes(anio, 11, 3);

  const lista: FeriadoOficialLft[] = [
    {
      fecha: `${anio}-01-01`,
      titulo: "Año Nuevo",
      fundamento: "Art. 74 Fracc. I LFT · Descanso obligatorio",
    },
    {
      fecha: primerLunesFebrero,
      titulo: "Día de la Constitución Mexicana (5 de febrero)",
      fundamento: "Art. 74 Fracc. II LFT · Primer lunes de febrero",
    },
    {
      fecha: tercerLunesMarzo,
      titulo: "Natalicio de Benito Juárez (21 de marzo)",
      fundamento: "Art. 74 Fracc. III LFT · Tercer lunes de marzo",
    },
    {
      fecha: `${anio}-05-01`,
      titulo: "Día del Trabajo",
      fundamento: "Art. 74 Fracc. IV LFT · Descanso obligatorio",
    },
    {
      fecha: `${anio}-09-16`,
      titulo: "Día de la Independencia de México",
      fundamento: "Art. 74 Fracc. V LFT · Descanso obligatorio",
    },
    {
      fecha: tercerLunesNoviembre,
      titulo: "Día de la Revolución Mexicana (20 de noviembre)",
      fundamento: "Art. 74 Fracc. VI LFT · Tercer lunes de noviembre",
    },
    {
      fecha: `${anio}-12-25`,
      titulo: "Navidad",
      fundamento: "Art. 74 Fracc. VIII LFT · Descanso obligatorio",
    },
  ];

  // Fracción VII: 1o. de octubre de cada seis años (2024, 2030, 2036...) por transmisión del Poder Ejecutivo Federal
  if (anio >= 2024 && (anio - 2024) % 6 === 0) {
    lista.push({
      fecha: `${anio}-10-01`,
      titulo: "Transmisión del Poder Ejecutivo Federal",
      fundamento: "Art. 74 Fracc. VII LFT · Cada 6 años",
    });
  }

  return lista.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/**
 * Devuelve el mapa de todas las fechas feriadas ("YYYY-MM-DD" -> etiqueta) combinando LFT + Feriados Dinámicos de RH
 * aplicables a la empresa del colaborador.
 */
export function construirMapaFeriadosPorAnio(
  anio: number,
  feriadosDinamicos: FeriadoEmpresaItem[] = [],
  empresaUsuario?: string | null
): Map<string, { titulo: string; tipo: "feriado_lft" | "feriado_empresa" }> {
  const mapa = new Map<
    string,
    { titulo: string; tipo: "feriado_lft" | "feriado_empresa" }
  >();

  for (const lft of obtenerFeriadosLftPorAnio(anio)) {
    mapa.set(lft.fecha, { titulo: lft.titulo, tipo: "feriado_lft" });
  }

  const empUser = (empresaUsuario ?? "").trim().toUpperCase();

  for (const item of feriadosDinamicos) {
    const empItem = (item.empresaDestino ?? "Ambas").trim().toUpperCase();
    const aplicaEmpresa =
      empItem === "AMBAS" || !empUser || empItem === empUser;

    if (!aplicaEmpresa) continue;

    const partes = (item.fecha ?? "").slice(0, 10).split("-");
    if (partes.length !== 3) continue;

    const fechaEfectiva = item.esRecurrenteAnual
      ? `${anio}-${partes[1]}-${partes[2]}`
      : `${partes[0]}-${partes[1]}-${partes[2]}`;

    if (fechaEfectiva.startsWith(`${anio}-`)) {
      mapa.set(fechaEfectiva, {
        titulo: item.titulo,
        tipo: "feriado_empresa",
      });
    }
  }

  return mapa;
}

/**
 * Calcula los días solicitados entre `fechaInicio` y `fechaFin` descontando automáticamente
 * los días feriados oficiales (LFT) y los días feriados dinámicos de la empresa dados de alta por RH.
 */
export function calcularDiasEfectivosSinFeriados(
  fechaInicio: string,
  fechaFin: string,
  feriadosDinamicos: FeriadoEmpresaItem[] = [],
  empresaUsuario?: string | null
): {
  diasNaturales: number;
  diasEfectivos: number;
  feriadosEnRango: Array<{ fecha: string; titulo: string }>;
} {
  if (!fechaInicio || !fechaFin) {
    return { diasNaturales: 0, diasEfectivos: 0, feriadosEnRango: [] };
  }

  const [y1, m1, d1] = fechaInicio.slice(0, 10).split("-").map(Number);
  const [y2, m2, d2] = fechaFin.slice(0, 10).split("-").map(Number);
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) {
    return { diasNaturales: 0, diasEfectivos: 0, feriadosEnRango: [] };
  }

  const inicioUtc = Date.UTC(y1, m1 - 1, d1);
  const finUtc = Date.UTC(y2, m2 - 1, d2);
  if (finUtc < inicioUtc) {
    return { diasNaturales: 0, diasEfectivos: 0, feriadosEnRango: [] };
  }

  const mapasPorAnio = new Map<
    number,
    Map<string, { titulo: string; tipo: "feriado_lft" | "feriado_empresa" }>
  >();

  for (let anio = y1; anio <= y2; anio++) {
    mapasPorAnio.set(
      anio,
      construirMapaFeriadosPorAnio(anio, feriadosDinamicos, empresaUsuario)
    );
  }

  const MS_POR_DIA = 86_400_000;
  let diasNaturales = 0;
  const feriadosEnRango: Array<{ fecha: string; titulo: string }> = [];

  for (let ms = inicioUtc; ms <= finUtc; ms += MS_POR_DIA) {
    diasNaturales += 1;
    const d = new Date(ms);
    const anio = d.getUTCFullYear();
    const mes = d.getUTCMonth() + 1;
    const dia = d.getUTCDate();
    const iso = formatearFechaIso(anio, mes, dia);
    const feriado = mapasPorAnio.get(anio)?.get(iso);
    if (feriado) {
      feriadosEnRango.push({ fecha: iso, titulo: feriado.titulo });
    }
  }

  const diasEfectivos = Math.max(0, diasNaturales - feriadosEnRango.length);
  return { diasNaturales, diasEfectivos, feriadosEnRango };
}

/**
 * Reemplaza variables dinámicas `{nombre}`, `{primer_nombre}`, `{puesto}`,
 * `{departamento}`, `{empresa}`, `{anios_servicio}` en las plantillas de RH.
 */
export function reemplazarVariablesPlantilla(
  plantilla: string,
  variables: {
    nombre: string;
    primer_nombre?: string;
    puesto?: string | null;
    departamento?: string | null;
    empresa?: string | null;
    anios_servicio?: number | null;
  }
): string {
  const nombreLimpio = variables.nombre.trim() || "Colaborador";
  const primerNombre =
    variables.primer_nombre?.trim() ||
    nombreLimpio.split(/\s+/)[0] ||
    nombreLimpio;
  const puesto = (variables.puesto ?? "").trim() || "Colaborador";
  const departamento = (variables.departamento ?? "").trim() || "General";
  const empresa = (variables.empresa ?? "").trim() || "AIF";
  const anios = String(variables.anios_servicio ?? 1);

  return plantilla
    .replace(/\{nombre\}/gi, nombreLimpio)
    .replace(/\{primer_nombre\}/gi, primerNombre)
    .replace(/\{puesto\}/gi, puesto)
    .replace(/\{departamento\}/gi, departamento)
    .replace(/\{area\}/gi, departamento)
    .replace(/\{empresa\}/gi, empresa)
    .replace(/\{anios_servicio\}/gi, anios)
    .replace(/\{anos_servicio\}/gi, anios);
}
