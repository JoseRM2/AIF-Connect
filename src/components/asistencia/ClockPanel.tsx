"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  MapPinIcon,
} from "@/components/ui/icons";
import {
  calcularEstatusEntrada,
  calcularMinutosDescanso,
  formatFechaLarga,
  formatHora12,
  formatReloj,
  horaLimite,
  LIMITE_DESCANSO_MINUTOS,
  obtenerFechaHoyLocal,
  parsearHoraAMinutos,
} from "@/lib/asistencia";
import { createClient } from "@/lib/supabase/client";
import {
  calcularDistancia,
  evaluateGeofence,
  normalizeZones,
} from "@/lib/utils/geo";
import type {
  GeoPoint,
  HorarioLaboral,
  UbicacionMarcaje,
  ZonaGeocerca,
} from "@/types/asistencia";
import type { Json } from "@/types/supabase";

type CheckInStatus =
  | "idle"
  | "locating"
  | "completed"
  | "out_of_range"
  | "error";

interface TramoDescanso {
  inicio: string;
  fin: string | null;
}

interface ClockPanelProps {
  /** `colaboradores.zonas_geocerca` */
  zonas: ZonaGeocerca[];
  zonas_geocerca?: unknown;
  horario: HorarioLaboral;
  userId?: string;
  /** ID del registro de hoy en `asistencias` para ejecutar UPDATE en la salida. */
  asistenciaHoyId?: string | null;
  yaMarcoHoy?: boolean;
  horaEntradaHoy?: string | null;
  horaInicioDescansoHoy?: string | null;
  horaFinDescansoHoy?: string | null;
  horaSalidaHoy?: string | null;
  ubicacionInicioDescansoHoy?: unknown;
  ubicacionFinDescansoHoy?: unknown;
  onCheckIn?: (ubicacion: UbicacionMarcaje) => void;
}

const COOLDOWN_SALIDA_MINUTOS = 15;
const COOLDOWN_DESCANSO_SEGUNDOS = 5 * 60;
const HORA_FIN_JORNADA_24 = 18;

function calcularMinutosTramosCompletados(tramos: TramoDescanso[]): number {
  let total = 0;
  for (const t of tramos) {
    if (t.inicio && t.fin) {
      const m = calcularMinutosDescanso(t.inicio, t.fin);
      if (m !== null && m > 0) {
        total += m;
      }
    }
  }
  return total;
}

function extraerMetaDescanso(
  ubicacionInicio: unknown,
  ubicacionFin: unknown,
  horaInicio: string | null | undefined,
  horaFin: string | null | undefined
): {
  tramos: TramoDescanso[];
  ultimoEventoMs: number | null;
} {
  const leerObj = (raw: unknown): Record<string, unknown> | null =>
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;

  const objIni = leerObj(ubicacionInicio);
  const objFin = leerObj(ubicacionFin);

  const msIni =
    typeof objIni?.ultimo_evento_descanso_ms === "number"
      ? objIni.ultimo_evento_descanso_ms
      : null;
  const msFin =
    typeof objFin?.ultimo_evento_descanso_ms === "number"
      ? objFin.ultimo_evento_descanso_ms
      : null;

  const fuenteMasReciente =
    msFin !== null && (msIni === null || msFin >= msIni)
      ? objFin
      : objIni ?? objFin;

  let tramos: TramoDescanso[] = [];
  if (Array.isArray(fuenteMasReciente?.tramos_descanso)) {
    tramos = (fuenteMasReciente.tramos_descanso as unknown[])
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object"
      )
      .map((item) => ({
        inicio: typeof item.inicio === "string" ? item.inicio : "",
        fin: typeof item.fin === "string" ? item.fin : null,
      }))
      .filter((t) => Boolean(t.inicio));
  }

  if (tramos.length === 0 && horaInicio) {
    tramos = [{ inicio: horaInicio, fin: horaFin ?? null }];
  }

  const ultimoEventoMs =
    msFin !== null && msIni !== null
      ? Math.max(msFin, msIni)
      : msFin ?? msIni ?? null;

  return { tramos, ultimoEventoMs };
}

function formatearCooldownMmSs(segundosTotales: number): string {
  const seg = Math.max(0, Math.ceil(segundosTotales));
  const min = Math.floor(seg / 60);
  const rem = seg % 60;
  return `${min}:${String(rem).padStart(2, "0")}`;
}

const BUTTON_STYLES: Record<CheckInStatus, string> = {
  idle: "bg-brand-dark hover:bg-brand-dark/90",
  locating: "cursor-wait bg-brand-dark opacity-70",
  completed: "cursor-default bg-status-success",
  out_of_range: "bg-status-danger hover:bg-status-danger/90",
  error: "bg-status-danger hover:bg-status-danger/90",
};

/**
 * Calcula cuántos minutos faltan para cumplir el cooldown de 15 minutos
 * tras haber registrado `hora_entrada`. Devuelve 0 cuando ya se cumplió.
 */
function calcularMinutosEsperaSalida(
  ahora: Date | null,
  horaEntradaStr: string | null
): number {
  if (!ahora || !horaEntradaStr) return 0;

  const partes = horaEntradaStr.split(":").map(Number);
  const h = partes[0] ?? 0;
  const m = partes[1] ?? 0;
  const s = partes[2] ?? 0;
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;

  const fechaEntrada = new Date(ahora);
  fechaEntrada.setHours(h, m, Number.isNaN(s) ? 0 : s, 0);

  const diffMs = ahora.getTime() - fechaEntrada.getTime();
  const diffMinutos = Math.floor(diffMs / 60_000);

  if (diffMinutos >= COOLDOWN_SALIDA_MINUTOS) return 0;
  return Math.max(1, COOLDOWN_SALIDA_MINUTOS - diffMinutos);
}

/**
 * Solicita la posición GPS actual del empleado mediante `navigator.geolocation.getCurrentPosition()`.
 */
