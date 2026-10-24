import { redirect } from "next/navigation";
import ClockPanel from "@/components/asistencia/ClockPanel";
import HistoryTable from "@/components/asistencia/HistoryTable";
import MapPlaceholder from "@/components/asistencia/MapPlaceholder";
import MetricsGrid from "@/components/asistencia/MetricsGrid";
import TicketOmisionModal from "@/components/asistencia/TicketOmisionModal";
import { MapPinIcon } from "@/components/ui/icons";
import { obtenerFechaHoyLocal } from "@/lib/asistencia";
import { COLABORADOR_MOCK, HORARIO_MOCK } from "@/lib/mock/asistencia";
import { createClient } from "@/lib/supabase/server";
import { normalizeZones } from "@/lib/utils/geo";
import type {
  Asistencia,
  EstatusAsistencia,
  MetricasAsistencia,
  UbicacionMarcaje,
} from "@/types/asistencia";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const LIMITE_RETARDOS = 3;

function normalizarEstatusAsistencia(
  valor: string | null | undefined
): EstatusAsistencia {
  const limpio = (valor ?? "").toLowerCase().trim();
  if (limpio.includes("justific")) return "justificado";
  if (limpio.includes("retardo")) return "retardo";
  if (limpio.includes("falta")) return "falta";
  return "a_tiempo";
}

function normalizarUbicacion(valor: unknown): UbicacionMarcaje | null {
  if (!valor || typeof valor !== "object") return null;
  const raw = valor as Record<string, unknown>;
  const lat =
    typeof raw.lat === "number"
      ? raw.lat
      : typeof raw.latitud === "number"
      ? raw.latitud
      : null;
  const lng =
    typeof raw.lng === "number"
      ? raw.lng
      : typeof raw.longitud === "number"
      ? raw.longitud
      : null;
  if (lat === null || lng === null) return null;

  const distancia =
    typeof raw.distancia_m === "number"
      ? raw.distancia_m
      : typeof raw.distancia_metros === "number"
      ? raw.distancia_metros
      : null;

  return {
    lat,
    lng,
    precision_m:
      typeof raw.precision_m === "number" ? raw.precision_m : undefined,
    capturado_en:
      typeof raw.capturado_en === "string"
        ? raw.capturado_en
        : new Date().toISOString(),
    fuente: raw.fuente === "simulada" ? "simulada" : "gps",
    dentro_de_zona:
      typeof raw.dentro_de_zona === "boolean" ? raw.dentro_de_zona : true,
    zona_id: typeof raw.zona_id === "string" ? raw.zona_id : null,
    zona_nombre: typeof raw.zona_nombre === "string" ? raw.zona_nombre : null,
    distancia_m: distancia,
  };
}

