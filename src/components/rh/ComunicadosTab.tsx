"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  actualizarPublicacionMuroAction,
  eliminarPublicacionMuroAction,
} from "@/app/actions/muro";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  PencilIcon,
  TrashIcon,
} from "@/components/ui/icons";
import {
  extraerUrlsImagenes,
  formatearAlcancePublicacion,
  serializarUrlsImagenes,
} from "@/lib/muro";
import {
  TAMANO_MAXIMO_BYTES,
  TAMANO_MAXIMO_MB,
  validarMagicBytesArchivo,
} from "@/lib/storage/expedientes";
import { createClient } from "@/lib/supabase/client";

const DEPARTAMENTOS_CORPORATIVOS_BASE = [
  "Administración",
  "Contabilidad",
  "Dirección",
  "Fiscal",
  "Legal",
  "Operaciones",
  "Recursos Humanos",
  "TI / Sistemas",
  "Ventas",
] as const;

export interface PublicacionMuroRow {
  id: string;
  autor_id?: string | null;
  titulo: string;
  contenido: string;
  requiere_acuse: boolean;
  imagen_url?: string | null;
  fecha_publicacion?: string | null;
  empresa_destino?: string | null;
  departamento_destino?: string | null;
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

interface ImagenSeleccionadaItem {
  id: string;
  file: File;
  previewUrl: string;
}

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
  const [empresaDestino, setEmpresaDestino] = useState<"Ambas" | "AIF" | "ROYAL">("Ambas");
  const [departamentoDestino, setDepartamentoDestino] = useState("Todos");
  const [departamentosDisponibles, setDepartamentosDisponibles] = useState<string[]>([
    ...DEPARTAMENTOS_CORPORATIVOS_BASE,
  ]);
  const [fechaProgramada, setFechaProgramada] = useState("");
  const [requiereAcuse, setRequiereAcuse] = useState(false);
  const [imagenesSeleccionadas, setImagenesSeleccionadas] = useState<
    ImagenSeleccionadaItem[]
  >([]);
  const imagenesRef = useRef<ImagenSeleccionadaItem[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const moderacionRef = useRef<HTMLElement | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const enProcesoRef = useRef(false);
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

  // Estado de Edición y Eliminación de Comunicados Publicados
  const [publicacionEditando, setPublicacionEditando] =
    useState<PublicacionMuroRow | null>(null);
  const [urlsExistentesEdicion, setUrlsExistentesEdicion] = useState<string[]>(
    []
  );
  const [publicacionAEliminar, setPublicacionAEliminar] =
    useState<PublicacionMuroRow | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const formularioRef = useRef<HTMLElement | null>(null);

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
        .order("fecha_publicacion", { ascending: false });

      if (!primeraConsulta.error && primeraConsulta.data) {
        const ordenadas = [...(primeraConsulta.data as PublicacionMuroRow[])].sort(
          (a, b) => {
            const fA = obtenerFechaPublicacion(a) ?? "";
            const fB = obtenerFechaPublicacion(b) ?? "";
            return fB.localeCompare(fA);
          }
        );
        setPublicaciones(ordenadas);
        return;
      }

      const segundaConsulta = await supabase
        .from("muro_publicaciones")
        .select("*")
        .order("created_at", { ascending: false });

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

  // Cargar dinámicamente la lista de departamentos desde `colaboradores`
  useEffect(() => {
    let activo = true;
    async function cargarDepartamentos() {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("colaboradores")
          .select("departamento");

        if (!activo || !data) return;

        const mapaUnicos = new Map<string, string>();
        for (const base of DEPARTAMENTOS_CORPORATIVOS_BASE) {
          mapaUnicos.set(base.toLowerCase(), base);
        }

        for (const row of data) {
          const dep = (row.departamento ?? "").trim();
          if (dep && dep.toLowerCase() !== "todos") {
            mapaUnicos.set(dep.toLowerCase(), dep);
          }
        }

        const listaOrdenada = Array.from(mapaUnicos.values()).sort((a, b) =>
          a.localeCompare(b, "es")
        );
        setDepartamentosDisponibles(listaOrdenada);
      } catch {
        // Mantener catálogo base si ocurre algún error de red
      }
    }
    cargarDepartamentos();
    return () => {
      activo = false;
    };
  }, []);

  useEffect(() => {
    imagenesRef.current = imagenesSeleccionadas;
  }, [imagenesSeleccionadas]);

