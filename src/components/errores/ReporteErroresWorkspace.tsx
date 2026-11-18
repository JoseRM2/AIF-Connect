"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import {
  crearReporteErrorAction,
  type ReporteErrorRow,
  type SeveridadError,
} from "@/app/actions/errores";
import { AlertTriangleIcon, CheckCircleIcon } from "@/components/ui/icons";
import {
  TAMANO_MAXIMO_BYTES,
  TAMANO_MAXIMO_MB,
  validarMagicBytesArchivo,
} from "@/lib/storage/expedientes";
import { createClient } from "@/lib/supabase/client";

export const MODULOS_PLATAFORMA = [
  "Inicio / Dashboard",
  "Mi Asistencia y Reloj Checador",
  "Mis Solicitudes",
  "Calendario Corporativo",
  "Muro Corporativo",
  "Supervisión Jefatura",
  "Zonas Autorizadas (Geocercas)",
  "Panel RH y Expedientes",
  "Inicio de Sesión / Cuenta",
  "General / Otro",
] as const;

const CATEGORIAS_ERROR = [
  "Funcionalidad",
  "Visual / Diseño",
  "Datos / Cálculos",
  "Rendimiento / Lentitud",
  "Permisos / Acceso",
  "Otro",
] as const;

const SEVERIDADES: {
  valor: SeveridadError;
  etiqueta: string;
  descripcion: string;
  badgeClass: string;
}[] = [
  {
    valor: "Baja",
    etiqueta: "Baja",
    descripcion: "Detalle menor o estético que no impide usar el módulo.",
    badgeClass: "border-gray-300 bg-gray-100 text-gray-700",
  },
  {
    valor: "Media",
    etiqueta: "Media",
    descripcion: "Comportamiento inesperado con alternativa para continuar.",
    badgeClass: "border-brand-gold/50 bg-brand-beige text-brand-dark",
  },
  {
    valor: "Alta",
    etiqueta: "Alta",
    descripcion: "Una función importante no completa la acción esperada.",
    badgeClass:
      "border-status-warning/50 bg-status-warning/15 text-status-warning",
  },
  {
    valor: "Critica",
    etiqueta: "Crítica",
    descripcion: "Bloqueo total de un módulo o pérdida de información.",
    badgeClass:
      "border-status-danger/50 bg-status-danger/15 text-status-danger-dark",
  },
];

const ESTATUS_CATALOGO = [
  {
    valor: "Abierto",
    etiqueta: "ABIERTO",
    badgeClass:
      "border-status-danger/40 bg-status-danger/10 text-status-danger-dark",
  },
  {
    valor: "En_Revision",
    etiqueta: "EN REVISIÓN",
    badgeClass:
      "border-status-warning/40 bg-status-warning/15 text-status-warning",
  },
  {
    valor: "Resuelto",
    etiqueta: "RESUELTO",
    badgeClass:
      "border-status-success/40 bg-status-success/15 text-status-success-dark",
  },
  {
    valor: "Descartado",
    etiqueta: "DESCARTADO",
    badgeClass: "border-gray-300 bg-gray-100 text-gray-600",
  },
] as const;

function detectarModuloPorRuta(ruta?: string | null): string {
  const limpia = (ruta ?? "").toLowerCase();
  if (limpia.includes("/asistencia")) return "Mi Asistencia y Reloj Checador";
  if (limpia.includes("/solicitudes")) return "Mis Solicitudes";
  if (limpia.includes("/calendario")) return "Calendario Corporativo";
  if (limpia.includes("/muro")) return "Muro Corporativo";
  if (limpia.includes("/jefatura")) return "Supervisión Jefatura";
  if (limpia.includes("/zonas")) return "Zonas Autorizadas (Geocercas)";
  if (limpia.includes("/rh")) return "Panel RH y Expedientes";
  if (limpia.includes("/dashboard")) return "Inicio / Dashboard";
  return "General / Otro";
}

