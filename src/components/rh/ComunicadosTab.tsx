"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
} from "@/components/ui/icons";
import { createClient } from "@/lib/supabase/client";

export interface PublicacionMuroRow {
  id: string;
  autor_id?: string | null;
  titulo: string;
  contenido: string;
  requiere_acuse: boolean;
  imagen_url?: string | null;
  fecha_publicacion?: string | null;
  created_at?: string | null;
}

interface ComentarioPendienteRow {
  id: string;
  publicacion_id: string;
  colaborador_id: string;
  tipo_interaccion: "Comentario";
  contenido_comentario: string | null;
  estatus_moderacion: "Pendiente" | "Aprobado" | "Rechazado";
  created_at?: string | null;
  colaboradores?: {
    nombre_completo: string;
  } | null;
  muro_publicaciones?: {
    titulo: string;
  } | null;
}

interface AcuseReciboRow {
  id: string;
  colaborador_id: string;
  created_at?: string | null;
  colaboradores?: {
    nombre_completo: string;
  } | null;
}

type EtapaEnvio = "idle" | "uploading" | "saving";

function obtenerFechaPublicacion(pub: PublicacionMuroRow): string | null {
  return pub.fecha_publicacion ?? pub.created_at ?? null;
}

function formatearFechaComunicado(fechaRaw: string | null | undefined): string {
  if (!fechaRaw) return "Reciente";
  const parsed = new Date(fechaRaw);
  if (Number.isNaN(parsed.getTime())) return fechaRaw;

  return parsed.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function obtenerExtracto(texto: string, maxCaracteres = 220): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (limpio.length <= maxCaracteres) return limpio;
  return `${limpio.slice(0, maxCaracteres).trimEnd()}…`;
}

