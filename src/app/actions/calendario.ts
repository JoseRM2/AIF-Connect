"use server";

import { revalidatePath } from "next/cache";
import { obtenerSesionYRol, type RolSistema } from "@/lib/auth/session";
import {
  CONFIG_CELEBRACIONES_DEFAULT,
  construirMapaFeriadosPorAnio,
  formatearFechaIso,
  obtenerFeriadosLftPorAnio,
  parsearMesCumpleanos,
  reemplazarVariablesPlantilla,
  type CelebracionPrivadaOverlay,
  type ConfigCalendarioRhStorage,
  type ConfigCelebracionesRh,
  type EventoCalendario,
  type FechaConmemorativaMuroItem,
  type FeriadoEmpresaItem,
} from "@/lib/calendario";
import {
  PREFIJO_AUDIENCIA_CELEBRACION_AREA,
  PREFIJO_AUDIENCIA_JEFATURA,
  serializarUrlsImagenes,
} from "@/lib/muro";
import { calcularDiasVacacionesPorAniosLft } from "@/lib/solicitudes";
import { BUCKET_EXPEDIENTES } from "@/lib/storage/expedientes";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSessionClient } from "@/lib/supabase/server";

const RUTA_CONFIG_CALENDARIO = "_sistema/config_calendario_rh.json";

let cacheMemoriaCalendario: ConfigCalendarioRhStorage = {
  feriadosDinamicos: [],
  fechasConmemorativas: [],
  celebraciones: CONFIG_CELEBRACIONES_DEFAULT,
  publicacionesAutomaticasEmitidas: {},
  updatedAt: null,
};

function obtenerClienteDb() {
  try {
    return createAdminClient();
  } catch {
    return createSessionClient() as unknown as ReturnType<
      typeof createAdminClient
    >;
  }
}

function normalizarConfigCalendario(
  raw?: Partial<ConfigCalendarioRhStorage> | null
): ConfigCalendarioRhStorage {
  return {
    feriadosDinamicos: Array.isArray(raw?.feriadosDinamicos)
      ? raw!.feriadosDinamicos
      : [],
    fechasConmemorativas: Array.isArray(raw?.fechasConmemorativas)
      ? raw!.fechasConmemorativas
      : [],
    celebraciones: {
      cumpleanos: {
        ...CONFIG_CELEBRACIONES_DEFAULT.cumpleanos,
        ...(raw?.celebraciones?.cumpleanos ?? {}),
        imagenesPlantilla: Array.isArray(
          raw?.celebraciones?.cumpleanos?.imagenesPlantilla
        )
          ? raw!.celebraciones!.cumpleanos!.imagenesPlantilla
          : [],
      },
      aniversario: {
        ...CONFIG_CELEBRACIONES_DEFAULT.aniversario,
        ...(raw?.celebraciones?.aniversario ?? {}),
        imagenesPlantilla: Array.isArray(
          raw?.celebraciones?.aniversario?.imagenesPlantilla
        )
          ? raw!.celebraciones!.aniversario!.imagenesPlantilla
          : [],
      },
    },
    publicacionesAutomaticasEmitidas:
      raw?.publicacionesAutomaticasEmitidas &&
      typeof raw.publicacionesAutomaticasEmitidas === "object"
        ? raw.publicacionesAutomaticasEmitidas
        : {},
    updatedAt: raw?.updatedAt ?? null,
  };
}