function formatearFechaHora(iso?: string | null): string {
  if (!iso) return "Reciente";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function obtenerBadgeSeveridad(sev: string) {
  return (
    SEVERIDADES.find((s) => s.valor.toLowerCase() === sev.toLowerCase()) ??
    SEVERIDADES[1]
  );
}

function obtenerBadgeEstatus(est: string) {
  return (
    ESTATUS_CATALOGO.find((e) => e.valor.toLowerCase() === est.toLowerCase()) ??
    ESTATUS_CATALOGO[0]
  );
}

export interface ReporteErroresWorkspaceProps {
  misReportesIniciales: ReporteErrorRow[];
  errorInicial?: string;
}

export default function ReporteErroresWorkspace({
  misReportesIniciales,
  errorInicial,
}: ReporteErroresWorkspaceProps) {
  const searchParams = useSearchParams();
  const rutaOrigenParam = searchParams.get("origen") || "";

  const [misReportes, setMisReportes] =
    useState<ReporteErrorRow[]>(misReportesIniciales);

  const [modulo, setModulo] = useState<string>(() =>
    detectarModuloPorRuta(rutaOrigenParam)
  );
  const [rutaOrigen, setRutaOrigen] = useState<string>(
    rutaOrigenParam || "/dashboard"
  );
  const [categoria, setCategoria] = useState<string>("Funcionalidad");
  const [severidad, setSeveridad] = useState<SeveridadError>("Media");
  const [titulo, setTitulo] = useState<string>("");
  const [descripcion, setDescripcion] = useState<string>("");
  const [pasosReproducir, setPasosReproducir] = useState<string>("");
  const [archivoCaptura, setArchivoCaptura] = useState<File | null>(null);
  const [previewCaptura, setPreviewCaptura] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [enviando, setEnviando] = useState(false);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [mensajeError, setMensajeError] = useState<string | null>(
    errorInicial ?? null
  );

  useEffect(() => {
    if (rutaOrigenParam) {
      setRutaOrigen(rutaOrigenParam);
      setModulo(detectarModuloPorRuta(rutaOrigenParam));
    }
  }, [rutaOrigenParam]);

  useEffect(() => {
    return () => {
      if (previewCaptura) {
        URL.revokeObjectURL(previewCaptura);
      }
    };
  }, [previewCaptura]);

  const handleArchivoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setMensajeError(null);
    if (file.size > TAMANO_MAXIMO_BYTES) {
      setMensajeError(
        `La captura excede el máximo permitido de ${TAMANO_MAXIMO_MB} MB.`
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const errMagic = await validarMagicBytesArchivo(file, false);
    if (errMagic) {
      setMensajeError(errMagic);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (previewCaptura) {
      URL.revokeObjectURL(previewCaptura);
    }
    setArchivoCaptura(file);
    setPreviewCaptura(URL.createObjectURL(file));
  };

  const limpiarCaptura = () => {
    if (previewCaptura) {
      URL.revokeObjectURL(previewCaptura);
    }
    setArchivoCaptura(null);
    setPreviewCaptura(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleEnviarReporte = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (enviando) return;

    setMensajeExito(null);
    setMensajeError(null);
    setEnviando(true);

    try {
      let urlCapturaSubida: string | null = null;

      if (archivoCaptura) {
        const supabase = createClient();
        const extRaw =
          archivoCaptura.name.split(".").pop()?.toLowerCase() || "png";
        const ext = ["jpg", "jpeg", "png", "webp"].includes(extRaw)
          ? extRaw
          : "png";
        const rutaStorage = `reportes_errores/${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 8)}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from("comunicados")
          .upload(rutaStorage, archivoCaptura);

        if (!upErr) {
          const { data: pubData } = supabase.storage
            .from("comunicados")
            .getPublicUrl(rutaStorage);
          urlCapturaSubida = pubData.publicUrl;
        }
      }

      const navegadorInfo =
        typeof window !== "undefined"
          ? `${window.navigator.userAgent.slice(0, 180)} | ${window.innerWidth}x${window.innerHeight}`
          : null;

      const res = await crearReporteErrorAction({
        modulo,
        rutaOrigen,
        severidad,
        categoria,
        titulo,
        descripcion,
        pasosReproducir,
        capturaUrl: urlCapturaSubida,
        navegadorInfo,
      });

      if (!res.ok || !res.reporte) {
        setMensajeError(
          res.error || "No se pudo registrar el reporte de error."
        );
        return;
      }

      setMisReportes((prev) => [res.reporte!, ...prev]);
      setTitulo("");
      setDescripcion("");
      setPasosReproducir("");
      limpiarCaptura();
      setMensajeExito(
        "¡Gracias! Tu reporte de error fue enviado correctamente para su revisión técnica."
      );
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex flex-col px-8 py-8">
      <header className="mb-7">
        <div className="mb-1 flex items-center gap-2">
          <span className="rounded-sm bg-brand-dark px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-brand-gold">
            SOPORTE Y MEJORA CONTINUA
          </span>
        </div>
        <h1 className="font-serif text-3xl font-black text-gray-900">
          Levantar Reporte de Error
        </h1>
        <p className="mt-1 text-xs font-medium text-gray-500">
          Notifica cualquier anomalía visual, funcional o de datos que detectes durante el uso de AIF-Connect.
        </p>
      </header>

      {mensajeExito && (
        <div
          role="status"
          className="mb-6 flex items-center justify-between gap-3 rounded-sm border border-status-success/40 bg-status-success/10 px-4 py-3 text-xs font-bold text-status-success-dark"
        >
          <span className="flex items-center gap-2">
            <CheckCircleIcon className="h-4 w-4 shrink-0" />
            {mensajeExito}
          </span>
          <button
            type="button"
            onClick={() => setMensajeExito(null)}
            className="text-[10px] uppercase tracking-widest underline"
          >
            CERRAR
          </button>
        </div>
      )}

      {mensajeError && (
        <div
          role="alert"
          className="mb-6 flex items-center justify-between gap-3 rounded-sm border border-status-danger/40 bg-status-danger/10 px-4 py-3 text-xs font-bold text-status-danger-dark"
        >
          <span className="flex items-center gap-2">
            <AlertTriangleIcon className="h-4 w-4 shrink-0" />
            {mensajeError}
          </span>
          <button
            type="button"
            onClick={() => setMensajeError(null)}
            className="text-[10px] uppercase tracking-widest underline"
          >
            CERRAR
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Columna izquierda: Formulario de envío */}
        <form
          onSubmit={handleEnviarReporte}
          className="flex flex-col gap-5 rounded-sm border border-gray-100 bg-brand-surface p-7 shadow-sm lg:col-span-7"
        >
          <div className="border-b border-gray-100 pb-4">
            <h2 className="font-serif text-lg font-bold text-gray-900">
              Registrar Nuevo Caso de Error
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Completa los campos para que el equipo técnico pueda reproducir y corregir el incidente con precisión.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-600">
                MÓDULO DONDE OCURRIÓ *
              </label>
              <select
                value={modulo}
                onChange={(e) => setModulo(e.target.value)}
                className="h-10 w-full rounded-sm border border-gray-200 bg-brand-beige/20 px-3 text-xs font-semibold text-gray-800 outline-none focus:border-brand-dark"
              >
                {MODULOS_PLATAFORMA.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-600">
                TIPO DE INCIDENCIA *
              </label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="h-10 w-full rounded-sm border border-gray-200 bg-brand-beige/20 px-3 text-xs font-semibold text-gray-800 outline-none focus:border-brand-dark"
              >
                {CATEGORIAS_ERROR.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-600">
              NIVEL DE IMPACTO *
            </label>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {SEVERIDADES.map((item) => {
                const activa = severidad === item.valor;
                return (
                  <button
                    key={item.valor}
                    type="button"
                    onClick={() => setSeveridad(item.valor)}
                    className={`flex flex-col rounded-sm border p-2.5 text-left transition-all ${
                      activa
                        ? "border-brand-dark bg-brand-dark text-white shadow-sm"
                        : "border-gray-200 bg-brand-beige/15 text-gray-800 hover:border-brand-dark/40"
                    }`}
                  >
                    <span
                      className={`text-[10px] font-extrabold uppercase tracking-wider ${
                        activa ? "text-brand-gold" : "text-gray-900"
                      }`}
                    >
                      {item.etiqueta}
                    </span>
                    <span
                      className={`mt-1 text-[10px] leading-tight ${
                        activa ? "text-gray-200" : "text-gray-500"
                      }`}
                    >
                      {item.descripcion}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-600">
              TÍTULO BREVE DEL ERROR *
            </label>
            <input
              type="text"
              required
              maxLength={180}
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej. Al cambiar de mes en Calendario no se actualiza la tarjeta lateral"
              className="h-10 w-full rounded-sm border border-gray-200 bg-brand-beige/20 px-3.5 text-xs text-gray-900 outline-none focus:border-brand-dark"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-600">
              DESCRIPCIÓN DETALLADA *
            </label>
            <textarea
              rows={4}
              required
              maxLength={3000}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Explica qué ocurrió, qué mensaje apareció en pantalla o qué comportamiento esperabas ver..."
              className="w-full rounded-sm border border-gray-200 bg-brand-beige/20 p-3.5 text-xs leading-relaxed text-gray-900 outline-none focus:border-brand-dark"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-600">
              PASOS PARA REPRODUCIRLO (OPCIONAL)
            </label>
            <textarea
              rows={2}
              maxLength={2000}
              value={pasosReproducir}
              onChange={(e) => setPasosReproducir(e.target.value)}
              placeholder="1. Entrar a Solicitudes  2. Seleccionar fecha...  3. Presionar Enviar..."
              className="w-full rounded-sm border border-gray-200 bg-brand-beige/20 p-3 text-xs leading-relaxed text-gray-900 outline-none focus:border-brand-dark"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-600">
              CAPTURA DE PANTALLA (OPCIONAL · JPG, PNG O WEBP · MÁX.{" "}
              {TAMANO_MAXIMO_MB} MB)
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleArchivoChange}
                className="text-xs text-gray-600 file:mr-3 file:rounded-sm file:border-0 file:bg-brand-beige file:px-3.5 file:py-2 file:text-[10px] file:font-bold file:uppercase file:tracking-widest file:text-brand-dark hover:file:bg-brand-beige/70"
              />
              {archivoCaptura && (
                <button
                  type="button"
                  onClick={limpiarCaptura}
                  className="text-[10px] font-bold uppercase tracking-widest text-status-danger underline"
                >
                  QUITAR CAPTURA
                </button>
              )}
            </div>

            {previewCaptura && (
              <div className="mt-3 inline-block overflow-hidden rounded-sm border border-gray-200 bg-neutral-100 p-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewCaptura}
                  alt="Vista previa de captura"
                  className="max-h-36 w-auto object-contain"
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-end border-t border-gray-100 pt-4">
            <button
              type="submit"
              disabled={enviando}
              className="rounded-sm bg-brand-dark px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-brand-gold transition-colors hover:bg-brand-dark/90 disabled:opacity-50"
            >
              {enviando ? "ENVIANDO REPORTE..." : "ENVIAR REPORTE DE ERROR"}
            </button>
          </div>
        </form>

        {/* Columna derecha: Historial de reportes enviados por este usuario */}
        <aside className="flex flex-col gap-4 rounded-sm border border-gray-100 bg-brand-surface p-6 shadow-sm lg:col-span-5">
          <div className="border-b border-gray-100 pb-3">
            <h2 className="font-serif text-base font-bold text-gray-900">
              Mis Reportes Enviados ({misReportes.length})
            </h2>
            <p className="mt-0.5 text-[11px] text-gray-500">
              Seguimiento del estado de los casos que has reportado durante las pruebas.
            </p>
          </div>

          {misReportes.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded-sm border border-dashed border-gray-200 bg-brand-beige/15 p-8 text-center">
              <p className="text-xs font-bold text-gray-700">
                Aún no has enviado reportes de error
              </p>
              <p className="mt-1 text-[11px] text-gray-500">
                Cualquier caso que registres en el formulario aparecerá aquí con su estatus actualizado.
              </p>
            </div>
          ) : (
            <div className="flex max-h-[62vh] flex-col gap-3 overflow-y-auto pr-1">
              {misReportes.map((rep) => {
                const badgeEst = obtenerBadgeEstatus(rep.estatus);
                const badgeSev = obtenerBadgeSeveridad(rep.severidad);

                return (
                  <article
                    key={rep.id}
                    className="flex flex-col gap-2 rounded-sm border border-gray-200 bg-brand-beige/15 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={`rounded-sm border px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-wider ${badgeEst.badgeClass}`}
                      >
                        {badgeEst.etiqueta}
                      </span>
                      <span
                        className={`rounded-sm border px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-wider ${badgeSev.badgeClass}`}
                      >
                        {badgeSev.etiqueta}
                      </span>
                    </div>

                    <h3 className="text-xs font-bold text-gray-900">
                      {rep.titulo}
                    </h3>

                    <p className="text-[11px] leading-relaxed text-gray-600">
                      {rep.descripcion}
                    </p>

                    {rep.notas_admin && (
                      <div className="mt-1 rounded-sm border-l-2 border-brand-gold bg-brand-surface p-2.5 text-[11px] text-gray-800">
                        <span className="block text-[9px] font-bold uppercase tracking-widest text-brand-dark">
                          RESPUESTA TÉCNICA:
                        </span>
                        {rep.notas_admin}
                      </div>
                    )}

                    <div className="mt-1 flex items-center justify-between border-t border-gray-200/70 pt-2 text-[10px] text-gray-500">
                      <span className="font-semibold text-gray-700">
                        {rep.modulo}
                      </span>
                      <span>{formatearFechaHora(rep.created_at)}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