  useEffect(() => {
    return () => {
      for (const item of imagenesRef.current) {
        URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);

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
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    setMensajeExito(null);
    setMensajeError(null);

    const nuevosItems: ImagenSeleccionadaItem[] = files.map((file, idx) => ({
      id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    setImagenesSeleccionadas((prev) => [...prev, ...nuevosItems]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const quitarImagenSeleccionada = (id: string) => {
    setImagenesSeleccionadas((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) {
        URL.revokeObjectURL(item.previewUrl);
      }
      return prev.filter((i) => i.id !== id);
    });
  };

  const moverImagenSeleccionada = (indiceOrigen: number, indiceDestino: number) => {
    setImagenesSeleccionadas((prev) => {
      if (
        indiceOrigen < 0 ||
        indiceOrigen >= prev.length ||
        indiceDestino < 0 ||
        indiceDestino >= prev.length ||
        indiceOrigen === indiceDestino
      ) {
        return prev;
      }
      const copia = [...prev];
      const [movido] = copia.splice(indiceOrigen, 1);
      copia.splice(indiceDestino, 0, movido);
      return copia;
    });
  };

  const limpiarArchivoSeleccionado = () => {
    setImagenesSeleccionadas((prev) => {
      for (const item of prev) {
        URL.revokeObjectURL(item.previewUrl);
      }
      return [];
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleCancelarEdicion = () => {
    setPublicacionEditando(null);
    setUrlsExistentesEdicion([]);
    setTitulo("");
    setContenido("");
    setEmpresaDestino("Ambas");
    setDepartamentoDestino("Todos");
    setFechaProgramada("");
    setRequiereAcuse(false);
    limpiarArchivoSeleccionado();
    setMensajeError(null);
  };

  const handleIniciarEdicionPublicacion = (pub: PublicacionMuroRow) => {
    setMensajeExito(null);
    setMensajeError(null);
    limpiarArchivoSeleccionado();
    setPublicacionEditando(pub);
    setTitulo(pub.titulo ?? "");
    setContenido(pub.contenido ?? "");
    const empRaw = (pub.empresa_destino ?? "Ambas").trim();
    setEmpresaDestino(
      empRaw === "AIF" ? "AIF" : empRaw === "ROYAL" ? "ROYAL" : "Ambas"
    );
    setDepartamentoDestino((pub.departamento_destino ?? "Todos").trim() || "Todos");
    setRequiereAcuse(Boolean(pub.requiere_acuse));
    setUrlsExistentesEdicion(extraerUrlsImagenes(pub.imagen_url));

    if (pub.fecha_publicacion) {
      const d = new Date(pub.fecha_publicacion);
      if (!Number.isNaN(d.getTime())) {
        const localIso = new Date(
          d.getTime() - d.getTimezoneOffset() * 60000
        )
          .toISOString()
          .slice(0, 16);
        setFechaProgramada(localIso);
      } else {
        setFechaProgramada("");
      }
    } else {
      setFechaProgramada("");
    }

    formularioRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleConfirmarEliminarPublicacion = async () => {
    if (!publicacionAEliminar || eliminandoId) return;
    const idTarget = publicacionAEliminar.id;
    setEliminandoId(idTarget);
    setMensajeError(null);

    try {
      const res = await eliminarPublicacionMuroAction(idTarget);
      if (!res.ok) {
        setMensajeError(res.error || "No se pudo eliminar la publicación.");
        return;
      }

      setPublicaciones((prev) => prev.filter((p) => p.id !== idTarget));
      if (publicacionEditando?.id === idTarget) {
        handleCancelarEdicion();
      }
      setPublicacionAEliminar(null);
    } finally {
      setEliminandoId(null);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const tituloLimpio = titulo.trim();
    const contenidoLimpio = contenido.trim();

    if (
      !tituloLimpio ||
      !contenidoLimpio ||
      isSubmitting ||
      enProcesoRef.current
    ) {
      return;
    }

    enProcesoRef.current = true;
    setIsSubmitting(true);
    setEtapaEnvio(imagenesSeleccionadas.length > 0 ? "uploading" : "saving");
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

      let urlsPublicasOrdenadas: string[] = [];

      if (imagenesSeleccionadas.length > 0) {
        setEtapaEnvio("uploading");
        const marcaTiempo = Date.now();

        const resultadosSubida = await Promise.all(
          imagenesSeleccionadas.map(async (item, idx) => {
            const archivoActual = item.file;
            if (archivoActual.size > TAMANO_MAXIMO_BYTES) {
              return {
                ok: false as const,
                idx,
                nombre: archivoActual.name,
                error: `La imagen excede el tamaño máximo permitido (${TAMANO_MAXIMO_MB} MB).`,
              };
            }

            const errMagic = await validarMagicBytesArchivo(
              archivoActual,
              false
            );
            if (errMagic) {
              return {
                ok: false as const,
                idx,
                nombre: archivoActual.name,
                error: errMagic,
              };
            }

            const extensionRaw =
              archivoActual.name.split(".").pop()?.toLowerCase() || "jpg";
            const extension = ["jpg", "jpeg", "png", "webp"].includes(
              extensionRaw
            )
              ? extensionRaw
              : "jpg";
            const baseLimpia = archivoActual.name
              .replace(/\.[^/.]+$/, "")
              .replace(/[^a-zA-Z0-9_-]/g, "_")
              .slice(0, 40);
            const fileName = `${marcaTiempo}_${idx + 1}_${baseLimpia || "comunicado"}.${extension}`;

            const { error: uploadError } = await supabase.storage
              .from("comunicados")
              .upload(fileName, archivoActual);

            if (uploadError) {
              return {
                ok: false as const,
                idx,
                nombre: archivoActual.name,
                error: uploadError.message,
              };
            }

            const { data: publicUrlData } = supabase.storage
              .from("comunicados")
              .getPublicUrl(fileName);

            return {
              ok: true as const,
              url: publicUrlData.publicUrl,
            };
          })
        );

        const primerError = resultadosSubida.find((r) => !r.ok);
        if (primerError && !primerError.ok) {
          setMensajeError(
            `Error al subir imagen #${primerError.idx + 1} (${primerError.nombre}): ${primerError.error}`
          );
          alert(
            `Error al subir imagen #${primerError.idx + 1}: ` +
              primerError.error
          );
          return;
        }

        urlsPublicasOrdenadas = resultadosSubida
          .filter((r): r is { ok: true; url: string } => r.ok)
          .map((r) => r.url);
      }

      const todasLasUrls = [
        ...urlsExistentesEdicion,
        ...urlsPublicasOrdenadas,
      ];
      const imagenUrlPublica = serializarUrlsImagenes(todasLasUrls);

      setEtapaEnvio("saving");

      const fechaPublicacionIso = fechaProgramada.trim()
        ? new Date(fechaProgramada).toISOString()
        : publicacionEditando?.fecha_publicacion ?? new Date().toISOString();

      if (publicacionEditando) {
        const resUpdate = await actualizarPublicacionMuroAction({
          id: publicacionEditando.id,
          titulo: tituloLimpio,
          contenido: contenidoLimpio,
          empresa_destino: empresaDestino,
          departamento_destino: departamentoDestino,
          fecha_publicacion: fechaPublicacionIso,
          requiere_acuse: requiereAcuse,
          imagen_url: imagenUrlPublica,
        });

        if (!resUpdate.ok) {
          const msgErr =
            resUpdate.error || "No se pudo actualizar el comunicado.";
          setMensajeError(msgErr);
          return;
        }

        const actualizadaRow: PublicacionMuroRow = resUpdate.publicacion
          ? (resUpdate.publicacion as unknown as PublicacionMuroRow)
          : {
              ...publicacionEditando,
              titulo: tituloLimpio,
              contenido: contenidoLimpio,
              empresa_destino: empresaDestino,
              departamento_destino: departamentoDestino,
              fecha_publicacion: fechaPublicacionIso,
              requiere_acuse: requiereAcuse,
              imagen_url: imagenUrlPublica,
            };

        setPublicaciones((prev) =>
          prev
            .map((p) => (p.id === actualizadaRow.id ? actualizadaRow : p))
            .sort((a, b) => {
              const fA = obtenerFechaPublicacion(a) ?? "";
              const fB = obtenerFechaPublicacion(b) ?? "";
              return fB.localeCompare(fA);
            })
        );

        handleCancelarEdicion();
        setMensajeExito(`${tituloLimpio} (Actualizado)`);
        return;
      }

      const { data: insertada, error: insertError } = await supabase
        .from("muro_publicaciones")
        .insert({
          titulo: tituloLimpio,
          contenido: contenidoLimpio,
          requiere_acuse: requiereAcuse,
          autor_id: user.id,
          imagen_url: imagenUrlPublica,
          fecha_publicacion: fechaPublicacionIso,
          empresa_destino: empresaDestino,
          departamento_destino: departamentoDestino,
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
      setEmpresaDestino("Ambas");
      setDepartamentoDestino("Todos");
      setFechaProgramada("");
      setRequiereAcuse(false);
      limpiarArchivoSeleccionado();
      setMensajeExito(tituloLimpio);

      if (insertada) {
        setPublicaciones((prev) =>
          [insertada as PublicacionMuroRow, ...prev].sort((a, b) => {
            const fA = obtenerFechaPublicacion(a) ?? "";
            const fB = obtenerFechaPublicacion(b) ?? "";
            return fB.localeCompare(fA);
          })
        );
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
      enProcesoRef.current = false;
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
    if (!isSubmitting) {
      return publicacionEditando
        ? "GUARDAR CAMBIOS DEL COMUNICADO"
        : "PUBLICAR COMUNICADO";
    }
    if (etapaEnvio === "uploading") {
      return imagenesSeleccionadas.length > 1
        ? `SUBIENDO ${imagenesSeleccionadas.length} IMÁGENES…`
        : "SUBIENDO IMAGEN…";
    }
    return publicacionEditando
      ? "GUARDANDO CAMBIOS…"
      : "PUBLICANDO COMUNICADO…";
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

      {/* ACCIÓN 1: Formulario Superior de Creación / Edición de Comunicados */}
      <section
        ref={formularioRef}
        className={`rounded-sm border bg-brand-surface p-6 shadow-sm ${
          publicacionEditando
            ? "border-brand-gold ring-2 ring-brand-gold/40"
            : "border-gray-100"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-4">
          <div>
            <span className="text-[9px] font-bold uppercase tracking-widest text-brand-gold">
              COMUNICACIÓN INTERNA · RECURSOS HUMANOS
            </span>
            <h2 className="mt-0.5 text-sm font-black text-gray-900">
              {publicacionEditando
                ? `Editando Comunicado: "${publicacionEditando.titulo}"`
                : "Redactar Nuevo Comunicado Institucional"}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {publicacionEditando && (
              <button
                type="button"
                onClick={handleCancelarEdicion}
                disabled={isSubmitting}
                className="rounded-sm border border-gray-300 bg-brand-surface px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-gray-700 transition-colors hover:bg-gray-100"
              >
                ✕ CANCELAR EDICIÓN
              </button>
            )}
            <span className="rounded-sm bg-brand-beige px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-gray-600">
              {publicacionEditando ? "MODO EDICIÓN" : "MURO CORPORATIVO"}
            </span>
          </div>
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

          {/* Selectores de Segmentación de Audiencia: Empresa y Departamento */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Selector 1: Empresa Destino */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="comunicado-empresa-destino"
                className="text-[9px] font-bold uppercase tracking-widest text-gray-500"
              >
                EMPRESA DESTINO *
              </label>
              <select
                id="comunicado-empresa-destino"
                disabled={isSubmitting}
                value={empresaDestino}
                onChange={(e) => {
                  setMensajeExito(null);
                  setMensajeError(null);
                  setEmpresaDestino(
                    e.target.value as "Ambas" | "AIF" | "ROYAL"
                  );
                }}
                className="w-full rounded-sm border border-gray-200 bg-brand-surface px-3.5 py-2.5 text-xs font-medium text-gray-800 focus:border-brand-gold focus:outline-none disabled:opacity-60"
              >
                <option value="Ambas">Ambas (AIF y ROYAL)</option>
                <option value="AIF">AIF</option>
                <option value="ROYAL">ROYAL</option>
              </select>
            </div>

            {/* Selector 2: Departamento Destino */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="comunicado-departamento-destino"
                className="text-[9px] font-bold uppercase tracking-widest text-gray-500"
              >
                DEPARTAMENTO DESTINO *
              </label>
              <select
                id="comunicado-departamento-destino"
                disabled={isSubmitting}
                value={departamentoDestino}
                onChange={(e) => {
                  setMensajeExito(null);
                  setMensajeError(null);
                  setDepartamentoDestino(e.target.value);
                }}
                className="w-full rounded-sm border border-gray-200 bg-brand-surface px-3.5 py-2.5 text-xs font-medium text-gray-800 focus:border-brand-gold focus:outline-none disabled:opacity-60"
              >
                <option value="Todos">Todos los departamentos</option>
                {departamentosDisponibles.map((dep) => (
                  <option key={dep} value={dep}>
                    {dep}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Campo: Programar publicación (Opcional) e Imagen Adjunta */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="comunicado-fecha-programacion"
                className="text-[9px] font-bold uppercase tracking-widest text-gray-500"
              >
                PROGRAMAR PUBLICACIÓN (OPCIONAL)
              </label>
              <input
                id="comunicado-fecha-programacion"
                type="datetime-local"
                disabled={isSubmitting}
                value={fechaProgramada}
                onChange={(e) => {
                  setMensajeExito(null);
                  setMensajeError(null);
                  setFechaProgramada(e.target.value);
                }}
                className="w-full rounded-sm border border-gray-200 bg-brand-surface px-3.5 py-2 text-xs text-gray-800 focus:border-brand-gold focus:outline-none disabled:opacity-60"
              />
              <span className="text-[10px] text-gray-400">
                Si lo dejas vacío, el comunicado se publicará inmediatamente.
              </span>
            </div>

            {/* Campo: Imágenes Adjuntas Opcionales (Múltiples con Ordenamiento) */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="comunicado-imagen"
                  className="text-[9px] font-bold uppercase tracking-widest text-gray-500"
                >
                  IMÁGENES ADJUNTAS (OPCIONAL · PUEDES SELECCIONAR VARIAS)
                </label>
                {imagenesSeleccionadas.length > 0 && (
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={limpiarArchivoSeleccionado}
                    className="text-[9px] font-bold uppercase tracking-wider text-status-danger hover:underline"
                  >
                    Vaciar todas ({imagenesSeleccionadas.length})
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={fileInputRef}
                  id="comunicado-imagen"
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={isSubmitting}
                  onChange={handleFileChange}
                  className="flex-1 rounded-sm border border-gray-200 bg-brand-surface px-3.5 py-2 text-xs text-gray-700 file:mr-3 file:cursor-pointer file:rounded-sm file:border-0 file:bg-brand-dark file:px-3 file:py-1 file:text-[10px] file:font-bold file:uppercase file:tracking-widest file:text-brand-gold hover:file:bg-brand-dark/90 focus:border-brand-gold focus:outline-none disabled:opacity-60"
                />
              </div>
              <span className="text-[10px] text-gray-400">
                Puedes agregar una o más imágenes y ordenarlas antes de publicar.
              </span>
            </div>
          </div>

          {/* Imágenes ya publicadas cuando se está editando un comunicado */}
          {publicacionEditando && urlsExistentesEdicion.length > 0 && (
            <div className="rounded-sm border border-brand-gold/40 bg-brand-beige/25 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-brand-dark">
                    IMÁGENES ACTUALES DEL COMUNICADO ({urlsExistentesEdicion.length})
                  </span>
                  <p className="text-[10px] text-gray-500">
                    Puedes quitar alguna imagen actual con (✕) o adjuntar nuevas imágenes arriba.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setUrlsExistentesEdicion([])}
                  className="text-[9px] font-bold uppercase tracking-wider text-status-danger hover:underline"
                >
                  Quitar todas las actuales
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {urlsExistentesEdicion.map((urlImg, idxImg) => (
                  <div
                    key={`edit-img-${idxImg}`}
                    className="relative aspect-[4/3] w-full overflow-hidden rounded-md border border-gray-200 bg-neutral-100"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={urlImg}
                      alt={`Imagen actual ${idxImg + 1}`}
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute left-2 top-2 rounded-sm bg-brand-dark/90 px-2 py-0.5 text-[9px] font-bold text-brand-gold">
                      #{idxImg + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setUrlsExistentesEdicion((prev) =>
                          prev.filter((_, i) => i !== idxImg)
                        )
                      }
                      title="Quitar imagen"
                      className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-[11px] font-bold text-white transition-colors hover:bg-status-danger"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Galería de previsualización y ordenamiento de imágenes seleccionadas */}
          {imagenesSeleccionadas.length > 0 && (
            <div className="rounded-sm border border-gray-200 bg-brand-beige/25 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-brand-dark">
                    ORDEN DE IMÁGENES EN LA PUBLICACIÓN ({imagenesSeleccionadas.length})
                  </span>
                  <p className="text-[10px] text-gray-500">
                    Arrastra las tarjetas o usa las flechas (← / →) para definir el orden exacto en que se mostrarán en el Muro.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {imagenesSeleccionadas.map((item, idx) => (
                  <div
                    key={item.id}
                    draggable={!isSubmitting}
                    onDragStart={() => setDraggedIndex(idx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (draggedIndex !== null && draggedIndex !== idx) {
                        moverImagenSeleccionada(draggedIndex, idx);
                      }
                      setDraggedIndex(null);
                    }}
                    onDragEnd={() => setDraggedIndex(null)}
                    className={`group relative flex flex-col overflow-hidden rounded-md border bg-brand-surface shadow-sm transition-all ${
                      draggedIndex === idx
                        ? "border-brand-gold opacity-60 ring-2 ring-brand-gold"
                        : "border-gray-200 hover:border-brand-gold/70"
                    }`}
                  >
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-neutral-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.previewUrl}
                        alt={`Previsualización ${idx + 1}: ${item.file.name}`}
                        className="h-full w-full object-cover"
                      />
                      <span className="absolute left-2 top-2 rounded-sm bg-brand-dark/90 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-brand-gold shadow">
                        #{idx + 1}
                      </span>
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => quitarImagenSeleccionada(item.id)}
                        title="Quitar imagen"
                        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-[11px] font-bold text-white transition-colors hover:bg-status-danger"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-1 border-t border-gray-100 px-2.5 py-1.5">
                      <span
                        title={item.file.name}
                        className="truncate text-[10px] font-medium text-gray-600"
                      >
                        {item.file.name}
                      </span>

                      {imagenesSeleccionadas.length > 1 && (
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            disabled={isSubmitting || idx === 0}
                            onClick={() => moverImagenSeleccionada(idx, idx - 1)}
                            title="Mover antes"
                            aria-label={`Mover imagen ${idx + 1} a la posición ${idx}`}
                            className="rounded border border-gray-200 bg-brand-beige/40 px-1.5 py-0.5 text-[10px] font-bold text-gray-700 transition-colors hover:bg-brand-dark hover:text-brand-gold disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            ←
                          </button>
                          <button
                            type="button"
                            disabled={
                              isSubmitting ||
                              idx === imagenesSeleccionadas.length - 1
                            }
                            onClick={() => moverImagenSeleccionada(idx, idx + 1)}
                            title="Mover después"
                            aria-label={`Mover imagen ${idx + 1} a la posición ${idx + 2}`}
                            className="rounded border border-gray-200 bg-brand-beige/40 px-1.5 py-0.5 text-[10px] font-bold text-gray-700 transition-colors hover:bg-brand-dark hover:text-brand-gold disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            →
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                  id={`comentario-${item.id}`}
                  className="flex flex-wrap items-center justify-between gap-4 px-6 py-5 target:bg-brand-beige/40"
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
              const fechaPubRaw = obtenerFechaPublicacion(pub);
              const fechaStr = formatearFechaComunicado(fechaPubRaw);
              const esProgramado = Boolean(
                pub.fecha_publicacion &&
                  new Date(pub.fecha_publicacion).getTime() > Date.now()
              );
              const alcanceBadge = formatearAlcancePublicacion(
                pub.empresa_destino,
                pub.departamento_destino
              );
              const imagenesPub = extraerUrlsImagenes(pub.imagen_url);

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

                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center rounded-sm border border-brand-gold/40 bg-brand-beige/60 px-2.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-brand-dark">
                          {alcanceBadge}
                        </span>
                        {esProgramado && (
                          <span className="inline-flex items-center gap-1 rounded-sm border border-brand-gold bg-brand-dark px-2.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-brand-gold">
                            ● PROGRAMADO
                          </span>
                        )}
                        {imagenesPub.length > 0 && (
                          <span className="inline-flex items-center rounded-sm border border-gray-200 bg-brand-beige/60 px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-gray-600">
                            {imagenesPub.length === 1
                              ? "CON IMAGEN"
                              : `${imagenesPub.length} IMÁGENES`}
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

                    {imagenesPub.length === 1 && (
                      <div className="mt-3 overflow-hidden rounded-lg border border-gray-100 bg-neutral-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imagenesPub[0]}
                          alt={pub.titulo}
                          loading="lazy"
                          className="h-auto max-h-64 w-full rounded-lg bg-neutral-100 object-contain"
                        />
                      </div>
                    )}

                    {imagenesPub.length > 1 && (
                      <div
                        className={`mt-3 grid gap-2 ${
                          imagenesPub.length === 2
                            ? "grid-cols-2"
                            : "grid-cols-2 sm:grid-cols-3"
                        }`}
                      >
                        {imagenesPub.slice(0, 6).map((urlImg, idxImg) => (
                          <div
                            key={`${pub.id}-img-${idxImg}`}
                            className="relative aspect-[4/3] w-full overflow-hidden rounded-md border border-gray-200 bg-neutral-100"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={urlImg}
                              alt={`${pub.titulo} - imagen ${idxImg + 1}`}
                              loading="lazy"
                              className="h-full w-full object-cover"
                            />
                            <span className="absolute left-1.5 top-1.5 rounded-sm bg-black/65 px-1.5 py-0.5 text-[8px] font-bold text-white">
                              #{idxImg + 1}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Pie de tarjeta con botones "Editar", "Eliminar" y "Ver Acuses" */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3.5">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">
                      {pub.requiere_acuse
                        ? "SEGUIMIENTO DE LECTURA OBLIGATORIA"
                        : "LECTURA INFORMATIVA"}
                    </span>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleIniciarEdicionPublicacion(pub)}
                        className="inline-flex items-center gap-1.5 rounded-sm border border-gray-300 bg-brand-surface px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-gray-700 transition-colors hover:border-brand-dark hover:bg-brand-beige/40 hover:text-brand-dark"
                      >
                        <PencilIcon className="h-3.5 w-3.5" />
                        EDITAR
                      </button>

                      <button
                        type="button"
                        onClick={() => setPublicacionAEliminar(pub)}
                        className="inline-flex items-center gap-1.5 rounded-sm border border-status-danger/35 bg-brand-surface px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-status-danger transition-colors hover:bg-status-danger/10"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                        ELIMINAR
                      </button>

                      <button
                        type="button"
                        onClick={() => handleAbrirVisorAcuses(pub)}
                        className="inline-flex items-center gap-1.5 rounded-sm border border-brand-dark bg-brand-surface px-3.5 py-1.5 text-[9px] font-bold uppercase tracking-widest text-brand-dark transition-colors hover:bg-brand-dark hover:text-brand-gold"
                      >
                        <CheckCircleIcon className="h-3.5 w-3.5" />
                        VER ACUSES
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Modal de Confirmación para Eliminar Comunicado */}
      {publicacionAEliminar && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar eliminación de comunicado"
          onClick={() => !eliminandoId && setPublicacionAEliminar(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-md flex-col overflow-hidden rounded-sm bg-brand-surface shadow-2xl"
          >
            <header className="border-b border-gray-100 bg-brand-dark px-6 py-4 text-white">
              <span className="text-[9px] font-bold uppercase tracking-widest text-brand-gold">
                CONFIRMACIÓN DE SEGURIDAD
              </span>
              <h3 className="mt-1 font-serif text-base font-bold text-white">
                ¿Eliminar comunicado del Muro Corporativo?
              </h3>
            </header>

            <div className="flex flex-col gap-3 p-6 text-xs text-gray-700">
              <p>
                Estás a punto de eliminar permanentemente el comunicado:
              </p>
              <div className="rounded-sm border border-gray-200 bg-brand-beige/30 p-3 font-bold text-gray-900">
                &ldquo;{publicacionAEliminar.titulo}&rdquo;
              </div>
              <p className="text-[11px] text-gray-500">
                Esta acción también eliminará sus reacciones, comentarios y acuses de recibo asociados.
              </p>
            </div>

            <footer className="flex items-center justify-end gap-2.5 border-t border-gray-100 bg-brand-beige/20 px-6 py-3.5">
              <button
                type="button"
                disabled={Boolean(eliminandoId)}
                onClick={() => setPublicacionAEliminar(null)}
                className="rounded-sm border border-gray-300 bg-brand-surface px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50"
              >
                CANCELAR
              </button>
              <button
                type="button"
                disabled={Boolean(eliminandoId)}
                onClick={handleConfirmarEliminarPublicacion}
                className="rounded-sm bg-status-danger px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-status-danger/90 disabled:opacity-50"
              >
                {eliminandoId ? "ELIMINANDO…" : "SÍ, ELIMINAR COMUNICADO"}
              </button>
            </footer>
          </div>
        </div>
      )}

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