export default function ComunicadosTab() {
  const [titulo, setTitulo] = useState("");
  const [contenido, setContenido] = useState("");
  const [requiereAcuse, setRequiereAcuse] = useState(false);
  const [imagenArchivo, setImagenArchivo] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const moderacionRef = useRef<HTMLElement | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [etapaEnvio, setEtapaEnvio] = useState<EtapaEnvio>("idle");
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  const [publicaciones, setPublicaciones] = useState<PublicacionMuroRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Estado de Moderación de Comentarios ('Comentario' + 'Pendiente')
  const [comentariosPendientes, setComentariosPendientes] = useState<
    ComentarioPendienteRow[]
  >([]);
  const [isLoadingComentarios, setIsLoadingComentarios] = useState(true);
  const [procesandoComentarioId, setProcesandoComentarioId] = useState<
    string | null
  >(null);

  // Estado del Modal Visor de Acuses ('Acuse_Recibo')
  const [publicacionAcusesActiva, setPublicacionAcusesActiva] =
    useState<PublicacionMuroRow | null>(null);
  const [acusesModalList, setAcusesModalList] = useState<AcuseReciboRow[]>([]);
  const [isLoadingAcuses, setIsLoadingAcuses] = useState(false);
  const [errorAcuses, setErrorAcuses] = useState<string | null>(null);

  // Mapa rápido id -> título de publicación
  const mapaTitulosPublicaciones = useMemo(() => {
    const mapa: Record<string, string> = {};
    for (const pub of publicaciones) {
      mapa[pub.id] = pub.titulo;
    }
    return mapa;
  }, [publicaciones]);

  const fetchPublicaciones = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);

    try {
      const supabase = createClient();

      const primeraConsulta = await supabase
        .from("muro_publicaciones")
        .select("*")
        .order("created_at", { ascending: false });

      if (!primeraConsulta.error && primeraConsulta.data) {
        setPublicaciones(primeraConsulta.data as PublicacionMuroRow[]);
        return;
      }

      const segundaConsulta = await supabase
        .from("muro_publicaciones")
        .select("*")
        .order("fecha_publicacion", { ascending: false });

      if (segundaConsulta.error) {
        setFetchError(
          primeraConsulta.error?.message ?? segundaConsulta.error.message
        );
        setPublicaciones([]);
        return;
      }

      const filasOrdenadas = (
        (segundaConsulta.data ?? []) as PublicacionMuroRow[]
      ).sort((a, b) => {
        const fechaA = obtenerFechaPublicacion(a) ?? "";
        const fechaB = obtenerFechaPublicacion(b) ?? "";
        return fechaB.localeCompare(fechaA);
      });

      setPublicaciones(filasOrdenadas);
    } catch (err) {
      setFetchError(
        err instanceof Error
          ? err.message
          : "Error inesperado al cargar los comunicados."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchComentariosPendientes = useCallback(async () => {
    setIsLoadingComentarios(true);
    try {
      const supabase = createClient();

      const { data, error } = await supabase
        .from("muro_interacciones")
        .select(
          "*, colaboradores!colaborador_id(nombre_completo), muro_publicaciones!publicacion_id(titulo)"
        )
        .eq("tipo_interaccion", "Comentario")
        .eq("estatus_moderacion", "Pendiente")
        .order("created_at", { ascending: false });

      if (!error && data) {
        setComentariosPendientes(data as unknown as ComentarioPendienteRow[]);
        return;
      }

      // Fallback si las llaves foráneas usan relación implícita
      const fallback = await supabase
        .from("muro_interacciones")
        .select("*, colaboradores!colaborador_id(nombre_completo)")
        .eq("tipo_interaccion", "Comentario")
        .eq("estatus_moderacion", "Pendiente")
        .order("created_at", { ascending: false });

      setComentariosPendientes(
        (fallback.data ?? []) as unknown as ComentarioPendienteRow[]
      );
    } finally {
      setIsLoadingComentarios(false);
    }
  }, []);

  useEffect(() => {
    fetchPublicaciones();
    fetchComentariosPendientes();
  }, [fetchPublicaciones, fetchComentariosPendientes]);

  // Cerrar modal de acuses con Escape
  useEffect(() => {
    if (!publicacionAcusesActiva) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPublicacionAcusesActiva(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [publicacionAcusesActiva]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setMensajeExito(null);
    setMensajeError(null);
    setImagenArchivo(file);
  };

  const limpiarArchivoSeleccionado = () => {
    setImagenArchivo(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const tituloLimpio = titulo.trim();
    const contenidoLimpio = contenido.trim();

    if (!tituloLimpio || !contenidoLimpio || isSubmitting) return;

    setIsSubmitting(true);
    setEtapaEnvio(imagenArchivo ? "uploading" : "saving");
    setMensajeExito(null);
    setMensajeError(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user?.id) {
        const msg =
          authError?.message ??
          "Tu sesión ha expirado. Inicia sesión nuevamente para publicar comunicados.";
        setMensajeError(msg);
        alert("Error de autenticación: " + msg);
        return;
      }

      let imagenUrlPublica: string | null = null;

      if (imagenArchivo) {
        setEtapaEnvio("uploading");

        const extension =
          imagenArchivo.name.split(".").pop()?.toLowerCase() || "jpg";
        const baseLimpia = imagenArchivo.name
          .replace(/\.[^/.]+$/, "")
          .replace(/[^a-zA-Z0-9_-]/g, "_")
          .slice(0, 40);
        const fileName = `${Date.now()}_${baseLimpia || "comunicado"}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from("comunicados")
          .upload(fileName, imagenArchivo);

        if (uploadError) {
          setMensajeError(`Error al subir imagen: ${uploadError.message}`);
          alert("Error al subir imagen: " + uploadError.message);
          return;
        }

        const { data: publicUrlData } = supabase.storage
          .from("comunicados")
          .getPublicUrl(fileName);

        imagenUrlPublica = publicUrlData.publicUrl;
      }

      setEtapaEnvio("saving");

      const { data: insertada, error: insertError } = await supabase
        .from("muro_publicaciones")
        .insert({
          titulo: tituloLimpio,
          contenido: contenidoLimpio,
          requiere_acuse: requiereAcuse,
          autor_id: user.id,
          imagen_url: imagenUrlPublica,
        })
        .select("*")
        .maybeSingle();

      if (insertError) {
        setMensajeError(insertError.message);
        alert("Error al publicar comunicado: " + insertError.message);
        return;
      }

      setTitulo("");
      setContenido("");
      setRequiereAcuse(false);
      limpiarArchivoSeleccionado();
      setMensajeExito(tituloLimpio);

      if (insertada) {
        setPublicaciones((prev) => [insertada as PublicacionMuroRow, ...prev]);
      } else {
        await fetchPublicaciones();
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Ocurrió un error inesperado al publicar el comunicado.";
      setMensajeError(msg);
      alert("Error al publicar comunicado: " + msg);
    } finally {
      setIsSubmitting(false);
      setEtapaEnvio("idle");
    }
  };

  /**
   * ACCIÓN 2.1: Moderar Comentario ('Aprobado' | 'Rechazado')
   */
  const handleModerarComentario = async (
    comentarioId: string,
    nuevoEstatus: "Aprobado" | "Rechazado"
  ) => {
    if (procesandoComentarioId) return;
    setProcesandoComentarioId(comentarioId);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("muro_interacciones")
        .update({ estatus_moderacion: nuevoEstatus })
        .eq("id", comentarioId);

      if (error) {
        alert("Error al actualizar comentario: " + error.message);
        return;
      }

      setComentariosPendientes((prev) =>
        prev.filter((item) => item.id !== comentarioId)
      );
    } finally {
      setProcesandoComentarioId(null);
    }
  };

  /**
   * ACCIÓN 2.2: Abrir Modal Visor de Acuses ('Acuse_Recibo') para una publicación
   */
  const handleAbrirVisorAcuses = async (pub: PublicacionMuroRow) => {
    setPublicacionAcusesActiva(pub);
    setAcusesModalList([]);
    setErrorAcuses(null);
    setIsLoadingAcuses(true);

    try {
      const supabase = createClient();

      const { data, error } = await supabase
        .from("muro_interacciones")
        .select(
          "id, colaborador_id, created_at, colaboradores!colaborador_id(nombre_completo)"
        )
        .eq("publicacion_id", pub.id)
        .eq("tipo_interaccion", "Acuse_Recibo")
        .order("created_at", { ascending: false });

      if (!error && data) {
        setAcusesModalList(data as unknown as AcuseReciboRow[]);
        return;
      }

      const fallback = await supabase
        .from("muro_interacciones")
        .select(
          "id, colaborador_id, created_at, colaboradores(nombre_completo)"
        )
        .eq("publicacion_id", pub.id)
        .eq("tipo_interaccion", "Acuse_Recibo")
        .order("created_at", { ascending: false });

      if (fallback.error) {
        setErrorAcuses(error?.message ?? fallback.error.message);
        return;
      }

      setAcusesModalList((fallback.data ?? []) as unknown as AcuseReciboRow[]);
    } catch (err) {
      setErrorAcuses(
        err instanceof Error
          ? err.message
          : "Error inesperado al consultar los acuses de recibo."
      );
    } finally {
      setIsLoadingAcuses(false);
    }
  };

  const obtenerTextoBotonSubmit = (): string => {
    if (!isSubmitting) return "PUBLICAR COMUNICADO";
    if (etapaEnvio === "uploading") return "SUBIENDO IMAGEN…";
    return "PUBLICANDO COMUNICADO…";
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ACCIÓN 2: Alerta muy visible si hay comentarios pendientes de moderación */}
      {comentariosPendientes.length > 0 && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-4 rounded-sm border-l-4 border-status-warning bg-status-warning/10 px-6 py-4 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-status-warning/20 text-status-warning">
              <AlertTriangleIcon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-gray-900">
                Atención RH: Hay {comentariosPendientes.length}{" "}
                {comentariosPendientes.length === 1
                  ? "comentario pendiente"
                  : "comentarios pendientes"}{" "}
                de moderación
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-gray-600">
                Revisa y aprueba o rechaza los comentarios enviados por los colaboradores antes de que sean visibles en el Muro Corporativo.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              moderacionRef.current?.scrollIntoView({ behavior: "smooth" })
            }
            className="rounded-sm bg-brand-dark px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-brand-gold transition-colors hover:bg-brand-dark/90"
          >
            REVISAR COMENTARIOS ({comentariosPendientes.length})
          </button>
        </div>
      )}

      {/* ACCIÓN 1: Formulario Superior de Creación de Comunicados */}
      <section className="rounded-sm border border-gray-100 bg-brand-surface p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-4">
          <div>
            <span className="text-[9px] font-bold uppercase tracking-widest text-brand-gold">
              COMUNICACIÓN INTERNA · RECURSOS HUMANOS
            </span>
            <h2 className="mt-0.5 text-sm font-black text-gray-900">
              Redactar Nuevo Comunicado Institucional
            </h2>
          </div>
          <span className="rounded-sm bg-brand-beige px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-gray-600">
            MURO CORPORATIVO
          </span>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
          {/* Campo: Título */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="comunicado-titulo"
              className="text-[9px] font-bold uppercase tracking-widest text-gray-500"
            >
              TÍTULO DEL COMUNICADO *
            </label>
            <input
              id="comunicado-titulo"
              type="text"
              required
              disabled={isSubmitting}
              placeholder="Ej. Actualización de Políticas de Asistencia 2026"
              value={titulo}
              onChange={(e) => {
                setMensajeExito(null);
                setMensajeError(null);
                setTitulo(e.target.value);
              }}
              className="w-full rounded-sm border border-gray-200 bg-brand-surface px-3.5 py-2.5 text-xs text-gray-800 placeholder:text-gray-400 focus:border-brand-gold focus:outline-none disabled:opacity-60"
            />
          </div>

          {/* Campo: Contenido */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="comunicado-contenido"
              className="text-[9px] font-bold uppercase tracking-widest text-gray-500"
            >
              CONTENIDO DEL ANUNCIO * (LOS ENLACES HTTPS:// SERÁN CLICKEABLES)
            </label>
            <textarea
              id="comunicado-contenido"
              required
              rows={5}
              disabled={isSubmitting}
              placeholder="Redacta el mensaje completo para los colaboradores. Puedes incluir enlaces https://... y saltos de línea."
              value={contenido}
              onChange={(e) => {
                setMensajeExito(null);
                setMensajeError(null);
                setContenido(e.target.value);
              }}
              className="w-full resize-y rounded-sm border border-gray-200 bg-brand-surface px-3.5 py-2.5 text-xs leading-relaxed text-gray-800 placeholder:text-gray-400 focus:border-brand-gold focus:outline-none disabled:opacity-60"
            />
          </div>

          {/* Campo: Imagen Adjunta Opcional */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="comunicado-imagen"
              className="text-[9px] font-bold uppercase tracking-widest text-gray-500"
            >
              IMAGEN ADJUNTA (OPCIONAL)
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileInputRef}
                id="comunicado-imagen"
                type="file"
                accept="image/*"
                disabled={isSubmitting}
                onChange={handleFileChange}
                className="flex-1 rounded-sm border border-gray-200 bg-brand-surface px-3.5 py-2 text-xs text-gray-700 file:mr-3 file:cursor-pointer file:rounded-sm file:border-0 file:bg-brand-dark file:px-3 file:py-1 file:text-[10px] file:font-bold file:uppercase file:tracking-widest file:text-brand-gold hover:file:bg-brand-dark/90 focus:border-brand-gold focus:outline-none disabled:opacity-60"
              />
              {imagenArchivo && (
                <div className="flex items-center gap-2 rounded-sm border border-gray-200 bg-brand-beige/40 px-3 py-1.5 text-[11px] font-medium text-gray-700">
                  <span className="max-w-[200px] truncate">
                    {imagenArchivo.name}
                  </span>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={limpiarArchivoSeleccionado}
                    className="text-[10px] font-bold uppercase tracking-wider text-status-danger hover:underline"
                  >
                    Quitar
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Campo: Requiere Acuse */}
          <div className="rounded-sm border border-gray-100 bg-brand-beige/25 px-4 py-3">
            <label
              htmlFor="comunicado-requiere-acuse"
              style={{ colorScheme: "light" }}
              className="inline-flex min-h-[36px] cursor-pointer items-center gap-3 text-xs font-semibold text-gray-800"
            >
              <input
                id="comunicado-requiere-acuse"
                type="checkbox"
                disabled={isSubmitting}
                checked={requiereAcuse}
                onChange={(e) => setRequiereAcuse(e.target.checked)}
                className="h-4 w-4 cursor-pointer rounded-sm border-gray-300 accent-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-dark disabled:cursor-not-allowed"
              />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-gray-900">
                  ¿Es un aviso obligatorio de leer? (Requiere Acuse de Recibo)
                </span>
                <span className="text-[10px] font-normal text-gray-500">
                  Si se activa, los colaboradores deberán confirmar explícitamente la lectura del comunicado en el Muro Corporativo.
                </span>
              </div>
            </label>
          </div>

          {/* Pie del formulario */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
            <div className="flex-1">
              {mensajeExito && (
                <p className="text-[11px] font-bold text-status-success">
                  ✓ Comunicado &ldquo;{mensajeExito}&rdquo; publicado exitosamente en el Muro Corporativo.
                </p>
              )}
              {mensajeError && (
                <p
                  role="alert"
                  className="text-[11px] font-bold text-status-danger"
                >
                  ✕ {mensajeError}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !titulo.trim() || !contenido.trim()}
              className="ml-auto inline-flex items-center justify-center rounded-sm bg-brand-dark px-6 py-2.5 text-[10px] font-bold uppercase tracking-widest text-brand-gold transition-colors hover:bg-brand-dark/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {obtenerTextoBotonSubmit()}
            </button>
          </div>
        </form>
      </section>

      {/* ACCIÓN 2: Sección de Moderación de Comentarios Pendientes */}
      <section
        ref={moderacionRef}
        className="overflow-hidden rounded-sm border border-gray-100 bg-brand-surface shadow-sm"
      >
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 bg-brand-beige/25 px-6 py-4">
          <div>
            <h2 className="text-sm font-black text-gray-900">
              Moderación de Comentarios del Muro
            </h2>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
              COMENTARIOS CON ESTATUS PENDIENTE EN MURO_INTERACCIONES
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <span
              className={`rounded-sm px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest ${
                comentariosPendientes.length > 0
                  ? "bg-status-warning/15 text-status-warning"
                  : "bg-status-success/15 text-status-success"
              }`}
            >
              {comentariosPendientes.length}{" "}
              {comentariosPendientes.length === 1 ? "PENDIENTE" : "PENDIENTES"}
            </span>
            <button
              type="button"
              onClick={fetchComentariosPendientes}
              disabled={isLoadingComentarios}
              className="rounded-sm border border-gray-200 bg-brand-surface px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-gray-600 transition-colors hover:bg-brand-beige/40 disabled:opacity-50"
            >
              {isLoadingComentarios ? "ACTUALIZANDO…" : "ACTUALIZAR"}
            </button>
          </div>
        </header>

        {isLoadingComentarios ? (
          <div className="flex h-28 items-center justify-center px-6 text-xs font-semibold uppercase tracking-widest text-gray-400">
            Consultando comentarios pendientes…
          </div>
        ) : comentariosPendientes.length === 0 ? (
          <div className="flex h-28 items-center justify-center px-6 text-center text-xs text-gray-400">
            No hay comentarios pendientes de moderación en este momento.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {comentariosPendientes.map((item) => {
              const nombreAutor =
                item.colaboradores?.nombre_completo?.trim() || "Colaborador";
              const tituloPublicacion =
                item.muro_publicaciones?.titulo ||
                mapaTitulosPublicaciones[item.publicacion_id] ||
                "Comunicado Oficial";
              const estaProcesando = procesandoComentarioId === item.id;

              return (
                <article
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-4 px-6 py-5"
                >
                  <div className="flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-xs font-black text-gray-900">
                        {nombreAutor}
                      </h3>
                      <span className="rounded-sm border border-status-warning/30 bg-status-warning/10 px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-status-warning">
                        PENDIENTE
                      </span>
                      <span className="text-[10px] font-medium text-gray-400">
                        {formatearFechaComunicado(item.created_at)}
                      </span>
                    </div>

                    <p className="text-[11px] text-gray-600">
                      <span className="font-bold text-gray-900">
                        Publicación:
                      </span>{" "}
                      {tituloPublicacion}
                    </p>

                    <div className="mt-1">
                      <p className="inline-block rounded-sm border border-gray-100 bg-brand-beige/30 px-3.5 py-2 text-xs text-gray-800">
                        &ldquo;{item.contenido_comentario}&rdquo;
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2.5">
                    <button
                      type="button"
                      disabled={estaProcesando}
                      onClick={() =>
                        handleModerarComentario(item.id, "Rechazado")
                      }
                      className="rounded-sm border border-status-danger/40 bg-brand-surface px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-status-danger transition-colors hover:bg-status-danger/10 disabled:opacity-50"
                    >
                      RECHAZAR
                    </button>

                    <button
                      type="button"
                      disabled={estaProcesando}
                      onClick={() =>
                        handleModerarComentario(item.id, "Aprobado")
                      }
                      className="inline-flex items-center gap-1.5 rounded-sm bg-brand-dark px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-brand-gold transition-colors hover:bg-brand-dark/90 disabled:opacity-50"
                    >
                      <CheckCircleIcon className="h-3.5 w-3.5 text-brand-gold" />
                      APROBAR
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Historial de Comunicados Publicados con botón "Ver Acuses" */}
      <section className="overflow-hidden rounded-sm border border-gray-100 bg-brand-surface shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 bg-brand-beige/25 px-6 py-4">
          <div>
            <h2 className="text-sm font-black text-gray-900">
              Historial de Comunicados Publicados
            </h2>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
              REGISTROS EN TIEMPO REAL DE MURO_PUBLICACIONES Y ACUSES DE RECIBO
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="rounded-sm bg-brand-dark px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-brand-gold">
              {publicaciones.length}{" "}
              {publicaciones.length === 1 ? "PUBLICACIÓN" : "PUBLICACIONES"}
            </span>
            <button
              type="button"
              onClick={fetchPublicaciones}
              disabled={isLoading}
              className="rounded-sm border border-gray-200 bg-brand-surface px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-gray-600 transition-colors hover:bg-brand-beige/40 disabled:opacity-50"
            >
              {isLoading ? "ACTUALIZANDO…" : "ACTUALIZAR"}
            </button>
          </div>
        </header>

        {isLoading ? (
          <div className="flex h-36 items-center justify-center px-6 text-xs font-semibold uppercase tracking-widest text-gray-400">
            Cargando historial de comunicados…
          </div>
        ) : fetchError ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
            <p className="text-xs font-bold text-status-danger">
              Error al consultar publicaciones: {fetchError}
            </p>
            <button
              type="button"
              onClick={fetchPublicaciones}
              className="rounded-sm bg-brand-dark px-4 py-1.5 text-[9px] font-bold uppercase tracking-widest text-white"
            >
              REINTENTAR
            </button>
          </div>
        ) : publicaciones.length === 0 ? (
          <div className="flex h-36 items-center justify-center px-6 text-center text-xs text-gray-400">
            Aún no hay comunicados publicados en el Muro Corporativo.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
            {publicaciones.map((pub) => {
              const fechaStr = formatearFechaComunicado(
                obtenerFechaPublicacion(pub)
              );
              return (
                <article
                  key={pub.id}
                  className="flex flex-col justify-between rounded-sm border border-gray-100 bg-brand-surface p-5 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                        {fechaStr}
                      </span>

                      <div className="flex items-center gap-1.5">
                        {pub.imagen_url && (
                          <span className="inline-flex items-center rounded-sm border border-gray-200 bg-brand-beige/60 px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-gray-600">
                            CON IMAGEN
                          </span>
                        )}
                        {pub.requiere_acuse ? (
                          <span className="inline-flex items-center gap-1 rounded-sm border border-status-warning/40 bg-status-warning/15 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-status-warning">
                            ● REQUIERE ACUSE
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-sm border border-gray-200 bg-brand-beige/60 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-gray-600">
                            AVISO GENERAL
                          </span>
                        )}
                      </div>
                    </div>

                    <h3 className="font-serif text-base font-bold leading-snug text-gray-900">
                      {pub.titulo}
                    </h3>

                    <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-gray-600">
                      {obtenerExtracto(pub.contenido)}
                    </p>

                    {pub.imagen_url && (
                      <div className="mt-3 overflow-hidden rounded-lg border border-gray-100 bg-neutral-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={pub.imagen_url}
                          alt={pub.titulo}
                          loading="lazy"
                          className="w-full h-auto max-h-64 object-contain bg-neutral-100 rounded-lg"
                        />
                      </div>
                    )}
                  </div>

                  {/* Pie de tarjeta con botón "Ver Acuses" */}
                  <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3.5">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">
                      {pub.requiere_acuse
                        ? "SEGUIMIENTO DE LECTURA OBLIGATORIA"
                        : "LECTURA INFORMATIVA"}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleAbrirVisorAcuses(pub)}
                      className="inline-flex items-center gap-1.5 rounded-sm border border-brand-dark bg-brand-surface px-3.5 py-1.5 text-[9px] font-bold uppercase tracking-widest text-brand-dark transition-colors hover:bg-brand-dark hover:text-brand-gold"
                    >
                      <CheckCircleIcon className="h-3.5 w-3.5" />
                      VER ACUSES
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Modal: Visor de Acuses de Recibo por Publicación */}
      {publicacionAcusesActiva && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Visor de acuses de recibo"
          onClick={() => setPublicacionAcusesActiva(null)}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden overscroll-contain bg-black/60 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-md bg-brand-surface shadow-xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-gray-100 bg-brand-dark px-6 py-4 text-white">
              <div>
                <span className="text-[9px] font-bold uppercase tracking-widest text-brand-gold">
                  ACUSES DE RECIBO REGISTRADOS
                </span>
                <h3 className="mt-1 font-serif text-base font-bold leading-snug text-white">
                  {publicacionAcusesActiva.titulo}
                </h3>
              </div>
              <button
                type="button"
                aria-label="Cerrar modal de acuses"
                onClick={() => setPublicacionAcusesActiva(null)}
                className="rounded-sm px-2 py-1 text-sm font-bold text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-6">
              {isLoadingAcuses ? (
                <div className="py-10 text-center text-xs font-bold uppercase tracking-widest text-gray-400">
                  Consultando colaboradores que confirmaron lectura…
                </div>
              ) : errorAcuses ? (
                <div className="py-8 text-center text-xs font-bold text-status-danger">
                  Error al cargar acuses: {errorAcuses}
                </div>
              ) : acusesModalList.length === 0 ? (
                <div className="py-10 text-center text-xs text-gray-400">
                  Ningún colaborador ha registrado su acuse de recibo para este comunicado aún.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      COLABORADORES QUE CONFIRMARON DE ENTERADO
                    </span>
                    <span className="rounded-sm bg-status-success/15 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-status-success">
                      {acusesModalList.length}{" "}
                      {acusesModalList.length === 1
                        ? "CONFIRMADO"
                        : "CONFIRMADOS"}
                    </span>
                  </div>

                  <ul className="divide-y divide-gray-100 rounded-sm border border-gray-100">
                    {acusesModalList.map((acuse) => {
                      const nombreColaborador =
                        acuse.colaboradores?.nombre_completo?.trim() ||
                        "Colaborador";
                      return (
                        <li
                          key={acuse.id}
                          className="flex items-center justify-between gap-3 px-4 py-3"
                        >
                          <div className="flex items-center gap-2.5">
                            <CheckCircleIcon className="h-4 w-4 shrink-0 text-status-success" />
                            <span className="text-xs font-bold text-gray-900">
                              {nombreColaborador}
                            </span>
                          </div>
                          <span className="font-mono text-[10px] text-gray-400">
                            {formatearFechaComunicado(acuse.created_at)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>

            <footer className="flex justify-end border-t border-gray-100 bg-brand-beige/25 px-6 py-3">
              <button
                type="button"
                onClick={() => setPublicacionAcusesActiva(null)}
                className="rounded-sm bg-brand-dark px-5 py-2 text-[9px] font-bold uppercase tracking-widest text-brand-gold transition-colors hover:bg-brand-dark/90"
              >
                CERRAR
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