export default async function AsistenciaPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 1. Consultar `zonas_geocerca`, `nombre_completo` y `empresa` del colaborador en Supabase
  const { data: colaborador } = await supabase
    .from("colaboradores")
    .select("nombre_completo, empresa, zonas_geocerca")
    .eq("id", user.id)
    .maybeSingle();

  const nombreColaborador =
    colaborador?.nombre_completo || user.email || "Colaborador";
  const empresaColaborador = colaborador?.empresa || "AIF";

  const zonasNormalizadas = normalizeZones(colaborador?.zonas_geocerca);
  const zonas =
    zonasNormalizadas.length > 0
      ? zonasNormalizadas
      : COLABORADOR_MOCK.zonas_geocerca;

  // 2. Consultar estrictamente el registro de asistencia para la fecha local de HOY (YYYY-MM-DD)
  const hoyIso = obtenerFechaHoyLocal();

  const { data: registroHoy } = await supabase
    .from("asistencias")
    .select("id, fecha, hora_entrada, hora_salida, ubicacion_entrada")
    .eq("colaborador_id", user.id)
    .eq("fecha", hoyIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const tieneRegistroHoy =
    Boolean(registroHoy) && registroHoy?.fecha === hoyIso;
  const asistenciaHoyId = tieneRegistroHoy ? (registroHoy?.id ?? null) : null;
  const horaEntradaHoy = tieneRegistroHoy
    ? (registroHoy?.hora_entrada ?? null)
    : null;
  const horaSalidaHoy = tieneRegistroHoy
    ? (registroHoy?.hora_salida ?? null)
    : null;
  const yaMarcoHoy = Boolean(horaEntradaHoy);
  const ubicacionHoy = tieneRegistroHoy
    ? normalizarUbicacion(registroHoy?.ubicacion_entrada)
    : null;

  // 3. Consultar los últimos 20 registros reales de `asistencias` del colaborador
  const { data: historialDb } = await supabase
    .from("asistencias")
    .select(
      "id, colaborador_id, fecha, hora_entrada, hora_salida, estatus, ubicacion_entrada, ubicacion_salida"
    )
    .eq("colaborador_id", user.id)
    .order("fecha", { ascending: false })
    .limit(20);

  const registrosHistorial: Asistencia[] = (historialDb ?? []).map((fila) => ({
    id: fila.id,
    colaborador_id: fila.colaborador_id,
    fecha: fila.fecha,
    hora_entrada: fila.hora_entrada ? fila.hora_entrada.slice(0, 5) : null,
    hora_salida: fila.hora_salida ? fila.hora_salida.slice(0, 5) : null,
    estatus: normalizarEstatusAsistencia(fila.estatus),
    ubicacion_entrada: normalizarUbicacion(fila.ubicacion_entrada),
    ubicacion_salida: normalizarUbicacion(fila.ubicacion_salida),
  }));

  // 4. Calcular métricas dinámicamente a partir del historial real
  const retardosCount = registrosHistorial.filter(
    (r) => r.estatus === "retardo"
  ).length;

  const faltasDirectasCount = registrosHistorial.filter(
    (r) => r.estatus === "falta"
  ).length;

  const alertasFueraDeRangoCount = registrosHistorial.filter(
    (r) =>
      r.ubicacion_entrada?.dentro_de_zona === false ||
      r.ubicacion_salida?.dentro_de_zona === false
  ).length;

  const omisionesCount = registrosHistorial.filter(
    (r) => r.fecha !== hoyIso && Boolean(r.hora_entrada) && !r.hora_salida
  ).length;

  const metricasReales: MetricasAsistencia = {
    retardos_quincena: retardosCount,
    limite_retardos: LIMITE_RETARDOS,
    faltas_injustificadas: faltasDirectasCount,
    alertas_fuera_de_rango: alertasFueraDeRangoCount,
    omisiones: omisionesCount,
  };

  return (
    <div className="flex flex-col px-12 py-8">
      {/* Encabezado */}
      <header className="mb-8 flex items-start justify-between">
        <div className="flex flex-col gap-2">
          <div className="inline-flex items-center gap-3">
            <span className="rounded-sm bg-brand-dark px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
              CONTROL DE ASISTENCIA &amp; GEOLOCALIZACIÓN
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              TOLERANCIA {HORARIO_MOCK.tolerancia_min} MIN •{" "}
              {LIMITE_RETARDOS} RETARDOS = 1 FALTA
            </span>
          </div>
          <h1 className="font-serif text-3xl font-black text-gray-900">
            Registro de Asistencia
          </h1>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            MARCAJE DE JORNADA EN TIEMPO REAL CON VALIDACIÓN GEOGRÁFICA
          </p>
        </div>

        <TicketOmisionModal
          userId={user.id}
          nombreColaborador={nombreColaborador}
          empresaColaborador={empresaColaborador}
          fechaHoy={hoyIso}
        />
      </header>

      {/* Layout 2 columnas */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-5">
          <ClockPanel
            zonas={zonas}
            zonas_geocerca={colaborador?.zonas_geocerca ?? zonas}
            horario={HORARIO_MOCK}
            userId={user.id}
            asistenciaHoyId={asistenciaHoyId}
            yaMarcoHoy={yaMarcoHoy}
            horaEntradaHoy={horaEntradaHoy}
            horaSalidaHoy={horaSalidaHoy}
          />

          {/* Tarjeta: Tus Ubicaciones Autorizadas (reemplaza al Simulador GPS) */}
          <section className="rounded-md bg-brand-surface p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-widest text-gray-900">
                Tus Ubicaciones Autorizadas
              </h2>
              <span className="rounded-sm bg-brand-beige px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gray-600">
                {zonas.length} {zonas.length === 1 ? "ZONA" : "ZONAS"}
              </span>
            </div>

            {zonas.length === 0 ? (
              <p className="py-4 text-center text-xs font-medium text-gray-400">
                No tienes ubicaciones autorizadas asignadas aún.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {zonas.map((zona) => (
                  <li
                    key={zona.id}
                    className="flex items-start justify-between gap-3 py-3 first:pt-1 last:pb-1"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-dark text-brand-gold">
                        <MapPinIcon className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-900">
                          {zona.nombre}
                        </p>
                        <p className="mt-0.5 font-mono text-[10px] text-gray-400">
                          Lat: {zona.lat.toFixed(5)} · Lng:{" "}
                          {zona.lng.toFixed(5)}
                        </p>
                      </div>
                    </div>

                    <span className="shrink-0 rounded-sm border border-status-success/30 bg-status-success/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase text-status-success">
                      Radio {zona.radio_m || 50}m
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="flex min-w-0 flex-col lg:col-span-7">
          <MetricsGrid metricas={metricasReales} />
          <MapPlaceholder
            zonas={zonas}
            ubicacionInicial={
              ubicacionHoy
                ? { lat: ubicacionHoy.lat, lng: ubicacionHoy.lng }
                : null
            }
          />
          <HistoryTable registros={registrosHistorial} />
        </div>
      </div>
    </div>
  );
}