function extraerArrayStringsJson(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((i): i is string => typeof i === "string")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function leerConfigCalendarioRhInterno(): Promise<ConfigCalendarioRhStorage> {
  try {
    const db = obtenerClienteDb();

    // 1. Intentar leer primero desde la tabla PostgreSQL `public.calendario_eventos_rh`
    const { data: filasTabla, error: errTabla } = await db
      .from("calendario_eventos_rh")
      .select("*")
      .order("fecha", { ascending: true });

    if (!errTabla && filasTabla) {
      const feriadosDinamicos: FeriadoEmpresaItem[] = [];
      const fechasConmemorativas: FechaConmemorativaMuroItem[] = [];
      const publicacionesAutomaticasEmitidas: Record<string, string> = {};
      const celebraciones: ConfigCelebracionesRh = {
        cumpleanos: { ...CONFIG_CELEBRACIONES_DEFAULT.cumpleanos },
        aniversario: { ...CONFIG_CELEBRACIONES_DEFAULT.aniversario },
      };

      for (const fila of filasTabla) {
        const empNorm: "Ambas" | "AIF" | "ROYAL" =
          fila.empresa_destino === "AIF"
            ? "AIF"
            : fila.empresa_destino === "ROYAL"
            ? "ROYAL"
            : "Ambas";

        if (fila.tipo === "feriado_empresa" && fila.fecha) {
          feriadosDinamicos.push({
            id: fila.id,
            fecha: fila.fecha,
            titulo: fila.titulo,
            descripcion: fila.contenido,
            empresaDestino: empNorm,
            esRecurrenteAnual: Boolean(fila.es_recurrente_anual),
            creadoPor: fila.creado_por,
            createdAt: fila.created_at,
          });
        } else if (fila.tipo === "conmemorativo_muro" && fila.fecha) {
          fechasConmemorativas.push({
            id: fila.id,
            fecha: fila.fecha,
            titulo: fila.titulo,
            contenido: fila.contenido ?? "",
            imagenesUrls: extraerArrayStringsJson(fila.imagenes_urls),
            empresaDestino: empNorm,
            departamentoDestino: fila.departamento_destino || "Todos",
            requiereAcuse: Boolean(fila.requiere_acuse),
            muroPublicacionId: fila.muro_publicacion_id,
            creadoPor: fila.creado_por,
            createdAt: fila.created_at,
          });
        } else if (fila.tipo === "plantilla_cumpleanos") {
          celebraciones.cumpleanos = {
            publicarEnMuro: Boolean(fila.publicar_en_muro),
            mostrarOverlayPrivado: Boolean(fila.mostrar_overlay_privado),
            alcanceMuro:
              fila.alcance_muro === "Departamento"
                ? "Departamento"
                : "General",
            tituloPlantilla:
              fila.titulo ||
              CONFIG_CELEBRACIONES_DEFAULT.cumpleanos.tituloPlantilla,
            mensajePlantilla:
              fila.contenido ||
              CONFIG_CELEBRACIONES_DEFAULT.cumpleanos.mensajePlantilla,
            imagenesPlantilla: extraerArrayStringsJson(fila.imagenes_urls),
          };
        } else if (fila.tipo === "plantilla_aniversario") {
          celebraciones.aniversario = {
            publicarEnMuro: Boolean(fila.publicar_en_muro),
            mostrarOverlayPrivado: Boolean(fila.mostrar_overlay_privado),
            alcanceMuro:
              fila.alcance_muro === "Departamento"
                ? "Departamento"
                : "General",
            tituloPlantilla:
              fila.titulo ||
              CONFIG_CELEBRACIONES_DEFAULT.aniversario.tituloPlantilla,
            mensajePlantilla:
              fila.contenido ||
              CONFIG_CELEBRACIONES_DEFAULT.aniversario.mensajePlantilla,
            imagenesPlantilla: extraerArrayStringsJson(fila.imagenes_urls),
          };
        } else if (
          fila.tipo === "registro_emision_anual" &&
          fila.clave_emision
        ) {
          publicacionesAutomaticasEmitidas[fila.clave_emision] =
            fila.created_at;
        }
      }

      const resultadoTabla: ConfigCalendarioRhStorage = {
        feriadosDinamicos,
        fechasConmemorativas,
        celebraciones,
        publicacionesAutomaticasEmitidas,
        updatedAt: new Date().toISOString(),
      };
      cacheMemoriaCalendario = resultadoTabla;
      return resultadoTabla;
    }

    // 2. Respaldo en Storage si la tabla aún no se ha creado en Supabase
    const { data, error } = await db.storage
      .from(BUCKET_EXPEDIENTES)
      .download(RUTA_CONFIG_CALENDARIO);

    if (error || !data) {
      return cacheMemoriaCalendario;
    }

    const texto = await data.text();
    const parsed = JSON.parse(texto) as Partial<ConfigCalendarioRhStorage>;
    const normalizada = normalizarConfigCalendario(parsed);
    cacheMemoriaCalendario = normalizada;
    return normalizada;
  } catch {
    return cacheMemoriaCalendario;
  }
}

async function guardarConfigCalendarioRhInterno(
  nuevaConfig: ConfigCalendarioRhStorage
): Promise<void> {
  cacheMemoriaCalendario = nuevaConfig;
  try {
    const db = obtenerClienteDb();
    const contenido = JSON.stringify(nuevaConfig, null, 2);
    const blob = new Blob([contenido], { type: "application/json" });
    await db.storage
      .from(BUCKET_EXPEDIENTES)
      .upload(RUTA_CONFIG_CALENDARIO, blob, {
        contentType: "application/json",
        cacheControl: "0",
        upsert: true,
      });
  } catch {
    // Se conserva en cacheMemoriaCalendario si el bucket no responde temporalmente
  }
}

export async function obtenerFeriadosDinamicosAction(): Promise<
  FeriadoEmpresaItem[]
> {
  const cfg = await leerConfigCalendarioRhInterno();
  return cfg.feriadosDinamicos;
}

function esColaboradorActivo(estatus: string | null | undefined): boolean {
  return (estatus ?? "Activo").trim().toLowerCase() !== "inactivo";
}

function normalizarComparacion(valor: unknown): string {
  return String(valor ?? "")
    .trim()
    .toLowerCase();
}

function perteneceAEquipoDirecto(
  colaborador: Record<string, unknown>,
  jefeId: string,
  nombreJefeNorm: string
): boolean {
  const idNorm = normalizarComparacion(jefeId);
  const colJefeId = normalizarComparacion(colaborador.jefe_directo_id);
  const colJefeTexto = normalizarComparacion(colaborador.jefe_directo);

  if (colJefeId && colJefeId === idNorm) return true;
  if (colJefeTexto && colJefeTexto === idNorm) return true;
  if (nombreJefeNorm && colJefeTexto && colJefeTexto === nombreJefeNorm) {
    return true;
  }
  return false;
}

function esColaboradorJefatura(colaborador: Record<string, unknown>): boolean {
  const rol = normalizarComparacion(colaborador.rol_sistema);
  return rol === "jefatura" || Boolean(colaborador.es_jefatura);
}

function extraerDiaYMesIngreso(
  fechaIngresoRaw: string | null | undefined
): { anioIngreso: number; mes: number; dia: number } | null {
  if (!fechaIngresoRaw) return null;
  const soloFecha = fechaIngresoRaw.trim().slice(0, 10);
  const [y, m, d] = soloFecha.split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { anioIngreso: y, mes: m, dia: d };
}

function obtenerFechaHoyMexico(): {
  anio: number;
  mes: number;
  dia: number;
  fechaIso: string;
} {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const anio = Number(partes.find((p) => p.type === "year")?.value ?? 0);
  const mes = Number(partes.find((p) => p.type === "month")?.value ?? 0);
  const dia = Number(partes.find((p) => p.type === "day")?.value ?? 0);

  if (!anio || !mes || !dia) {
    const ahora = new Date();
    const y = ahora.getFullYear();
    const m = ahora.getMonth() + 1;
    const d = ahora.getDate();
    return {
      anio: y,
      mes: m,
      dia: d,
      fechaIso: formatearFechaIso(y, m, d),
    };
  }

  return {
    anio,
    mes,
    dia,
    fechaIso: formatearFechaIso(anio, mes, dia),
  };
}

/**
 * Emite automáticamente en `muro_publicaciones` las felicitaciones públicas (Enfoque 1)
 * de cumpleaños y aniversario correspondientes al día de hoy (zona horaria America/Mexico_City)
 * si están activas y aún no se han emitido.
 */
async function procesarPublicacionesAutomaticasHoy(
  colaboradoresActivos: Array<Record<string, unknown>>,
  configActual: ConfigCalendarioRhStorage,
  autorFallbackId: string | null = null
): Promise<{
  config: ConfigCalendarioRhStorage;
  clavesPublicadas: string[];
  clavesAbonosVacaciones: string[];
  fechaMexico: string;
}> {
  const { anio: anioHoy, mes: mesHoy, dia: diaHoy, fechaIso: fechaMexico } =
    obtenerFechaHoyMexico();

  let huboCambios = false;
  const clavesPublicadas: string[] = [];
  const clavesAbonosVacaciones: string[] = [];
  const registroEmitidas = {
    ...configActual.publicacionesAutomaticasEmitidas,
  };
  const db = obtenerClienteDb();

  // Precalcular qué colaboradores son Jefatura (por rol, bandera o por tener subordinados directos)
  // y localizar un perfil de Recursos Humanos como respaldo en caso de que `autor_id` no acepte NULL.
  const referenciasJefesActivos = new Set<string>();
  let autorRhFallbackId: string | null = autorFallbackId;
  for (const otro of colaboradoresActivos) {
    const colJefeId = normalizarComparacion(otro.jefe_directo_id);
    const colJefeTexto = normalizarComparacion(otro.jefe_directo);
    if (colJefeId) referenciasJefesActivos.add(colJefeId);
    if (colJefeTexto) referenciasJefesActivos.add(colJefeTexto);
    if (
      (!autorRhFallbackId || autorRhFallbackId === autorFallbackId) &&
      normalizarComparacion(otro.rol_sistema) === "recursos humanos" &&
      otro.id
    ) {
      autorRhFallbackId = String(otro.id);
    }
  }

  const insertarPublicacionCelebracionRh = async (payload: {
    titulo: string;
    contenido: string;
    imagen_url: string | null;
    empresa_destino: string;
    departamento_destino: string;
  }) => {
    // Publicar con `autor_id: null` para que aparezca creada por "Recursos Humanos"
    const resNull = await db.from("muro_publicaciones").insert({
      ...payload,
      requiere_acuse: false,
      autor_id: null,
      fecha_publicacion: new Date().toISOString(),
    });
    if (!resNull.error || !autorRhFallbackId) return resNull;

    // Respaldo solo si la BD tiene restricción NOT NULL en `autor_id`
    return db.from("muro_publicaciones").insert({
      ...payload,
      requiere_acuse: false,
      autor_id: autorRhFallbackId,
      fecha_publicacion: new Date().toISOString(),
    });
  };

  for (const colab of colaboradoresActivos) {
    const colabId = String(colab.id ?? "");
    if (!colabId) continue;

    const nombreCompleto =
      String(colab.nombre_completo ?? "").trim() ||
      `${String(colab.nombre ?? "")} ${String(colab.apellidos ?? "")}`.trim() ||
      "Colaborador";
    const primerNombre = nombreCompleto.split(/\s+/)[0] || nombreCompleto;
    const departamento =
      String(colab.departamento ?? colab.area ?? "General").trim() || "General";
    const puesto = String(colab.puesto ?? "Colaborador").trim() || "Colaborador";
    const empresa =
      String(colab.empresa ?? "AIF")
        .trim()
        .toUpperCase() === "ROYAL"
        ? "ROYAL"
        : "AIF";

    const idNormColab = normalizarComparacion(colabId);
    const nombreNormColab = normalizarComparacion(nombreCompleto);
    const esFestejadoJefatura =
      esColaboradorJefatura(colab) ||
      (Boolean(idNormColab) && referenciasJefesActivos.has(idNormColab)) ||
      (Boolean(nombreNormColab) && referenciasJefesActivos.has(nombreNormColab));

    // Regla de visibilidad de cumpleaños y aniversarios en el Muro Corporativo:
    // - Si el colaborador es Jefatura: visible para sus subordinados directos, su jefe directo y otras jefaturas (`JEFATURA:<colabId>`).
    // - Si el colaborador NO es Jefatura: visible para sus compañeros de área y su jefe directo (`CELEBRACION_AREA:<colabId>|<departamento>`).
    const empresaDestinoCelebracion = esFestejadoJefatura ? "Ambas" : empresa;
    const departamentoDestinoCelebracion = esFestejadoJefatura
      ? `${PREFIJO_AUDIENCIA_JEFATURA}${colabId}`
      : `${PREFIJO_AUDIENCIA_CELEBRACION_AREA}${colabId}|${departamento}`;

    // 1. Verificar Cumpleaños de hoy
    const diaCumple = Number(colab.dia_cumpleanos ?? 0);
    const mesCumple = parsearMesCumpleanos(
      colab.mes_cumpleanos as string | number | null | undefined
    );

    if (
      configActual.celebraciones.cumpleanos.publicarEnMuro &&
      diaCumple === diaHoy &&
      mesCumple === mesHoy
    ) {
      const claveCumple = `cumpleanos-${anioHoy}-${colabId}`;
      if (!registroEmitidas[claveCumple]) {
        const cfgCumple = configActual.celebraciones.cumpleanos;
        const tituloPost = reemplazarVariablesPlantilla(
          cfgCumple.tituloPlantilla,
          {
            nombre: nombreCompleto,
            primer_nombre: primerNombre,
            puesto,
            departamento,
            empresa,
          }
        );
        const contenidoPost = reemplazarVariablesPlantilla(
          cfgCumple.mensajePlantilla,
          {
            nombre: nombreCompleto,
            primer_nombre: primerNombre,
            puesto,
            departamento,
            empresa,
          }
        );
        const imagenUrlSerializada = serializarUrlsImagenes(
          cfgCumple.imagenesPlantilla
        );

        const { error: errInsert } = await insertarPublicacionCelebracionRh({
          titulo: tituloPost,
          contenido: contenidoPost,
          imagen_url: imagenUrlSerializada,
          empresa_destino: empresaDestinoCelebracion,
          departamento_destino: departamentoDestinoCelebracion,
        });

        if (!errInsert) {
          registroEmitidas[claveCumple] = new Date().toISOString();
          clavesPublicadas.push(claveCumple);
          huboCambios = true;
          await db.from("calendario_eventos_rh").upsert(
            {
              tipo: "registro_emision_anual",
              titulo: tituloPost,
              clave_emision: claveCumple,
            },
            { onConflict: "clave_emision" }
          );
        }
      }
    }

    // 2. Verificar Aniversario laboral de hoy (>= 1 año de servicio)
    const datosIngreso = extraerDiaYMesIngreso(
      colab.fecha_ingreso as string | null | undefined
    );
    if (
      datosIngreso &&
      datosIngreso.dia === diaHoy &&
      datosIngreso.mes === mesHoy &&
      anioHoy > datosIngreso.anioIngreso
    ) {
      const aniosServicio = anioHoy - datosIngreso.anioIngreso;

      // 2A. Abono automático de vacaciones conforme a la tabla LFT según años cumplidos
      // (opera independientemente de si está activa la publicación en muro; control anti-duplicado por año)
      const claveAbono = `abono-vacaciones-${anioHoy}-${colabId}`;
      const diasAbonoLft = calcularDiasVacacionesPorAniosLft(aniosServicio);
      if (diasAbonoLft > 0 && !registroEmitidas[claveAbono]) {
        const { data: colabSaldoActual } = await db
          .from("colaboradores")
          .select("saldo_vacaciones")
          .eq("id", colabId)
          .maybeSingle();

        const saldoPrevio = Number(
          colabSaldoActual?.saldo_vacaciones ?? colab.saldo_vacaciones ?? 0
        );
        const nuevoSaldo =
          Math.round((saldoPrevio + diasAbonoLft) * 100) / 100;

        const { error: errSaldo } = await db
          .from("colaboradores")
          .update({ saldo_vacaciones: nuevoSaldo })
          .eq("id", colabId);

        if (!errSaldo) {
          registroEmitidas[claveAbono] = new Date().toISOString();
          clavesAbonosVacaciones.push(
            `${claveAbono} (+${diasAbonoLft}d por ${aniosServicio} año${
              aniosServicio === 1 ? "" : "s"
            })`
          );
          huboCambios = true;
          await db.from("calendario_eventos_rh").upsert(
            {
              tipo: "registro_emision_anual",
              titulo: `Abono automático LFT (+${diasAbonoLft} días · ${aniosServicio}° aniversario) · ${nombreCompleto}`,
              clave_emision: claveAbono,
            },
            { onConflict: "clave_emision" }
          );
        }
      }

      // 2B. Publicación de aniversario en el Muro Corporativo (si está habilitada)
      if (configActual.celebraciones.aniversario.publicarEnMuro) {
        const claveAniv = `aniversario-${anioHoy}-${colabId}`;
        if (!registroEmitidas[claveAniv]) {
          const cfgAniv = configActual.celebraciones.aniversario;
          const tituloPost = reemplazarVariablesPlantilla(
            cfgAniv.tituloPlantilla,
            {
              nombre: nombreCompleto,
              primer_nombre: primerNombre,
              puesto,
              departamento,
              empresa,
              anios_servicio: aniosServicio,
            }
          );
          const contenidoPost = reemplazarVariablesPlantilla(
            cfgAniv.mensajePlantilla,
            {
              nombre: nombreCompleto,
              primer_nombre: primerNombre,
              puesto,
              departamento,
              empresa,
              anios_servicio: aniosServicio,
            }
          );
          const imagenUrlSerializada = serializarUrlsImagenes(
            cfgAniv.imagenesPlantilla
          );

          const { error: errInsert } = await insertarPublicacionCelebracionRh({
            titulo: tituloPost,
            contenido: contenidoPost,
            imagen_url: imagenUrlSerializada,
            empresa_destino: empresaDestinoCelebracion,
            departamento_destino: departamentoDestinoCelebracion,
          });

          if (!errInsert) {
            registroEmitidas[claveAniv] = new Date().toISOString();
            clavesPublicadas.push(claveAniv);
            huboCambios = true;
            await db.from("calendario_eventos_rh").upsert(
              {
                tipo: "registro_emision_anual",
                titulo: tituloPost,
                clave_emision: claveAniv,
              },
              { onConflict: "clave_emision" }
            );
          }
        }
      }
    }
  }

  if (huboCambios) {
    const actualizada: ConfigCalendarioRhStorage = {
      ...configActual,
      publicacionesAutomaticasEmitidas: registroEmitidas,
      updatedAt: new Date().toISOString(),
    };
    await guardarConfigCalendarioRhInterno(actualizada);
    return {
      config: actualizada,
      clavesPublicadas,
      clavesAbonosVacaciones,
      fechaMexico,
    };
  }

  return {
    config: configActual,
    clavesPublicadas,
    clavesAbonosVacaciones,
    fechaMexico,
  };
}

/**
 * Ejecuta las publicaciones automáticas de cumpleaños/aniversarios y el abono automático
 * de días de vacaciones LFT por aniversario laboral del día actual (America/Mexico_City).
 * Diseñada para invocarse desde el Cron diario de Vercel sin requerir sesión de usuario.
 */
export async function ejecutarPublicacionesCelebracionesHoyCron(): Promise<{
  ok: boolean;
  fechaMexico: string;
  publicadas: number;
  claves: string[];
  abonosVacaciones: number;
  clavesAbonos: string[];
  error?: string;
}> {
  try {
    const db = obtenerClienteDb();
    const [configRhInicial, { data: todosColaboradores, error: errColabs }] =
      await Promise.all([
        leerConfigCalendarioRhInterno(),
        db
          .from("colaboradores")
          .select("*")
          .order("nombre_completo", { ascending: true }),
      ]);

    if (errColabs) {
      return {
        ok: false,
        fechaMexico: obtenerFechaHoyMexico().fechaIso,
        publicadas: 0,
        claves: [],
        abonosVacaciones: 0,
        clavesAbonos: [],
        error: "No fue posible consultar la plantilla de colaboradores.",
      };
    }

    const colaboradoresActivos = (todosColaboradores ?? []).filter((c) =>
      esColaboradorActivo(c.estatus)
    );

    const resultado = await procesarPublicacionesAutomaticasHoy(
      colaboradoresActivos as unknown as Array<Record<string, unknown>>,
      configRhInicial,
      null
    );

    return {
      ok: true,
      fechaMexico: resultado.fechaMexico,
      publicadas: resultado.clavesPublicadas.length,
      claves: resultado.clavesPublicadas,
      abonosVacaciones: resultado.clavesAbonosVacaciones.length,
      clavesAbonos: resultado.clavesAbonosVacaciones,
    };
  } catch (err) {
    return {
      ok: false,
      fechaMexico: obtenerFechaHoyMexico().fechaIso,
      publicadas: 0,
      claves: [],
      abonosVacaciones: 0,
      clavesAbonos: [],
      error:
        err instanceof Error
          ? err.message
          : "Error inesperado al procesar publicaciones de celebración.",
    };
  }
}

export interface DatosCalendarioResponse {
  ok: boolean;
  error?: string;
  rolEfectivo: RolSistema;
  esJefatura: boolean;
  esRecursosHumanos: boolean;
  departamentoUsuario: string;
  empresaUsuario: string;
  eventos: EventoCalendario[];
  configRh: ConfigCalendarioRhStorage;
}

/**
 * Obtiene todos los eventos del Calendario filtrados estrictamente según el rol del usuario:
 * - Colaborador: Sus vacaciones autorizadas, su aniversario, cumpleaños de compañeros de su área y días feriados (LFT + Empresa).
 * - Jefatura: Vacaciones autorizadas, aniversarios y cumpleaños de sus subordinados directos y demás jefaturas (y propios),
 *             más días feriados (LFT + Empresa).
 * - Recursos Humanos: Todos los eventos de toda la plantilla + fechas conmemorativas programadas en el muro + panel de gestión.
 */
export async function obtenerDatosCalendarioAction(
  anioConsulta?: number
): Promise<DatosCalendarioResponse> {
  const anioBase = anioConsulta ?? new Date().getFullYear();
  const aniosGenerar = [anioBase - 1, anioBase, anioBase + 1];

  try {
    const sesion = await obtenerSesionYRol();
    if (!sesion) {
      return {
        ok: false,
        error: "Sesión no válida. Inicia sesión nuevamente.",
        rolEfectivo: "Colaborador",
        esJefatura: false,
        esRecursosHumanos: false,
        departamentoUsuario: "General",
        empresaUsuario: "AIF",
        eventos: [],
        configRh: cacheMemoriaCalendario,
      };
    }

    const db = obtenerClienteDb();

    const [
      configRhInicial,
      { data: todosColaboradores },
      { data: solicitudesAutorizadas },
    ] = await Promise.all([
      leerConfigCalendarioRhInterno(),
      db
        .from("colaboradores")
        .select("*")
        .order("nombre_completo", { ascending: true }),
      db
        .from("solicitudes")
        .select("*")
        .in("tipo_solicitud", ["Vacaciones", "Vacaciones Pagadas"])
        .in("estatus", ["Completado", "Aprobado_Jefe"]),
    ]);

    let configRh = configRhInicial;

    const colaboradoresActivos = (todosColaboradores ?? []).filter((c) =>
      esColaboradorActivo(c.estatus)
    );

    // Procesar publicaciones automáticas de cumpleaños/aniversario de hoy en el Muro (respaldo idempotente)
    const resultadoCelebraciones = await procesarPublicacionesAutomaticasHoy(
      colaboradoresActivos as unknown as Array<Record<string, unknown>>,
      configRh,
      sesion.userId
    );
    configRh = resultadoCelebraciones.config;

    const miPerfil = colaboradoresActivos.find((c) => c.id === sesion.userId);
    const miNombre =
      miPerfil?.nombre_completo?.trim() || sesion.nombreCompleto || "";
    const miNombreNorm = normalizarComparacion(miNombre);
    const miDepartamento =
      (
        miPerfil?.departamento ??
        miPerfil?.area ??
        sesion.departamento ??
        "General"
      ).trim() || "General";
    const miDepartamentoNorm = normalizarComparacion(miDepartamento);
    const miEmpresa =
      (miPerfil?.empresa ?? sesion.empresa ?? "AIF").trim().toUpperCase() ||
      "AIF";

    const esRH = sesion.rolSistema === "Recursos Humanos";
    const misSubordinados = colaboradoresActivos.filter((c) =>
      perteneceAEquipoDirecto(
        c as unknown as Record<string, unknown>,
        sesion.userId,
        miNombreNorm
      )
    );
    const idsSubordinados = new Set(misSubordinados.map((s) => s.id));
    const esJefatura =
      sesion.rolSistema === "Jefatura" ||
      sesion.esJefatura ||
      Boolean(miPerfil?.es_jefatura) ||
      idsSubordinados.size > 0;

    const mapaColaboradores = new Map(
      colaboradoresActivos.map((c) => [c.id, c])
    );

    // Precalcular en O(N) qué colaboradores son Jefatura o tienen subordinados directos
    const referenciasJefesConEquipo = new Set<string>();
    for (const otro of colaboradoresActivos) {
      const otroRaw = otro as unknown as Record<string, unknown>;
      const colJefeId = normalizarComparacion(otroRaw.jefe_directo_id);
      const colJefeTexto = normalizarComparacion(otroRaw.jefe_directo);
      if (colJefeId) referenciasJefesConEquipo.add(colJefeId);
      if (colJefeTexto) referenciasJefesConEquipo.add(colJefeTexto);
    }

    const idsColaboradoresJefatura = new Set<string>();
    for (const colab of colaboradoresActivos) {
      const colabRaw = colab as unknown as Record<string, unknown>;
      const idNorm = normalizarComparacion(colab.id);
      const nombreNorm = normalizarComparacion(colab.nombre_completo);
      if (
        esColaboradorJefatura(colabRaw) ||
        (idNorm && referenciasJefesConEquipo.has(idNorm)) ||
        (nombreNorm && referenciasJefesConEquipo.has(nombreNorm))
      ) {
        idsColaboradoresJefatura.add(colab.id);
      }
    }

    const eventos: EventoCalendario[] = [];

    // 1. VACACIONES AUTORIZADAS según rol:
    // - Colaborador común: solo sus propias vacaciones autorizadas
    // - Jefatura: todas las vacaciones autorizadas de sus subordinados, demás jefaturas y las propias
    // - RH: todas las vacaciones autorizadas de toda la empresa
    for (const sol of solicitudesAutorizadas ?? []) {
      const colabId = String(sol.colaborador_id ?? "");
      const colab = mapaColaboradores.get(colabId);
      if (!colab) continue;

      const esPropia = colabId === sesion.userId;
      const esDeSubordinado = idsSubordinados.has(colabId);
      const esOtraJefatura = idsColaboradoresJefatura.has(colabId);

      const puedeVerVacacion =
        esRH ||
        (esJefatura && (esDeSubordinado || esOtraJefatura || esPropia)) ||
        esPropia;

      if (!puedeVerVacacion) continue;

      const nombreColab =
        colab.nombre_completo?.trim() ||
        `${colab.nombre ?? ""} ${colab.apellidos ?? ""}`.trim() ||
        "Colaborador";
      const depColab =
        (colab.departamento ?? colab.area ?? "General").trim() || "General";
      const empColab = (colab.empresa ?? "AIF").trim() || "AIF";

      eventos.push({
        id: `vac-${sol.id}`,
        tipo: "vacaciones",
        fechaInicio: sol.fecha_inicio,
        fechaFin: sol.fecha_fin || sol.fecha_inicio,
        titulo: esPropia
          ? `Mis Vacaciones (${sol.tipo_solicitud})`
          : `Vacaciones · ${nombreColab}`,
        subtitulo: `${depColab} · ${empColab}${
          esOtraJefatura && !esDeSubordinado && !esPropia ? " · Jefatura" : ""
        }`,
        descripcion:
          sol.motivo ||
          `${sol.tipo_solicitud} autorizada del ${sol.fecha_inicio} al ${sol.fecha_fin}`,
        colaboradorId: colabId,
        nombreColaborador: nombreColab,
        departamento: depColab,
        empresa: empColab,
        esPropio: esPropia,
      });
    }

    // 2. ANIVERSARIOS Y CUMPLEAÑOS por cada año visible
    for (const anio of aniosGenerar) {
      for (const colab of colaboradoresActivos) {
        const esPropio = colab.id === sesion.userId;
        const esSubordinado = idsSubordinados.has(colab.id);
        const esOtraJefatura = idsColaboradoresJefatura.has(colab.id);

        const depColab =
          (colab.departamento ?? colab.area ?? "General").trim() || "General";
        const depColabNorm = normalizarComparacion(depColab);
        const esMismaArea =
          Boolean(miDepartamentoNorm) && depColabNorm === miDepartamentoNorm;

        const nombreColab =
          colab.nombre_completo?.trim() ||
          `${colab.nombre ?? ""} ${colab.apellidos ?? ""}`.trim() ||
          "Colaborador";
        const empColab = (colab.empresa ?? "AIF").trim() || "AIF";

        // 2A. ANIVERSARIO LABORAL:
        // - Colaborador común: su propio aniversario
        // - Jefatura: aniversarios de sus subordinados, demás jefaturas y el propio
        // - RH: todos los aniversarios
        const puedeVerAniversario =
          esRH ||
          (esJefatura && (esSubordinado || esOtraJefatura || esPropio)) ||
          esPropio;

        if (puedeVerAniversario) {
          const datosIngreso = extraerDiaYMesIngreso(colab.fecha_ingreso);
          if (datosIngreso && anio >= datosIngreso.anioIngreso) {
            const aniosCumplidos = anio - datosIngreso.anioIngreso;
            const fechaAniv = formatearFechaIso(
              anio,
              datosIngreso.mes,
              datosIngreso.dia
            );

            eventos.push({
              id: `aniv-${anio}-${colab.id}`,
              tipo: "aniversario",
              fechaInicio: fechaAniv,
              fechaFin: fechaAniv,
              titulo:
                aniosCumplidos === 0
                  ? `Ingreso a ${empColab} · ${nombreColab}`
                  : esPropio
                  ? `🏆 Mi ${aniosCumplidos}° Aniversario en ${empColab}`
                  : `🏆 ${aniosCumplidos}° Aniversario · ${nombreColab}`,
              subtitulo: `${depColab} · ${empColab}${
                esOtraJefatura && !esSubordinado && !esPropio ? " · Jefatura" : ""
              }`,
              descripcion:
                aniosCumplidos === 0
                  ? `Fecha de ingreso a la organización (${colab.fecha_ingreso}).`
                  : `${nombreColab} cumple ${aniosCumplidos} ${
                      aniosCumplidos === 1 ? "año" : "años"
                    } de trayectoria en ${empColab}.`,
              colaboradorId: colab.id,
              nombreColaborador: nombreColab,
              departamento: depColab,
              empresa: empColab,
              esPropio,
              aniosServicio: aniosCumplidos,
            });
          }
        }

        // 2B. CUMPLEAÑOS:
        // - Colaborador común: cumpleaños de sus compañeros de área (y el suyo)
        // - Jefatura: cumpleaños de sus subordinados y demás jefaturas (y el suyo, y compañeros de área si aplica)
        // - RH: todos los cumpleaños
        const puedeVerCumpleanos =
          esRH ||
          (esJefatura && (esSubordinado || esOtraJefatura || esPropio)) ||
          (!esJefatura && (esMismaArea || esPropio));

        if (puedeVerCumpleanos) {
          const diaCumple = Number(colab.dia_cumpleanos ?? 0);
          const mesCumple = parsearMesCumpleanos(colab.mes_cumpleanos);

          if (
            diaCumple >= 1 &&
            diaCumple <= 31 &&
            mesCumple &&
            mesCumple >= 1 &&
            mesCumple <= 12
          ) {
            const fechaCumple = formatearFechaIso(anio, mesCumple, diaCumple);
            eventos.push({
              id: `cumple-${anio}-${colab.id}`,
              tipo: "cumpleanos",
              fechaInicio: fechaCumple,
              fechaFin: fechaCumple,
              titulo: esPropio
                ? `🎂 ¡Mi Cumpleaños!`
                : `🎂 Cumpleaños · ${nombreColab}`,
              subtitulo: `${depColab} · ${empColab}${
                esOtraJefatura && !esSubordinado && !esPropio ? " · Jefatura" : ""
              }`,
              descripcion: `Celebración de cumpleaños de ${nombreColab} (${depColab}).`,
              colaboradorId: colab.id,
              nombreColaborador: nombreColab,
              departamento: depColab,
              empresa: empColab,
              esPropio,
            });
          }
        }
      }

      // 3. DÍAS FERIADOS OFICIALES DE ACUERDO A LA LFT (todos los usuarios)
      for (const feriadoLft of obtenerFeriadosLftPorAnio(anio)) {
        eventos.push({
          id: `lft-${feriadoLft.fecha}`,
          tipo: "feriado_lft",
          fechaInicio: feriadoLft.fecha,
          fechaFin: feriadoLft.fecha,
          titulo: `🇲🇽 ${feriadoLft.titulo}`,
          subtitulo: "Día Feriado Oficial · LFT",
          descripcion: feriadoLft.fundamento,
          empresa: "Ambas",
        });
      }

      // 4. DÍAS FERIADOS DINÁMICOS DE LA EMPRESA (creados por RH)
      for (const feriadoEmp of configRh.feriadosDinamicos) {
        const empDestino = (feriadoEmp.empresaDestino ?? "Ambas")
          .trim()
          .toUpperCase();
        const aplicaUsuario =
          esRH || empDestino === "AMBAS" || empDestino === miEmpresa;
        if (!aplicaUsuario) continue;

        const partes = (feriadoEmp.fecha ?? "").slice(0, 10).split("-");
        if (partes.length !== 3) continue;

        const fechaEfectiva = feriadoEmp.esRecurrenteAnual
          ? `${anio}-${partes[1]}-${partes[2]}`
          : `${partes[0]}-${partes[1]}-${partes[2]}`;

        if (!fechaEfectiva.startsWith(`${anio}-`)) continue;

        eventos.push({
          id: `emp-feriado-${anio}-${feriadoEmp.id}`,
          tipo: "feriado_empresa",
          fechaInicio: fechaEfectiva,
          fechaFin: fechaEfectiva,
          titulo: `⭐ ${feriadoEmp.titulo}`,
          subtitulo:
            feriadoEmp.empresaDestino === "Ambas"
              ? "Feriado Institucional · AIF y ROYAL"
              : `Feriado Institucional · ${feriadoEmp.empresaDestino}`,
          descripcion:
            feriadoEmp.descripcion ||
            "Día inhábil otorgado por la empresa (configurado por Recursos Humanos).",
          empresa: feriadoEmp.empresaDestino,
        });
      }
    }

    // 5. FECHAS CONMEMORATIVAS DEL MURO (visibles en calendario para RH y para la audiencia correspondiente)
    for (const conm of configRh.fechasConmemorativas) {
      const empDestino = (conm.empresaDestino ?? "Ambas").trim().toUpperCase();
      const aplicaUsuario =
        esRH || empDestino === "AMBAS" || empDestino === miEmpresa;
      if (!aplicaUsuario) continue;

      eventos.push({
        id: `conm-${conm.id}`,
        tipo: "conmemorativo_muro",
        fechaInicio: conm.fecha,
        fechaFin: conm.fecha,
        titulo: `🎉 ${conm.titulo}`,
        subtitulo: `Conmemoración en Muro · ${conm.empresaDestino}`,
        descripcion: conm.contenido,
        empresa: conm.empresaDestino,
        departamento: conm.departamentoDestino,
        imagenesUrls: conm.imagenesUrls,
      });
    }

    return {
      ok: true,
      rolEfectivo: sesion.rolSistema,
      esJefatura,
      esRecursosHumanos: esRH,
      departamentoUsuario: miDepartamento,
      empresaUsuario: miEmpresa,
      eventos,
      configRh,
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "No fue posible cargar el Calendario Corporativo.",
      rolEfectivo: "Colaborador",
      esJefatura: false,
      esRecursosHumanos: false,
      departamentoUsuario: "General",
      empresaUsuario: "AIF",
      eventos: [],
      configRh: cacheMemoriaCalendario,
    };
  }
}

/**
 * Evalúa si el colaborador que inicia sesión tiene una felicitación privada (`GreetingOverlay`, Enfoque 2)
 * de cumpleaños o aniversario hoy, O si su cumpleaños/aniversario cayó en los últimos 2 días inhábiles
 * (sábado, domingo o feriado LFT/Empresa) para que reciba su sorpresa el primer día hábil al iniciar sesión.
 */
export async function obtenerCelebracionesPrivadasHoyAction(): Promise<
  CelebracionPrivadaOverlay[]
> {
  try {
    const sesion = await obtenerSesionYRol();
    if (!sesion) return [];

    const db = obtenerClienteDb();
    const [ { data: colab }, configRh ] = await Promise.all([
      db
        .from("colaboradores")
        .select("*")
        .eq("id", sesion.userId)
        .maybeSingle(),
      leerConfigCalendarioRhInterno(),
    ]);

    if (!colab) return [];

    const nombreCompleto =
      colab.nombre_completo?.trim() ||
      `${colab.nombre ?? ""} ${colab.apellidos ?? ""}`.trim() ||
      sesion.nombreCompleto ||
      "Colaborador";
    const primerNombre = nombreCompleto.split(/\s+/)[0] || nombreCompleto;
    const departamento =
      (colab.departamento ?? colab.area ?? "General").trim() || "General";
    const puesto = (colab.puesto ?? "Colaborador").trim() || "Colaborador";
    const empresa = (colab.empresa ?? "AIF").trim() || "AIF";

    const hoy = new Date();
    const anioHoy = hoy.getFullYear();
    const mapaFeriados = construirMapaFeriadosPorAnio(
      anioHoy,
      configRh.feriadosDinamicos,
      empresa
    );

    // Construir ventana de fechas candidatas:
    // - Siempre incluye HOY.
    // - Si ayer / anteayer fueron fin de semana (sáb/dom) o día feriado, también se incluyen
    //   para que quien cumplió años en día inhábil reciba su GreetingOverlay al iniciar sesión.
    const fechasCandidatas: Array<{ anio: number; mes: number; dia: number; iso: string }> = [];
    for (let offset = 0; offset <= 3; offset++) {
      const fechaCheck = new Date(
        hoy.getFullYear(),
        hoy.getMonth(),
        hoy.getDate() - offset
      );
      const y = fechaCheck.getFullYear();
      const m = fechaCheck.getMonth() + 1;
      const d = fechaCheck.getDate();
      const iso = formatearFechaIso(y, m, d);

      if (offset === 0) {
        fechasCandidatas.push({ anio: y, mes: m, dia: d, iso });
      } else {
        const diaSemana = fechaCheck.getDay(); // 0 = Dom, 6 = Sáb
        const esInhabil = diaSemana === 0 || diaSemana === 6 || mapaFeriados.has(iso);
        if (esInhabil) {
          fechasCandidatas.push({ anio: y, mes: m, dia: d, iso });
        } else {
          // Si ya hubo un día hábil intermedio, detenemos la búsqueda hacia atrás
          break;
        }
      }
    }

    const celebracionesActivas: CelebracionPrivadaOverlay[] = [];

    // 1. Verificar Cumpleaños del colaborador logueado
    if (configRh.celebraciones.cumpleanos.mostrarOverlayPrivado) {
      const diaCumple = Number(colab.dia_cumpleanos ?? 0);
      const mesCumple = parsearMesCumpleanos(colab.mes_cumpleanos);

      const coincidenciaCumple = fechasCandidatas.find(
        (f) => f.dia === diaCumple && f.mes === mesCumple
      );

      if (coincidenciaCumple) {
        const cfg = configRh.celebraciones.cumpleanos;
        celebracionesActivas.push({
          idCelebracionAnual: `cumpleanos-${coincidenciaCumple.anio}-${colab.id}`,
          tipo: "cumpleanos",
          fechaCelebracion: coincidenciaCumple.iso,
          titulo: reemplazarVariablesPlantilla(cfg.tituloPlantilla, {
            nombre: nombreCompleto,
            primer_nombre: primerNombre,
            puesto,
            departamento,
            empresa,
          }),
          mensaje: reemplazarVariablesPlantilla(cfg.mensajePlantilla, {
            nombre: nombreCompleto,
            primer_nombre: primerNombre,
            puesto,
            departamento,
            empresa,
          }),
          imagenesUrls: cfg.imagenesPlantilla,
          nombreColaborador: nombreCompleto,
          primerNombre,
          departamento,
          empresa,
        });
      }
    }

    // 2. Verificar Aniversario laboral del colaborador logueado
    if (configRh.celebraciones.aniversario.mostrarOverlayPrivado) {
      const datosIngreso = extraerDiaYMesIngreso(colab.fecha_ingreso);
      if (datosIngreso) {
        const coincidenciaAniv = fechasCandidatas.find(
          (f) =>
            f.dia === datosIngreso.dia &&
            f.mes === datosIngreso.mes &&
            f.anio > datosIngreso.anioIngreso
        );

        if (coincidenciaAniv) {
          const aniosServicio =
            coincidenciaAniv.anio - datosIngreso.anioIngreso;
          const cfg = configRh.celebraciones.aniversario;
          celebracionesActivas.push({
            idCelebracionAnual: `aniversario-${coincidenciaAniv.anio}-${colab.id}`,
            tipo: "aniversario",
            fechaCelebracion: coincidenciaAniv.iso,
            titulo: reemplazarVariablesPlantilla(cfg.tituloPlantilla, {
              nombre: nombreCompleto,
              primer_nombre: primerNombre,
              puesto,
              departamento,
              empresa,
              anios_servicio: aniosServicio,
            }),
            mensaje: reemplazarVariablesPlantilla(cfg.mensajePlantilla, {
              nombre: nombreCompleto,
              primer_nombre: primerNombre,
              puesto,
              departamento,
              empresa,
              anios_servicio: aniosServicio,
            }),
            imagenesUrls: cfg.imagenesPlantilla,
            nombreColaborador: nombreCompleto,
            primerNombre,
            departamento,
            empresa,
            aniosServicio,
          });
        }
      }
    }

    return celebracionesActivas;
  } catch {
    return [];
  }
}

export async function agregarFeriadoDinamicoAction(payload: {
  fecha: string;
  titulo: string;
  descripcion?: string;
  empresaDestino: "Ambas" | "AIF" | "ROYAL";
  esRecurrenteAnual: boolean;
}): Promise<{ ok: boolean; error?: string; config?: ConfigCalendarioRhStorage }> {
  try {
    const sesion = await obtenerSesionYRol();
    if (!sesion || sesion.rolSistema !== "Recursos Humanos") {
      return {
        ok: false,
        error: "Solo Recursos Humanos puede dar de alta días feriados dinámicos.",
      };
    }

    const fechaLimpia = payload.fecha.trim().slice(0, 10);
    const tituloLimpio = payload.titulo.trim();
    if (!fechaLimpia || !tituloLimpio) {
      return {
        ok: false,
        error: "La fecha y el nombre del día feriado son obligatorios.",
      };
    }

    const db = obtenerClienteDb();
    const autorNombre = sesion.nombreCompleto || sesion.email || "RH";

    // 1. Insertar en la tabla `public.calendario_eventos_rh`
    const { data: insertadoTabla } = await db
      .from("calendario_eventos_rh")
      .insert({
        tipo: "feriado_empresa",
        fecha: fechaLimpia,
        titulo: tituloLimpio,
        contenido: payload.descripcion?.trim() || null,
        empresa_destino: payload.empresaDestino,
        es_recurrente_anual: Boolean(payload.esRecurrenteAnual),
        creado_por: autorNombre,
      })
      .select("id, created_at")
      .maybeSingle();

    const actual = await leerConfigCalendarioRhInterno();
    const idNuevo =
      insertadoTabla?.id ??
      `feriado-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const yaEstaEnLista = actual.feriadosDinamicos.some(
      (f) => f.id === idNuevo
    );

    const nuevoItem: FeriadoEmpresaItem = {
      id: idNuevo,
      fecha: fechaLimpia,
      titulo: tituloLimpio,
      descripcion: payload.descripcion?.trim() || null,
      empresaDestino: payload.empresaDestino,
      esRecurrenteAnual: Boolean(payload.esRecurrenteAnual),
      creadoPor: autorNombre,
      createdAt: insertadoTabla?.created_at ?? new Date().toISOString(),
    };

    const nuevaConfig: ConfigCalendarioRhStorage = {
      ...actual,
      feriadosDinamicos: (yaEstaEnLista
        ? actual.feriadosDinamicos
        : [...actual.feriadosDinamicos, nuevoItem]
      ).sort((a, b) => a.fecha.localeCompare(b.fecha)),
      updatedAt: new Date().toISOString(),
    };

    await guardarConfigCalendarioRhInterno(nuevaConfig);
    revalidatePath("/dashboard/calendario");
    revalidatePath("/dashboard/solicitudes");
    return { ok: true, config: nuevaConfig };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "No se pudo guardar el día feriado.",
    };
  }
}

export async function eliminarFeriadoDinamicoAction(
  idFeriado: string
): Promise<{ ok: boolean; error?: string; config?: ConfigCalendarioRhStorage }> {
  try {
    const sesion = await obtenerSesionYRol();
    if (!sesion || sesion.rolSistema !== "Recursos Humanos") {
      return {
        ok: false,
        error: "Solo Recursos Humanos puede eliminar días feriados.",
      };
    }

    const db = obtenerClienteDb();
    await db.from("calendario_eventos_rh").delete().eq("id", idFeriado);

    const actual = await leerConfigCalendarioRhInterno();
    const nuevaConfig: ConfigCalendarioRhStorage = {
      ...actual,
      feriadosDinamicos: actual.feriadosDinamicos.filter(
        (f) => f.id !== idFeriado
      ),
      updatedAt: new Date().toISOString(),
    };

    await guardarConfigCalendarioRhInterno(nuevaConfig);
    revalidatePath("/dashboard/calendario");
    revalidatePath("/dashboard/solicitudes");
    return { ok: true, config: nuevaConfig };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "No se pudo eliminar el día feriado.",
    };
  }
}

export async function guardarConfigCelebracionesRhAction(
  celebraciones: ConfigCelebracionesRh
): Promise<{ ok: boolean; error?: string; config?: ConfigCalendarioRhStorage }> {
  try {
    const sesion = await obtenerSesionYRol();
    if (!sesion || sesion.rolSistema !== "Recursos Humanos") {
      return {
        ok: false,
        error:
          "Solo Recursos Humanos puede actualizar las plantillas de cumpleaños y aniversarios.",
      };
    }

    const db = obtenerClienteDb();
    const autorNombre = sesion.nombreCompleto || sesion.email || "RH";

    // Sincronizar con `public.calendario_eventos_rh`
    await db
      .from("calendario_eventos_rh")
      .delete()
      .in("tipo", ["plantilla_cumpleanos", "plantilla_aniversario"]);

    await db.from("calendario_eventos_rh").insert([
      {
        tipo: "plantilla_cumpleanos",
        titulo: celebraciones.cumpleanos.tituloPlantilla,
        contenido: celebraciones.cumpleanos.mensajePlantilla,
        publicar_en_muro: celebraciones.cumpleanos.publicarEnMuro,
        mostrar_overlay_privado:
          celebraciones.cumpleanos.mostrarOverlayPrivado,
        alcance_muro: celebraciones.cumpleanos.alcanceMuro,
        imagenes_urls: celebraciones.cumpleanos.imagenesPlantilla,
        creado_por: autorNombre,
      },
      {
        tipo: "plantilla_aniversario",
        titulo: celebraciones.aniversario.tituloPlantilla,
        contenido: celebraciones.aniversario.mensajePlantilla,
        publicar_en_muro: celebraciones.aniversario.publicarEnMuro,
        mostrar_overlay_privado:
          celebraciones.aniversario.mostrarOverlayPrivado,
        alcance_muro: celebraciones.aniversario.alcanceMuro,
        imagenes_urls: celebraciones.aniversario.imagenesPlantilla,
        creado_por: autorNombre,
      },
    ]);

    const actual = await leerConfigCalendarioRhInterno();
    const nuevaConfig: ConfigCalendarioRhStorage = {
      ...actual,
      celebraciones,
      updatedAt: new Date().toISOString(),
    };

    await guardarConfigCalendarioRhInterno(nuevaConfig);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/calendario");
    revalidatePath("/dashboard/muro");
    return { ok: true, config: nuevaConfig };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "No se pudo guardar la configuración de celebraciones.",
    };
  }
}

export async function programarPublicacionConmemorativaAction(payload: {
  fecha: string; // "YYYY-MM-DD"
  titulo: string;
  contenido: string;
  imagenesUrls: string[];
  empresaDestino: "Ambas" | "AIF" | "ROYAL";
  departamentoDestino: string;
  requiereAcuse: boolean;
}): Promise<{ ok: boolean; error?: string; config?: ConfigCalendarioRhStorage }> {
  try {
    const sesion = await obtenerSesionYRol();
    if (!sesion || sesion.rolSistema !== "Recursos Humanos") {
      return {
        ok: false,
        error:
          "Solo Recursos Humanos puede programar publicaciones conmemorativas.",
      };
    }

    const fechaLimpia = payload.fecha.trim().slice(0, 10);
    const tituloLimpio = payload.titulo.trim();
    const contenidoLimpio = payload.contenido.trim();

    if (!fechaLimpia || !tituloLimpio || !contenidoLimpio) {
      return {
        ok: false,
        error: "La fecha, el título y el mensaje conmemorativo son obligatorios.",
      };
    }

    const db = obtenerClienteDb();
    const fechaPublicacionIso = new Date(`${fechaLimpia}T08:00:00`).toISOString();
    const imagenSerializada = serializarUrlsImagenes(payload.imagenesUrls);

    // Insertar también en `muro_publicaciones` con `fecha_publicacion` en la fecha conmemorativa
    // para que aparezca automáticamente en el Muro Corporativo en esa fecha especial
    const { data: pubInsertada, error: pubError } = await db
      .from("muro_publicaciones")
      .insert({
        titulo: tituloLimpio,
        contenido: contenidoLimpio,
        requiere_acuse: payload.requiereAcuse,
        autor_id: sesion.userId,
        imagen_url: imagenSerializada,
        fecha_publicacion: fechaPublicacionIso,
        empresa_destino: payload.empresaDestino,
        departamento_destino: payload.departamentoDestino || "Todos",
      })
      .select("id")
      .maybeSingle();

    if (pubError) {
      return {
        ok: false,
        error: `No se pudo programar la publicación en el Muro: ${pubError.message}`,
      };
    }

    const autorNombre = sesion.nombreCompleto || sesion.email || "RH";
    const { data: conmInsertadoTabla } = await db
      .from("calendario_eventos_rh")
      .insert({
        tipo: "conmemorativo_muro",
        fecha: fechaLimpia,
        titulo: tituloLimpio,
        contenido: contenidoLimpio,
        empresa_destino: payload.empresaDestino,
        departamento_destino: payload.departamentoDestino || "Todos",
        requiere_acuse: payload.requiereAcuse,
        imagenes_urls: payload.imagenesUrls,
        muro_publicacion_id: pubInsertada?.id ?? null,
        creado_por: autorNombre,
      })
      .select("id, created_at")
      .maybeSingle();

    const actual = await leerConfigCalendarioRhInterno();
    const idNuevoConm =
      conmInsertadoTabla?.id ??
      `conm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const yaExisteConm = actual.fechasConmemorativas.some(
      (c) => c.id === idNuevoConm
    );

    const nuevoConm: FechaConmemorativaMuroItem = {
      id: idNuevoConm,
      fecha: fechaLimpia,
      titulo: tituloLimpio,
      contenido: contenidoLimpio,
      imagenesUrls: payload.imagenesUrls,
      empresaDestino: payload.empresaDestino,
      departamentoDestino: payload.departamentoDestino || "Todos",
      requiereAcuse: payload.requiereAcuse,
      muroPublicacionId: pubInsertada?.id ?? null,
      creadoPor: autorNombre,
      createdAt: conmInsertadoTabla?.created_at ?? new Date().toISOString(),
    };

    const nuevaConfig: ConfigCalendarioRhStorage = {
      ...actual,
      fechasConmemorativas: (yaExisteConm
        ? actual.fechasConmemorativas
        : [...actual.fechasConmemorativas, nuevoConm]
      ).sort((a, b) => a.fecha.localeCompare(b.fecha)),
      updatedAt: new Date().toISOString(),
    };

    await guardarConfigCalendarioRhInterno(nuevaConfig);
    revalidatePath("/dashboard/calendario");
    revalidatePath("/dashboard/muro");
    return { ok: true, config: nuevaConfig };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "No se pudo programar la fecha conmemorativa.",
    };
  }
}