function obtenerCoordenadasGps(): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(
        new Error(
          "Tu navegador no soporta geolocalización. Verifica los permisos del dispositivo."
        )
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          precision_m: position.coords.accuracy,
        });
      },
      (geoError) => {
        if (geoError.code === geoError.PERMISSION_DENIED) {
          reject(
            new Error(
              "Permiso de ubicación denegado. Habilita el acceso al GPS en tu navegador para registrar tu asistencia."
            )
          );
          return;
        }
        if (geoError.code === geoError.TIMEOUT) {
          reject(
            new Error(
              "Tiempo de espera agotado al obtener tu ubicación GPS. Intenta nuevamente."
            )
          );
          return;
        }
        reject(
          new Error(
            "No fue posible obtener tu ubicación GPS actual. Verifica tus servicios de localización."
          )
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 0,
      }
    );
  });
}

export default function ClockPanel({
  zonas,
  zonas_geocerca,
  horario,
  userId,
  asistenciaHoyId = null,
  yaMarcoHoy = false,
  horaEntradaHoy = null,
  horaInicioDescansoHoy = null,
  horaFinDescansoHoy = null,
  horaSalidaHoy = null,
  ubicacionInicioDescansoHoy = null,
  ubicacionFinDescansoHoy = null,
  onCheckIn,
}: ClockPanelProps) {
  const router = useRouter();

  const [zonasRemotas, setZonasRemotas] = useState<ZonaGeocerca[] | null>(null);

  const zonasActivas = useMemo<ZonaGeocerca[]>(() => {
    if (zonasRemotas && zonasRemotas.length > 0) {
      return zonasRemotas;
    }
    if (zonas_geocerca !== undefined) {
      const normalizadas = normalizeZones(zonas_geocerca);
      if (normalizadas.length > 0) return normalizadas;
    }
    return zonas ?? [];
  }, [zonas, zonas_geocerca, zonasRemotas]);

  const [registroId, setRegistroId] = useState<string | null>(asistenciaHoyId);
  const [tieneEntrada, setTieneEntrada] = useState<boolean>(
    Boolean(horaEntradaHoy) || yaMarcoHoy
  );
  const [tieneInicioDescanso, setTieneInicioDescanso] = useState<boolean>(
    Boolean(horaInicioDescansoHoy)
  );
  const [tieneFinDescanso, setTieneFinDescanso] = useState<boolean>(
    Boolean(horaFinDescansoHoy)
  );
  const [tieneSalida, setTieneSalida] = useState<boolean>(
    Boolean(horaSalidaHoy)
  );
  const [horaEntradaRegistrada, setHoraEntradaRegistrada] = useState<
    string | null
  >(horaEntradaHoy);
  const [horaInicioDescansoRegistrada, setHoraInicioDescansoRegistrada] =
    useState<string | null>(horaInicioDescansoHoy);
  const [horaFinDescansoRegistrada, setHoraFinDescansoRegistrada] = useState<
    string | null
  >(horaFinDescansoHoy);
  const [horaSalidaRegistrada, setHoraSalidaRegistrada] = useState<
    string | null
  >(horaSalidaHoy);

  const metaDescansoInicial = useMemo(
    () =>
      extraerMetaDescanso(
        ubicacionInicioDescansoHoy,
        ubicacionFinDescansoHoy,
        horaInicioDescansoHoy,
        horaFinDescansoHoy
      ),
    [
      ubicacionInicioDescansoHoy,
      ubicacionFinDescansoHoy,
      horaInicioDescansoHoy,
      horaFinDescansoHoy,
    ]
  );

  const [tramosDescanso, setTramosDescanso] = useState<TramoDescanso[]>(
    metaDescansoInicial.tramos
  );
  const [ultimoEventoDescansoMs, setUltimoEventoDescansoMs] = useState<
    number | null
  >(metaDescansoInicial.ultimoEventoMs);

  const minutosDescansoAcumulados = useMemo(() => {
    const porTramos = calcularMinutosTramosCompletados(tramosDescanso);
    if (porTramos > 0) return porTramos;
    if (tieneFinDescanso) {
      return (
        calcularMinutosDescanso(
          horaInicioDescansoRegistrada,
          horaFinDescansoRegistrada
        ) ?? 0
      );
    }
    return 0;
  }, [
    tramosDescanso,
    tieneFinDescanso,
    horaInicioDescansoRegistrada,
    horaFinDescansoRegistrada,
  ]);

  const minutosRestantesDescanso = Math.max(
    0,
    LIMITE_DESCANSO_MINUTOS - minutosDescansoAcumulados
  );

  const jornadaCompletada = tieneEntrada && tieneSalida;
  const enDescanso =
    tieneEntrada && tieneInicioDescanso && !tieneFinDescanso && !tieneSalida;
  const puedeIniciarDescanso =
    tieneEntrada && !tieneInicioDescanso && !tieneSalida;
  const puedeContinuarDescanso =
    tieneEntrada &&
    tieneInicioDescanso &&
    tieneFinDescanso &&
    !tieneSalida &&
    minutosDescansoAcumulados < LIMITE_DESCANSO_MINUTOS;
  const descansoCompletado =
    tieneEntrada &&
    tieneInicioDescanso &&
    tieneFinDescanso &&
    !tieneSalida &&
    minutosDescansoAcumulados >= LIMITE_DESCANSO_MINUTOS;
  const esModoSalida = tieneEntrada && !tieneSalida && !enDescanso;

  const [ahora, setAhora] = useState<Date | null>(null);
  const [fechaHoyLocal, setFechaHoyLocal] = useState<string>(() =>
    obtenerFechaHoyLocal()
  );
  const [puntoReal, setPuntoReal] = useState<GeoPoint | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<CheckInStatus>(
    jornadaCompletada ? "completed" : "idle"
  );
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [ultimoMarcaje, setUltimoMarcaje] = useState<UbicacionMarcaje | null>(
    null
  );
  const [modalSalidaAnticipada, setModalSalidaAnticipada] =
    useState<boolean>(false);
  const enProcesoRef = useRef<boolean>(false);
  const fechaInicialSsrRef = useRef<string>(fechaHoyLocal);

  // Sincronizar cambios provenientes de SSR tras router.refresh()
  useEffect(() => {
    setRegistroId(asistenciaHoyId);
    const entradaActiva = Boolean(horaEntradaHoy) || yaMarcoHoy;
    const inicioDescActiva = Boolean(horaInicioDescansoHoy);
    const finDescActiva = Boolean(horaFinDescansoHoy);
    const salidaActiva = Boolean(horaSalidaHoy);
    setTieneEntrada(entradaActiva);
    setTieneInicioDescanso(inicioDescActiva);
    setTieneFinDescanso(finDescActiva);
    setTieneSalida(salidaActiva);
    setHoraEntradaRegistrada(horaEntradaHoy);
    setHoraInicioDescansoRegistrada(horaInicioDescansoHoy);
    setHoraFinDescansoRegistrada(horaFinDescansoHoy);
    setHoraSalidaRegistrada(horaSalidaHoy);
    const meta = extraerMetaDescanso(
      ubicacionInicioDescansoHoy,
      ubicacionFinDescansoHoy,
      horaInicioDescansoHoy,
      horaFinDescansoHoy
    );
    setTramosDescanso(meta.tramos);
    setUltimoEventoDescansoMs(meta.ultimoEventoMs);
    setStatus(entradaActiva && salidaActiva ? "completed" : "idle");
  }, [
    asistenciaHoyId,
    horaEntradaHoy,
    horaInicioDescansoHoy,
    horaFinDescansoHoy,
    horaSalidaHoy,
    ubicacionInicioDescansoHoy,
    ubicacionFinDescansoHoy,
    yaMarcoHoy,
  ]);

  // Reloj y detección de cambio de día calendario (medianoche local)
  useEffect(() => {
    const actualizarRelojYFecha = () => {
      const fechaActual = new Date();
      setAhora(fechaActual);
      const nuevaFechaLocal = obtenerFechaHoyLocal(fechaActual);
      setFechaHoyLocal((prev) =>
        prev !== nuevaFechaLocal ? nuevaFechaLocal : prev
      );
    };

    actualizarRelojYFecha();
    const timer = setInterval(actualizarRelojYFecha, 1000);
    return () => clearInterval(timer);
  }, []);

  // Verificar asistencia de HOY y sincronizar `zonas_geocerca` cuando cambia de día (medianoche) o no vino de SSR
  useEffect(() => {
    if (userId && fechaHoyLocal === fechaInicialSsrRef.current) {
      return;
    }

    let activo = true;

    async function verificarAsistenciaYZonasDeHoy() {
      const supabase = createClient();
      let targetUserId = userId;
      if (!targetUserId) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        targetUserId = user?.id;
      }

      if (!targetUserId || !activo) return;

      const [asistenciaRes, colabRes] = await Promise.all([
        supabase
          .from("asistencias")
          .select("*")
          .eq("colaborador_id", targetUserId)
          .eq("fecha", fechaHoyLocal)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("colaboradores")
          .select("zonas_geocerca")
          .eq("id", targetUserId)
          .maybeSingle(),
      ]);

      if (!activo) return;

      if (!colabRes.error && colabRes.data?.zonas_geocerca) {
        const normalizadas = normalizeZones(colabRes.data.zonas_geocerca);
        if (normalizadas.length > 0) {
          setZonasRemotas(normalizadas);
        }
      }

      if (asistenciaRes.error) return;
      const registroHoy = asistenciaRes.data;

      if (registroHoy && registroHoy.fecha === fechaHoyLocal) {
        const entradaActiva = Boolean(registroHoy.hora_entrada);
        const inicioDescActiva = Boolean(registroHoy.hora_inicio_descanso);
        const finDescActiva = Boolean(registroHoy.hora_fin_descanso);
        const salidaActiva = Boolean(registroHoy.hora_salida);
        setRegistroId(registroHoy.id);
        setTieneEntrada(entradaActiva);
        setTieneInicioDescanso(inicioDescActiva);
        setTieneFinDescanso(finDescActiva);
        setTieneSalida(salidaActiva);
        setHoraEntradaRegistrada(registroHoy.hora_entrada ?? null);
        setHoraInicioDescansoRegistrada(
          registroHoy.hora_inicio_descanso ?? null
        );
        setHoraFinDescansoRegistrada(registroHoy.hora_fin_descanso ?? null);
        setHoraSalidaRegistrada(registroHoy.hora_salida ?? null);
        const meta = extraerMetaDescanso(
          registroHoy.ubicacion_inicio_descanso,
          registroHoy.ubicacion_fin_descanso,
          registroHoy.hora_inicio_descanso,
          registroHoy.hora_fin_descanso
        );
        setTramosDescanso(meta.tramos);
        setUltimoEventoDescansoMs(meta.ultimoEventoMs);
        setStatus(entradaActiva && salidaActiva ? "completed" : "idle");
      } else {
        setRegistroId(null);
        setTieneEntrada(false);
        setTieneInicioDescanso(false);
        setTieneFinDescanso(false);
        setTieneSalida(false);
        setHoraEntradaRegistrada(null);
        setHoraInicioDescansoRegistrada(null);
        setHoraFinDescansoRegistrada(null);
        setHoraSalidaRegistrada(null);
        setTramosDescanso([]);
        setUltimoEventoDescansoMs(null);
        setStatus("idle");
        setMensajeError(null);
      }
    }

    void verificarAsistenciaYZonasDeHoy();

    return () => {
      activo = false;
    };
  }, [fechaHoyLocal, userId]);

  const minutosEsperaSalida = useMemo(
    () =>
      esModoSalida
        ? calcularMinutosEsperaSalida(ahora, horaEntradaRegistrada)
        : 0,
    [ahora, esModoSalida, horaEntradaRegistrada]
  );

  const salidaBloqueadaPorCooldown = esModoSalida && minutosEsperaSalida > 0;

  const minutosDescansoRegistrados = useMemo(() => {
    if (!tieneInicioDescanso || !tieneFinDescanso) return null;
    return minutosDescansoAcumulados;
  }, [tieneInicioDescanso, tieneFinDescanso, minutosDescansoAcumulados]);

  const minutosDescansoEnCurso = useMemo(() => {
    if (!enDescanso || !ahora || !horaInicioDescansoRegistrada) return null;
    const inicioMin = parsearHoraAMinutos(horaInicioDescansoRegistrada);
    if (inicioMin === null) return null;
    const actualMin = ahora.getHours() * 60 + ahora.getMinutes();
    return minutosDescansoAcumulados + Math.max(0, actualMin - inicioMin);
  }, [
    ahora,
    enDescanso,
    horaInicioDescansoRegistrada,
    minutosDescansoAcumulados,
  ]);

  const segundosEsperaDescanso = useMemo(() => {
    if (!ahora || ultimoEventoDescansoMs === null) return 0;
    const transcurridosSeg = Math.floor(
      (ahora.getTime() - ultimoEventoDescansoMs) / 1000
    );
    if (transcurridosSeg < 0) return COOLDOWN_DESCANSO_SEGUNDOS;
    return transcurridosSeg < COOLDOWN_DESCANSO_SEGUNDOS
      ? COOLDOWN_DESCANSO_SEGUNDOS - transcurridosSeg
      : 0;
  }, [ahora, ultimoEventoDescansoMs]);

  const descansoBloqueadoPorCooldown = segundosEsperaDescanso > 0;

  const evaluacion = useMemo(() => {
    if (!puntoReal) return null;
    return evaluateGeofence(puntoReal.lat, puntoReal.lng, zonasActivas);
  }, [puntoReal, zonasActivas]);

  const entrada = ahora ? calcularEstatusEntrada(ahora, horario) : null;

  /**
   * ACCIÓN 2 y ACCIÓN 3:
   * 1. Pausa la ejecución, activa `isLocating` ("Obteniendo tu ubicación...") y llama a `navigator.geolocation.getCurrentPosition()`.
   * 2. Calcula la distancia exacta en metros con la Fórmula de Haversine (`calcularDistancia(lat1, lon1, lat2, lon2)`).
   * 3. Compara contra `radio_metros` (`zona.radio_m`) de las zonas autorizadas del colaborador.
   */
  const capturarYValidarPosicion = async (): Promise<{
    enRango: boolean;
    marcajePayload: UbicacionMarcaje;
    ubicacionJsonb: Record<string, Json>;
    fechaActual: Date;
  }> => {
    setIsLocating(true);
    let coords: GeoPoint;
    try {
      coords = await obtenerCoordenadasGps();
    } finally {
      setIsLocating(false);
    }

    setPuntoReal(coords);

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("aif:gps-location", {
          detail: { lat: coords.lat, lng: coords.lng },
        })
      );
    }

    // Validación matemática mediante Fórmula de Haversine (calcularDistancia)
    let zonaAutorizada: ZonaGeocerca | null = null;
    let distanciaMinima: number | null = null;
    let enRango = false;

    for (const zona of zonasActivas) {
      const radioPermitido = zona.radio_m > 0 ? zona.radio_m : 100;
      const distanciaMetros = calcularDistancia(
        coords.lat,
        coords.lng,
        zona.lat,
        zona.lng
      );

      if (distanciaMinima === null || distanciaMetros < distanciaMinima) {
        distanciaMinima = distanciaMetros;
        zonaAutorizada = zona;
      }

      if (distanciaMetros <= radioPermitido) {
        enRango = true;
        zonaAutorizada = zona;
        distanciaMinima = distanciaMetros;
        break;
      }
    }

    const distanciaRedondeada =
      distanciaMinima !== null ? Math.round(distanciaMinima) : null;

    const fechaActual = new Date();
    const marcajePayload: UbicacionMarcaje = {
      lat: coords.lat,
      lng: coords.lng,
      precision_m: coords.precision_m,
      capturado_en: fechaActual.toISOString(),
      fuente: "gps",
      dentro_de_zona: enRango,
      zona_id: zonaAutorizada?.id ?? null,
      zona_nombre: zonaAutorizada?.nombre ?? null,
      distancia_m: distanciaRedondeada,
    };

    const ubicacionJsonb: Record<string, Json> = {
      lat: coords.lat,
      lng: coords.lng,
      latitud: coords.lat,
      longitud: coords.lng,
      precision_m: coords.precision_m ?? null,
      capturado_en: marcajePayload.capturado_en,
      fuente: "gps",
      dentro_de_zona: enRango,
      zona_id: zonaAutorizada?.id ?? null,
      zona_nombre: zonaAutorizada?.nombre ?? null,
      radio_metros: zonaAutorizada?.radio_m ?? null,
      distancia_m: distanciaRedondeada,
      distancia_metros: distanciaRedondeada,
    };

    setUltimoMarcaje(marcajePayload);

    return { enRango, marcajePayload, ubicacionJsonb, fechaActual };
  };

  /**
   * Flujo de Check-in (Marcar Entrada)
   */
  const handleCheckIn = async () => {
    if (enProcesoRef.current || isLoading || isLocating || tieneEntrada) return;
    enProcesoRef.current = true;

    setIsLoading(true);
    setStatus("locating");
    setMensajeError(null);

    try {
      const { enRango, marcajePayload, ubicacionJsonb, fechaActual } =
        await capturarYValidarPosicion();

      if (!enRango) {
        setStatus("out_of_range");
        setMensajeError(
          "Estás fuera de tu zona autorizada. Acércate a la oficina o punto de trabajo."
        );
        return;
      }

      const supabase = createClient();
      let targetUserId = userId;
      if (!targetUserId) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        targetUserId = user?.id;
      }

      if (!targetUserId) {
        setStatus("error");
        setMensajeError(
          "Tu sesión ha expirado. Inicia sesión nuevamente para registrar asistencia."
        );
        return;
      }

      const fechaIso = obtenerFechaHoyLocal(fechaActual);

      const hh = String(fechaActual.getHours()).padStart(2, "0");
      const min = String(fechaActual.getMinutes()).padStart(2, "0");
      const ss = String(fechaActual.getSeconds()).padStart(2, "0");
      const horaActualStr = `${hh}:${min}:${ss}`;

      const calculoHorario = calcularEstatusEntrada(fechaActual, horario);
      const estatusNegocio =
        calculoHorario.estatus === "retardo" ? "Retardo" : "A Tiempo";

      const { data: insertada, error: insertError } = await supabase
        .from("asistencias")
        .insert({
          colaborador_id: targetUserId,
          fecha: fechaIso,
          hora_entrada: horaActualStr,
          ubicacion_entrada: ubicacionJsonb as unknown as Json,
          estatus: estatusNegocio,
        })
        .select("id")
        .maybeSingle();

      if (insertError) {
        setStatus("error");
        setMensajeError(
          `No se pudo guardar la asistencia: ${insertError.message}`
        );
        return;
      }

      if (insertada?.id) {
        setRegistroId(insertada.id);
      }
      setTieneEntrada(true);
      setHoraEntradaRegistrada(horaActualStr);
      setStatus("idle");
      onCheckIn?.(marcajePayload);
      router.refresh();
    } catch (err) {
      setStatus("error");
      setMensajeError(
        err instanceof Error
          ? err.message
          : "Ocurrió un error al acceder al GPS del navegador."
      );
    } finally {
      enProcesoRef.current = false;
      setIsLocating(false);
      setIsLoading(false);
    }
  };

  /**
   * Flujo de Inicio de Descanso (Iniciar Descanso) con validación de GPS y geocerca.
   */
  /**
   * Flujo de Inicio o Continuación de Descanso con validación de GPS, geocerca y cooldown de 5 minutos.
   */
  const handleIniciarDescanso = async () => {
    if (
      enProcesoRef.current ||
      isLoading ||
      isLocating ||
      descansoBloqueadoPorCooldown ||
      (!puedeIniciarDescanso && !puedeContinuarDescanso)
    )
      return;
    enProcesoRef.current = true;

    setIsLoading(true);
    setStatus("locating");
    setMensajeError(null);

    try {
      const { enRango, marcajePayload, ubicacionJsonb, fechaActual } =
        await capturarYValidarPosicion();

      if (!enRango) {
        setStatus("out_of_range");
        setMensajeError(
          "Estás fuera de tu zona autorizada. Acércate a la oficina o punto de trabajo para iniciar o continuar tu descanso."
        );
        return;
      }

      const supabase = createClient();
      let targetUserId = userId;
      if (!targetUserId) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        targetUserId = user?.id;
      }

      if (!targetUserId) {
        setStatus("error");
        setMensajeError(
          "Tu sesión ha expirado. Inicia sesión nuevamente para registrar tu descanso."
        );
        return;
      }

      const fechaIso = obtenerFechaHoyLocal(fechaActual);
      const hh = String(fechaActual.getHours()).padStart(2, "0");
      const min = String(fechaActual.getMinutes()).padStart(2, "0");
      const ss = String(fechaActual.getSeconds()).padStart(2, "0");
      const horaActualStr = `${hh}:${min}:${ss}`;
      const ahoraMs = Date.now();

      const tramosPreviosCompletos = tramosDescanso.filter((t) => Boolean(t.fin));
      const nuevosTramos: TramoDescanso[] = [
        ...tramosPreviosCompletos,
        { inicio: horaActualStr, fin: null },
      ];
      const acumuladosPrevios = calcularMinutosTramosCompletados(
        tramosPreviosCompletos
      );

      const ubicacionInicioEnriquecida = {
        ...ubicacionJsonb,
        tramos_descanso: nuevosTramos,
        minutos_acumulados: acumuladosPrevios,
        ultimo_evento_descanso_ms: ahoraMs,
      };

      const query = supabase.from("asistencias").update({
        hora_inicio_descanso: horaActualStr,
        hora_fin_descanso: null,
        ubicacion_inicio_descanso: ubicacionInicioEnriquecida as unknown as Json,
      });

      const { error: updateError } = registroId
        ? await query.eq("id", registroId)
        : await query.eq("colaborador_id", targetUserId).eq("fecha", fechaIso);

      if (updateError) {
        setStatus("error");
        setMensajeError(
          `No se pudo iniciar el descanso: ${updateError.message}`
        );
        return;
      }

      setTieneInicioDescanso(true);
      setTieneFinDescanso(false);
      setHoraInicioDescansoRegistrada(horaActualStr);
      setHoraFinDescansoRegistrada(null);
      setTramosDescanso(nuevosTramos);
      setUltimoEventoDescansoMs(ahoraMs);
      setStatus("idle");
      onCheckIn?.(marcajePayload);
      router.refresh();
    } catch (err) {
      setStatus("error");
      setMensajeError(
        err instanceof Error
          ? err.message
          : "Ocurrió un error al acceder al GPS del navegador."
      );
    } finally {
      enProcesoRef.current = false;
      setIsLocating(false);
      setIsLoading(false);
    }
  };

  /**
   * Flujo de Fin de Descanso (Regresar a Actividades) con validación de GPS, geocerca y cooldown de 5 minutos.
   */
  const handleFinalizarDescanso = async () => {
    if (
      enProcesoRef.current ||
      isLoading ||
      isLocating ||
      !enDescanso ||
      descansoBloqueadoPorCooldown
    )
      return;
    enProcesoRef.current = true;

    setIsLoading(true);
    setStatus("locating");
    setMensajeError(null);

    try {
      const { enRango, marcajePayload, ubicacionJsonb, fechaActual } =
        await capturarYValidarPosicion();

      if (!enRango) {
        setStatus("out_of_range");
        setMensajeError(
          "Estás fuera de tu zona autorizada. Acércate a la oficina o punto de trabajo para regresar a actividades."
        );
        return;
      }

      const supabase = createClient();
      let targetUserId = userId;
      if (!targetUserId) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        targetUserId = user?.id;
      }

      if (!targetUserId) {
        setStatus("error");
        setMensajeError(
          "Tu sesión ha expirado. Inicia sesión nuevamente para registrar tu regreso."
        );
        return;
      }

      const fechaIso = obtenerFechaHoyLocal(fechaActual);
      const hh = String(fechaActual.getHours()).padStart(2, "0");
      const min = String(fechaActual.getMinutes()).padStart(2, "0");
      const ss = String(fechaActual.getSeconds()).padStart(2, "0");
      const horaActualStr = `${hh}:${min}:${ss}`;
      const ahoraMs = Date.now();

      const tramosActualizados: TramoDescanso[] =
        tramosDescanso.length > 0
          ? tramosDescanso.map((t, idx) =>
              idx === tramosDescanso.length - 1 && !t.fin
                ? { ...t, fin: horaActualStr }
                : t
            )
          : [
              {
                inicio: horaInicioDescansoRegistrada || horaActualStr,
                fin: horaActualStr,
              },
            ];

      const minutosTotalesAcumulados =
        calcularMinutosTramosCompletados(tramosActualizados);

      const ubicacionFinEnriquecida = {
        ...ubicacionJsonb,
        tramos_descanso: tramosActualizados,
        minutos_acumulados: minutosTotalesAcumulados,
        ultimo_evento_descanso_ms: ahoraMs,
      };

      const query = supabase.from("asistencias").update({
        hora_fin_descanso: horaActualStr,
        ubicacion_fin_descanso: ubicacionFinEnriquecida as unknown as Json,
      });

      const { error: updateError } = registroId
        ? await query.eq("id", registroId)
        : await query.eq("colaborador_id", targetUserId).eq("fecha", fechaIso);

      if (updateError) {
        setStatus("error");
        setMensajeError(
          `No se pudo registrar el fin de descanso: ${updateError.message}`
        );
        return;
      }

      setTieneFinDescanso(true);
      setHoraFinDescansoRegistrada(horaActualStr);
      setTramosDescanso(tramosActualizados);
      setUltimoEventoDescansoMs(ahoraMs);
      setStatus("idle");
      onCheckIn?.(marcajePayload);
      router.refresh();
    } catch (err) {
      setStatus("error");
      setMensajeError(
        err instanceof Error
          ? err.message
          : "Ocurrió un error al acceder al GPS del navegador."
      );
    } finally {
      enProcesoRef.current = false;
      setIsLocating(false);
      setIsLoading(false);
    }
  };

  /**
   * Ejecuta el registro de salida (Check-out) tras validar GPS y geocerca.
   */
  const ejecutarCheckOut = async () => {
    if (enProcesoRef.current) return;
    enProcesoRef.current = true;
    setModalSalidaAnticipada(false);
    setIsLoading(true);
    setStatus("locating");
    setMensajeError(null);

    try {
      const { enRango, marcajePayload, ubicacionJsonb, fechaActual } =
        await capturarYValidarPosicion();

      if (!enRango) {
        setStatus("out_of_range");
        setMensajeError(
          "Estás fuera de tu zona autorizada. Acércate a la oficina o punto de trabajo."
        );
        return;
      }

      const supabase = createClient();
      let targetUserId = userId;
      if (!targetUserId) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        targetUserId = user?.id;
      }

      if (!targetUserId) {
        setStatus("error");
        setMensajeError(
          "Tu sesión ha expirado. Inicia sesión nuevamente para registrar tu salida."
        );
        return;
      }

      const fechaIso = obtenerFechaHoyLocal(fechaActual);

      const hh = String(fechaActual.getHours()).padStart(2, "0");
      const min = String(fechaActual.getMinutes()).padStart(2, "0");
      const ss = String(fechaActual.getSeconds()).padStart(2, "0");
      const horaActualStr = `${hh}:${min}:${ss}`;

      const query = supabase.from("asistencias").update({
        hora_salida: horaActualStr,
        ubicacion_salida: ubicacionJsonb as unknown as Json,
      });

      const { error: updateError } = registroId
        ? await query.eq("id", registroId)
        : await query.eq("colaborador_id", targetUserId).eq("fecha", fechaIso);

      if (updateError) {
        setStatus("error");
        setMensajeError(
          `No se pudo registrar la salida: ${updateError.message}`
        );
        return;
      }

      setTieneSalida(true);
      setHoraSalidaRegistrada(horaActualStr);
      setStatus("completed");
      onCheckIn?.(marcajePayload);
      router.refresh();
    } catch (err) {
      setStatus("error");
      setMensajeError(
        err instanceof Error
          ? err.message
          : "Ocurrió un error al acceder al GPS del navegador."
      );
    } finally {
      enProcesoRef.current = false;
      setIsLocating(false);
      setIsLoading(false);
    }
  };

  /**
   * Flujo de Check-out (Marcar Salida) con confirmación de salida anticipada (< 18:00 hrs)
   */
  const handleCheckOut = async () => {
    if (
      isLoading ||
      isLocating ||
      jornadaCompletada ||
      enDescanso ||
      salidaBloqueadaPorCooldown
    ) {
      return;
    }

    const horaActual = new Date().getHours();
    if (horaActual < HORA_FIN_JORNADA_24) {
      setModalSalidaAnticipada(true);
      return;
    }

    await ejecutarCheckOut();
  };

  const obtenerTextoBotonPrincipal = (): string => {
    if (isLocating || status === "locating") {
      return "OBTENIENDO TU UBICACIÓN...";
    }
    if (jornadaCompletada || status === "completed") {
      return "JORNADA COMPLETADA";
    }
    if (status === "out_of_range") {
      return "FUERA DE RANGO · REINTENTAR";
    }
    if (status === "error") {
      return "ERROR DE GPS · REINTENTAR";
    }
    if (!tieneEntrada) {
      return "MARCAR ENTRADA";
    }
    if (enDescanso) {
      if (descansoBloqueadoPorCooldown) {
        return `REGRESAR A ACTIVIDADES (ESPERA ${formatearCooldownMmSs(
          segundosEsperaDescanso
        )})`;
      }
      return "REGRESAR A ACTIVIDADES";
    }
    if (salidaBloqueadaPorCooldown) {
      return `SALIDA BLOQUEADA (ESPERA ${minutosEsperaSalida} MIN)`;
    }
    return "MARCAR SALIDA";
  };

  const botonSalidaDeshabilitado =
    isLoading || isLocating || jornadaCompletada || salidaBloqueadaPorCooldown;

  const botonAccionGeneralDeshabilitado =
    isLoading || isLocating || jornadaCompletada;

  const botonDescansoDeshabilitado =
    botonAccionGeneralDeshabilitado || descansoBloqueadoPorCooldown;

  return (
    <section className="flex flex-col gap-5 rounded-md border-t-4 border-status-success bg-brand-surface p-6 shadow-sm">
      {/* Reloj y fecha */}
      <div>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-gray-700">
          <ClockIcon className="h-7 w-7" />
        </div>
        <p
          className="mt-4 text-center font-serif text-4xl font-black tabular-nums tracking-tight text-gray-900"
          suppressHydrationWarning
        >
          {ahora ? formatReloj(ahora) : "--:--:--"}
        </p>
        <p className="mt-1 h-4 text-center text-[11px] font-bold uppercase tracking-widest text-gray-400">
          {ahora ? formatFechaLarga(ahora) : ""}
        </p>
      </div>

      {/* Horario esperado y resumen de hoy */}
      <div className="flex w-full items-center justify-between border-t border-gray-100 py-3">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">
            HORARIO ESPERADO
          </p>
          <p className="text-xs font-bold text-gray-800">
            {formatHora12(horario.entrada)} (Límite:{" "}
            {formatHora12(horaLimite(horario))})
          </p>
          <p className="mt-0.5 text-[10px] font-semibold text-gray-500">
            {horaEntradaRegistrada ? (
              <>
                Entrada: {formatHora12(horaEntradaRegistrada.slice(0, 5))}
                {" · "}
                Salida:{" "}
                {horaSalidaRegistrada
                  ? formatHora12(horaSalidaRegistrada.slice(0, 5))
                  : "Pendiente"}
              </>
            ) : (
              "Entrada: Sin registrar"
            )}
          </p>
          {horaInicioDescansoRegistrada && (
            <p className="mt-0.5 text-[10px] font-semibold text-gray-500">
              Descanso:{" "}
              {formatHora12(horaInicioDescansoRegistrada.slice(0, 5))}
              {" - "}
              {horaFinDescansoRegistrada
                ? `${formatHora12(horaFinDescansoRegistrada.slice(0, 5))}${
                    minutosDescansoRegistrados !== null
                      ? ` (${minutosDescansoRegistrados} min)`
                      : ""
                  }`
                : `En curso${
                    minutosDescansoEnCurso !== null
                      ? ` (${minutosDescansoEnCurso} min)`
                      : ""
                  }`}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          {entrada &&
            (entrada.estatus === "retardo" ? (
              <span className="flex items-center gap-1 rounded border border-status-warning/50 bg-status-warning/10 px-2.5 py-1 text-[10px] font-bold uppercase text-status-warning-dark">
                <AlertTriangleIcon className="h-3 w-3" />
                RETARDO (+{entrada.minutos_retardo} MIN)
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded border border-status-success/40 bg-status-success/10 px-2.5 py-1 text-[10px] font-bold uppercase text-status-success-dark">
                <CheckCircleIcon className="h-3 w-3" />
                A TIEMPO
              </span>
            ))}
          {enDescanso && (
            <span className="flex items-center gap-1 rounded border border-brand-gold/50 bg-brand-beige/60 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-brand-dark">
              EN DESCANSO
              {minutosDescansoEnCurso !== null &&
              minutosDescansoEnCurso > LIMITE_DESCANSO_MINUTOS
                ? ` · EXCEDIDO (${minutosDescansoEnCurso}M)`
                : ""}
            </span>
          )}
          {!enDescanso &&
            minutosDescansoRegistrados !== null &&
            minutosDescansoRegistrados > LIMITE_DESCANSO_MINUTOS && (
              <span className="flex items-center gap-1 rounded border border-status-danger/40 bg-status-danger/10 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-status-danger-dark">
                <AlertTriangleIcon className="h-3 w-3" />
                DESCANSO EXCEDIDO ({minutosDescansoRegistrados} MIN)
              </span>
            )}
        </div>
      </div>

      {/* Ubicación evaluada */}
      <UbicacionBlock evaluacion={evaluacion} isLocating={isLocating} />

      {/* Máquina de Estados de Asistencia (Misión 2) */}
      <div className="flex flex-col gap-2.5">
        {!tieneEntrada && (
          <button
            type="button"
            onClick={handleCheckIn}
            disabled={botonAccionGeneralDeshabilitado}
            className={`flex h-14 w-full items-center justify-center gap-2.5 rounded-md text-white shadow-md transition-all disabled:cursor-not-allowed disabled:opacity-65 ${BUTTON_STYLES[status]}`}
          >
            <MapPinIcon className="h-5 w-5 text-brand-gold" />
            <span className="text-xs font-bold uppercase tracking-widest">
              {obtenerTextoBotonPrincipal()}
            </span>
          </button>
        )}

        {(puedeIniciarDescanso || puedeContinuarDescanso) && (
          <>
            <button
              type="button"
              onClick={handleIniciarDescanso}
              disabled={botonDescansoDeshabilitado}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-md border-2 border-brand-gold bg-brand-beige/60 text-brand-dark shadow-sm transition-colors hover:bg-brand-beige disabled:cursor-not-allowed disabled:opacity-65"
            >
              <ClockIcon className="h-4 w-4 text-brand-gold" />
              <span className="text-xs font-bold uppercase tracking-widest">
                {isLocating || status === "locating"
                  ? "OBTENIENDO TU UBICACIÓN..."
                  : puedeContinuarDescanso
                  ? descansoBloqueadoPorCooldown
                    ? `CONTINUAR DESCANSO (ESPERA ${formatearCooldownMmSs(
                        segundosEsperaDescanso
                      )})`
                    : `CONTINUAR DESCANSO (${minutosRestantesDescanso} MIN RESTANTES)`
                  : "INICIAR DESCANSO"}
              </span>
            </button>

            <button
              type="button"
              onClick={handleCheckOut}
              disabled={botonSalidaDeshabilitado}
              className={`flex h-14 w-full items-center justify-center gap-2.5 rounded-md text-white shadow-md transition-all disabled:cursor-not-allowed disabled:opacity-65 ${BUTTON_STYLES[status]}`}
            >
              <MapPinIcon className="h-5 w-5 text-brand-gold" />
              <span className="text-xs font-bold uppercase tracking-widest">
                {obtenerTextoBotonPrincipal()}
              </span>
            </button>
          </>
        )}

        {enDescanso && (
          /* Durante el descanso: muestra "Regresar a Actividades" (con cooldown de 5 min) y oculta el cierre de turno */
          <button
            type="button"
            onClick={handleFinalizarDescanso}
            disabled={botonDescansoDeshabilitado}
            className={`flex h-14 w-full items-center justify-center gap-2.5 rounded-md text-white shadow-md transition-all disabled:cursor-not-allowed disabled:opacity-65 ${BUTTON_STYLES[status]}`}
          >
            <MapPinIcon className="h-5 w-5 text-brand-gold" />
            <span className="text-xs font-bold uppercase tracking-widest">
              {obtenerTextoBotonPrincipal()}
            </span>
          </button>
        )}

        {(descansoCompletado || jornadaCompletada) && (
          <button
            type="button"
            onClick={handleCheckOut}
            disabled={botonSalidaDeshabilitado}
            className={`flex h-14 w-full items-center justify-center gap-2.5 rounded-md text-white shadow-md transition-all disabled:cursor-not-allowed disabled:opacity-65 ${BUTTON_STYLES[status]}`}
          >
            {jornadaCompletada || status === "completed" ? (
              <CheckCircleIcon className="h-5 w-5" />
            ) : (
              <MapPinIcon className="h-5 w-5 text-brand-gold" />
            )}
            <span className="text-xs font-bold uppercase tracking-widest">
              {obtenerTextoBotonPrincipal()}
            </span>
          </button>
        )}

        {mensajeError && (
          <p
            role="alert"
            aria-live="assertive"
            className="mt-2 rounded-sm border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-center text-[11px] font-semibold text-status-danger-dark"
          >
            {mensajeError}
          </p>
        )}
        {ultimoMarcaje && (
          <p className="mt-2 text-center font-mono text-[10px] text-gray-400">
            {ultimoMarcaje.lat.toFixed(6)}, {ultimoMarcaje.lng.toFixed(6)}
            {ultimoMarcaje.precision_m !== undefined &&
              ` · ±${Math.round(ultimoMarcaje.precision_m)}m`}
            {" · "}
            {ultimoMarcaje.fuente}
          </p>
        )}
      </div>

      {/* Modal de confirmación de Salida Anticipada con criterios de diseño AIF Connect */}
      {modalSalidaAnticipada && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirmar-salida-anticipada-titulo"
          className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden overscroll-contain bg-black/55 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md overflow-hidden overscroll-contain rounded-md border-t-4 border-brand-gold bg-brand-surface text-gray-900 shadow-2xl">
            <header className="flex items-start justify-between gap-4 border-b border-gray-200 bg-brand-beige/50 px-6 py-4">
              <div className="flex flex-col gap-1">
                <p className="text-[9px] font-bold uppercase tracking-widest text-brand-gold">
                  AVISO DE JORNADA · CONTROL DE ASISTENCIA
                </p>
                <h3
                  id="confirmar-salida-anticipada-titulo"
                  className="font-serif text-xl font-black text-gray-900"
                >
                  Confirmar Salida Anticipada
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalSalidaAnticipada(false)}
                className="rounded-sm border border-gray-200 bg-brand-surface px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-gray-500 transition-colors hover:text-gray-900"
              >
                CERRAR
              </button>
            </header>

            <div className="flex flex-col gap-4 px-6 py-5">
              <p className="text-xs leading-relaxed text-gray-600">
                Tu jornada de trabajo termina a las{" "}
                <span className="font-bold text-gray-900">6:00 PM</span>,
                ¿deseas continuar con tu marcaje de salida?
              </p>

              <div className="flex items-center gap-2.5 rounded-sm border border-status-warning/40 bg-status-warning/10 px-4 py-3 text-status-warning-dark">
                <AlertTriangleIcon className="h-4 w-4 shrink-0" />
                <span className="text-[11px] font-semibold">
                  El sistema registrará la hora exacta y ubicación GPS de tu
                  salida.
                </span>
              </div>
            </div>

            <footer className="flex items-center justify-end gap-3 border-t border-gray-200 bg-brand-surface px-6 py-4">
              <button
                type="button"
                onClick={() => setModalSalidaAnticipada(false)}
                className="rounded-sm border border-gray-300 bg-brand-surface px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-700 transition-colors hover:bg-gray-50"
              >
                CANCELAR
              </button>
              <button
                type="button"
                onClick={() => void ejecutarCheckOut()}
                className="rounded-sm bg-brand-dark px-6 py-2.5 text-[10px] font-bold uppercase tracking-widest text-brand-gold shadow-sm transition-colors hover:bg-brand-dark/90"
              >
                CONTINUAR CON SALIDA
              </button>
            </footer>
          </div>
        </div>
      )}
    </section>
  );
}