export async function eliminarFechaConmemorativaAction(
  idConmemorativo: string
): Promise<{ ok: boolean; error?: string; config?: ConfigCalendarioRhStorage }> {
  try {
    const sesion = await obtenerSesionYRol();
    if (!sesion || sesion.rolSistema !== "Recursos Humanos") {
      return {
        ok: false,
        error: "Solo Recursos Humanos puede eliminar fechas conmemorativas.",
      };
    }

    const db = obtenerClienteDb();
    const actual = await leerConfigCalendarioRhInterno();
    const encontrado = actual.fechasConmemorativas.find(
      (c) => c.id === idConmemorativo
    );

    if (encontrado?.muroPublicacionId) {
      await db
        .from("muro_publicaciones")
        .delete()
        .eq("id", encontrado.muroPublicacionId);
    }

    await db.from("calendario_eventos_rh").delete().eq("id", idConmemorativo);

    const nuevaConfig: ConfigCalendarioRhStorage = {
      ...actual,
      fechasConmemorativas: actual.fechasConmemorativas.filter(
        (c) => c.id !== idConmemorativo
      ),
      updatedAt: new Date().toISOString(),
    };

    await guardarConfigCalendarioRhInterno(nuevaConfig);
    revalidatePath("/dashboard/calendario");
    revalidatePath("/dashboard/muro");
    return { ok: true, config: nuevaConfig };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "No se pudo eliminar la fecha conmemorativa.",
    };
  }
}