function UbicacionBlock({
  evaluacion,
  isLocating,
}: {
  evaluacion: ReturnType<typeof evaluateGeofence> | null;
  isLocating: boolean;
}) {
  if (isLocating) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-md border border-brand-gold/40 bg-brand-beige/60 p-3.5"
      >
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-dark">
          OBTENIENDO TU UBICACIÓN...
        </p>
        <p className="mt-1 text-xs font-medium text-gray-700">
          Consultando el GPS del dispositivo y validando la distancia hacia tus
          zonas autorizadas.
        </p>
      </div>
    );
  }

  if (!evaluacion || !evaluacion.closestZone) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 p-3.5">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500">
          UBICACIÓN PENDIENTE
        </p>
        <p className="mt-1 text-xs font-medium text-gray-700">
          Presiona el botón para validar tu posición GPS frente a tus geocercas
          autorizadas.
        </p>
      </div>
    );
  }

  const { closestZone: zona, distanceMeters, within: dentro } = evaluacion;
  const distancia = Math.round(distanceMeters ?? 0);

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-md border p-3.5 ${
        dentro
          ? "border-status-success/40 bg-status-success/10"
          : "border-status-danger/40 bg-status-danger/10"
      }`}
    >
      <div>
        <div
          className={`flex items-center gap-1.5 ${
            dentro ? "text-status-success-dark" : "text-status-danger-dark"
          }`}
        >
          {dentro ? (
            <CheckCircleIcon className="h-4 w-4" />
          ) : (
            <AlertTriangleIcon className="h-4 w-4" />
          )}
          <span className="text-[10px] font-extrabold uppercase tracking-widest">
            {dentro ? "UBICACIÓN AUTORIZADA" : "FUERA DE RANGO"}
          </span>
        </div>
        <p className="mt-1 text-xs font-medium text-gray-700">
          {dentro ? zona.nombre : `Zona más cercana: ${zona.nombre}`} (Radio
          permitido: {zona.radio_m}m)
        </p>
      </div>
      <span className="shrink-0 text-xs font-bold text-gray-800">
        {distancia}m de distancia
      </span>
    </div>
  );
}
