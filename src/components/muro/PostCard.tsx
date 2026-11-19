"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { enviarComentarioMuroAction } from "@/app/actions/muro";
import { CheckCircleIcon, MessageSquareIcon } from "@/components/ui/icons";
import {
  extraerUrlsImagenes,
  formatearAlcancePublicacion,
  formatearFechaPublicacion,
  partesFecha,
  segmentarContenidoConEnlaces,
} from "@/lib/muro";
import { createClient } from "@/lib/supabase/client";
import type {
  InteraccionMuroRow,
  PublicacionMuro,
  TipoReaccionMuro,
} from "@/types/muro";

interface PostCardProps {
  publicacion: PublicacionMuro;
  currentUserId: string | null;
  interaccionesIniciales?: InteraccionMuroRow[];
  isPriorityImage?: boolean;
  isHighlighted?: boolean;
  onExpandImage?: (
    url: string,
    todasLasUrls?: string[],
    indiceActual?: number
  ) => void;
}

interface ConfigReaccion {
  tipo: TipoReaccionMuro;
  emoji: string;
  label: string;
  activeButtonClass: string;
}

const CATALOGO_REACCIONES: ConfigReaccion[] = [
  {
    tipo: "Like",
    emoji: "👍",
    label: "Like",
    activeButtonClass: "border-brand-gold bg-brand-gold/15 text-brand-dark",
  },
  {
    tipo: "Celebrar",
    emoji: "👏",
    label: "Celebrar",
    activeButtonClass:
      "border-status-success/50 bg-status-success/15 text-status-success",
  },
  {
    tipo: "Interesante",
    emoji: "💡",
    label: "Interesante",
    activeButtonClass:
      "border-status-warning/50 bg-status-warning/15 text-status-warning",
  },
  {
    tipo: "Apoyo",
    emoji: "🤝",
    label: "Apoyo",
    activeButtonClass: "border-brand-dark bg-brand-dark text-brand-gold",
  },
];

const TIPOS_REACCION: TipoReaccionMuro[] = [
  "Like",
  "Celebrar",
  "Interesante",
  "Apoyo",
];

function esTipoReaccion(valor: string): valor is TipoReaccionMuro {
  return (TIPOS_REACCION as string[]).includes(valor);
}

const INTERACCIONES_VACIAS: InteraccionMuroRow[] = [];

export default function PostCard({
  publicacion,
  currentUserId,
  interaccionesIniciales = INTERACCIONES_VACIAS,
  isPriorityImage = false,
  isHighlighted = false,
  onExpandImage,
}: PostCardProps) {
  const [indiceExpandidoLocal, setIndiceExpandidoLocal] = useState<
    number | null
  >(null);

  const imagenes = useMemo(
    () => extraerUrlsImagenes(publicacion.imagen_url),
    [publicacion.imagen_url]
  );

  const [interacciones, setInteracciones] = useState<InteraccionMuroRow[]>(
    interaccionesIniciales
  );
  const [menuReaccionesAbierto, setMenuReaccionesAbierto] = useState(false);
  const [isReacting, setIsReacting] = useState(false);
  const isReactingRef = useRef(false);

  // Sincronizar cuando el padre recargue las interacciones
  useEffect(() => {
    setInteracciones(interaccionesIniciales);
  }, [interaccionesIniciales]);

  // Filtrar todas las reacciones ('Like' | 'Celebrar' | 'Interesante' | 'Apoyo')
  const reaccionesList = useMemo(
    () => interacciones.filter((i) => esTipoReaccion(i.tipo_interaccion)),
    [interacciones]
  );

  // Detectar la reacción actual del usuario autenticado (máximo 1 por regla de negocio)
  const miReaccionActiva = useMemo<TipoReaccionMuro | null>(() => {
    if (!currentUserId) return null;
    const encontrada = reaccionesList.find(
      (i) => i.colaborador_id === currentUserId
    );
    return encontrada && esTipoReaccion(encontrada.tipo_interaccion)
      ? encontrada.tipo_interaccion
      : null;
  }, [reaccionesList, currentUserId]);

  const configMiReaccion = useMemo(
    () =>
      miReaccionActiva
        ? CATALOGO_REACCIONES.find((r) => r.tipo === miReaccionActiva) ?? null
        : null,
    [miReaccionActiva]
  );

  // Conteo agrupado por cada tipo de reacción
  const conteoPorReaccion = useMemo(() => {
    const conteo: Record<TipoReaccionMuro, number> = {
      Like: 0,
      Celebrar: 0,
      Interesante: 0,
      Apoyo: 0,
    };
    for (const item of reaccionesList) {
      if (esTipoReaccion(item.tipo_interaccion)) {
        conteo[item.tipo_interaccion] += 1;
      }
    }
    return conteo;
  }, [reaccionesList]);

  const reaccionesConConteo = useMemo(
    () => CATALOGO_REACCIONES.filter((r) => conteoPorReaccion[r.tipo] > 0),
    [conteoPorReaccion]
  );

  // Estado derivado de Acuse de Recibo
  const yaTieneAcuse = useMemo(
    () =>
      Boolean(
        currentUserId &&
          interacciones.some(
            (i) =>
              i.tipo_interaccion === "Acuse_Recibo" &&
              i.colaborador_id === currentUserId
          )
      ),
    [interacciones, currentUserId]
  );

  const [acuseConfirmado, setAcuseConfirmado] = useState<boolean>(yaTieneAcuse);
  const [isSubmittingAcuse, setIsSubmittingAcuse] = useState(false);
  const isSubmittingAcuseRef = useRef(false);

  useEffect(() => {
    setAcuseConfirmado(yaTieneAcuse);
  }, [yaTieneAcuse]);

  // Comentarios aprobados para mostrar en la tarjeta
  const comentariosAprobados = useMemo(
    () =>
      interacciones.filter(
        (i) =>
          i.tipo_interaccion === "Comentario" &&
          i.estatus_moderacion === "Aprobado"
      ),
    [interacciones]
  );

  // Estado del formulario de comentario
  const [textoComentario, setTextoComentario] = useState("");
  const [isSubmittingComentario, setIsSubmittingComentario] = useState(false);
  const isSubmittingComentarioRef = useRef(false);
  const [comentarioEnviadoRevision, setComentarioEnviadoRevision] =
    useState(false);
  const [errorInteraccion, setErrorInteraccion] = useState<string | null>(null);

  const fechaBase =
    publicacion.fecha_publicacion ?? publicacion.created_at ?? null;
  const esProgramado = Boolean(
    publicacion.fecha_publicacion &&
      new Date(publicacion.fecha_publicacion).getTime() > Date.now()
  );
  const { dia, mes } = useMemo(() => partesFecha(fechaBase), [fechaBase]);
  const fechaAmigable = useMemo(
    () => formatearFechaPublicacion(fechaBase),
    [fechaBase]
  );
  const nombreAutor =
    publicacion.colaboradores?.nombre_completo?.trim() || "Recursos Humanos";
  const alcancePublicacion = useMemo(
    () =>
      formatearAlcancePublicacion(
        publicacion.empresa_destino,
        publicacion.departamento_destino
      ),
    [publicacion.empresa_destino, publicacion.departamento_destino]
  );

  const segmentosContenido = useMemo(
    () => segmentarContenidoConEnlaces(publicacion.contenido),
    [publicacion.contenido]
  );

  useEffect(() => {
    if (indiceExpandidoLocal === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIndiceExpandidoLocal(null);
      } else if (e.key === "ArrowRight" && imagenes.length > 1) {
        setIndiceExpandidoLocal((prev) =>
          prev === null ? null : (prev + 1) % imagenes.length
        );
      } else if (e.key === "ArrowLeft" && imagenes.length > 1) {
        setIndiceExpandidoLocal((prev) =>
          prev === null
            ? null
            : (prev - 1 + imagenes.length) % imagenes.length
        );
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [indiceExpandidoLocal, imagenes.length]);

  const resolverUserId = async (): Promise<string | null> => {
    if (currentUserId) return currentUserId;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  };

  /**
   * ACCIÓN 1.1: Confirmar Acuse de Recibo ('Acuse_Recibo', 'Aprobado')
   */
  const handleConfirmarAcuse = async () => {
    if (acuseConfirmado || isSubmittingAcuse || isSubmittingAcuseRef.current) {
      return;
    }

    isSubmittingAcuseRef.current = true;
    setIsSubmittingAcuse(true);
    setErrorInteraccion(null);

    try {
      const supabase = createClient();
      const targetUserId = await resolverUserId();

      if (!targetUserId) {
        setErrorInteraccion("Inicia sesión para confirmar el acuse de recibo.");
        return;
      }

      const { data: existente } = await supabase
        .from("muro_interacciones")
        .select("id")
        .eq("publicacion_id", publicacion.id)
        .eq("colaborador_id", targetUserId)
        .eq("tipo_interaccion", "Acuse_Recibo")
        .limit(1)
        .maybeSingle();

      if (existente?.id) {
        setAcuseConfirmado(true);
        return;
      }

      const { data: nuevoAcuse, error } = await supabase
        .from("muro_interacciones")
        .insert({
          publicacion_id: publicacion.id,
          colaborador_id: targetUserId,
          tipo_interaccion: "Acuse_Recibo",
          estatus_moderacion: "Aprobado",
        })
        .select("*")
        .maybeSingle();

      if (error) {
        setErrorInteraccion(`No se pudo registrar el acuse: ${error.message}`);
        return;
      }

      setAcuseConfirmado(true);
      if (nuevoAcuse) {
        setInteracciones((prev) => [
          ...prev,
          nuevoAcuse as unknown as InteraccionMuroRow,
        ]);
      }
    } finally {
      isSubmittingAcuseRef.current = false;
      setIsSubmittingAcuse(false);
    }
  };

  /**
   * Iteración 9.3: Lógica Definitiva de Reacciones (Find -> Update / Delete / Insert)
   * 1. Busca primero si el usuario ya tiene una reacción en esta publicación (`maybeSingle()`).
   * 2A. Si existe y es la MISMA reacción -> `DELETE` por `id`.
   * 2B. Si existe y es DIFERENTE -> `UPDATE` de `tipo_interaccion` por `id` (sin tocar el unique constraint).
   * 2C. Si NO existe -> `INSERT` del nuevo registro.
   */
  const handleReaccion = async (reaccionElegida: TipoReaccionMuro) => {
    if (isReacting || isReactingRef.current) return;

    isReactingRef.current = true;
    setIsReacting(true);
    setMenuReaccionesAbierto(false);
    setErrorInteraccion(null);

    const id_publicacion = publicacion.id;

    try {
      const supabase = createClient();
      const id_usuario = await resolverUserId();

      if (!id_usuario) {
        setErrorInteraccion("Inicia sesión para reaccionar al comunicado.");
        return;
      }

      // 1. Buscar si el usuario ya tiene alguna reacción en esta publicación
      const { data: reaccionExistente, error: fetchError } = await supabase
        .from("muro_interacciones")
        .select("id, tipo_interaccion")
        .eq("publicacion_id", id_publicacion)
        .eq("colaborador_id", id_usuario)
        .in("tipo_interaccion", ["Like", "Celebrar", "Interesante", "Apoyo"])
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (reaccionExistente) {
        if (reaccionExistente.tipo_interaccion === reaccionElegida) {
          // 2A. Hizo clic en la MISMA reacción que ya tenía -> Quiere QUITARLA
          const { error: deleteError } = await supabase
            .from("muro_interacciones")
            .delete()
            .eq("id", reaccionExistente.id);

          if (deleteError) throw deleteError;

          setInteracciones((prev) =>
            prev.filter(
              (i) =>
                i.id !== reaccionExistente.id &&
                !(
                  i.colaborador_id === id_usuario &&
                  esTipoReaccion(i.tipo_interaccion)
                )
            )
          );
        } else {
          // 2B. Eligió una reacción DIFERENTE -> Quiere ACTUALIZARLA (Editar)
          const { error: updateError } = await supabase
            .from("muro_interacciones")
            .update({ tipo_interaccion: reaccionElegida })
            .eq("id", reaccionExistente.id);

          if (updateError) throw updateError;

          setInteracciones((prev) => {
            const actualizadas = prev.map((i) =>
              i.id === reaccionExistente.id ||
              (i.colaborador_id === id_usuario &&
                esTipoReaccion(i.tipo_interaccion))
                ? { ...i, id: reaccionExistente.id, tipo_interaccion: reaccionElegida }
                : i
            );
            const existeEnEstado = actualizadas.some(
              (i) => i.id === reaccionExistente.id
            );
            return existeEnEstado
              ? actualizadas
              : [
                  ...actualizadas,
                  {
                    id: reaccionExistente.id,
                    publicacion_id: id_publicacion,
                    colaborador_id: id_usuario,
                    tipo_interaccion: reaccionElegida,
                    contenido_comentario: null,
                    estatus_moderacion: "Aprobado",
                  },
                ];
          });
        }
      } else {
        // 2C. NO tenía ninguna reacción -> Quiere CREARLA
        const { data: insertData, error: insertError } = await supabase
          .from("muro_interacciones")
          .insert({
            publicacion_id: id_publicacion,
            colaborador_id: id_usuario,
            tipo_interaccion: reaccionElegida,
            estatus_moderacion: "Aprobado",
          })
          .select("*")
          .maybeSingle();

        if (insertError) throw insertError;

        const filaInsertada: InteraccionMuroRow = insertData
          ? (insertData as unknown as InteraccionMuroRow)
          : {
              id: `temp-${Date.now()}`,
              publicacion_id: id_publicacion,
              colaborador_id: id_usuario,
              tipo_interaccion: reaccionElegida,
              contenido_comentario: null,
              estatus_moderacion: "Aprobado",
            };

        setInteracciones((prev) => [
          ...prev.filter(
            (i) =>
              !(
                i.colaborador_id === id_usuario &&
                esTipoReaccion(i.tipo_interaccion)
              )
          ),
          filaInsertada,
        ]);
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : "No fue posible procesar tu reacción.";
      setErrorInteraccion(`Error al procesar reacción: ${msg}`);
      alert(`Error al procesar reacción: ${msg}`);
    } finally {
      isReactingRef.current = false;
      setIsReacting(false);
    }
  };

  /**
   * Enviar Comentario ('Comentario', contenido_comentario, 'Pendiente')
   */
  const handleEnviarComentario = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const limpio = textoComentario.trim();
    if (!limpio || isSubmittingComentario || isSubmittingComentarioRef.current) {
      return;
    }

    isSubmittingComentarioRef.current = true;
    setIsSubmittingComentario(true);
    setComentarioEnviadoRevision(false);
    setErrorInteraccion(null);

    try {
      const resultado = await enviarComentarioMuroAction({
        publicacionId: publicacion.id,
        contenido: limpio,
      });

      if (!resultado.ok) {
        setErrorInteraccion(`Error al enviar comentario: ${resultado.error}`);
        return;
      }

      setInteracciones((prev) => {
        const yaExiste = prev.some((i) => i.id === resultado.interaccion.id);
        if (yaExiste) {
          return prev.map((i) =>
            i.id === resultado.interaccion.id ? resultado.interaccion : i
          );
        }
        return [...prev, resultado.interaccion];
      });

      setTextoComentario("");
      setComentarioEnviadoRevision(true);
    } finally {
      isSubmittingComentarioRef.current = false;
      setIsSubmittingComentario(false);
    }
  };

  const handleImageClick = (indice: number) => {
    const url = imagenes[indice];
    if (!url) return;
    if (onExpandImage) {
      onExpandImage(url, imagenes, indice);
    } else {
      setIndiceExpandidoLocal(indice);
    }
  };

  return (
    <>
      <article
        id={`publicacion-${publicacion.id}`}
        className={`scroll-mt-8 flex flex-col gap-5 rounded-md border bg-brand-surface p-6 shadow-sm transition-all sm:flex-row sm:items-start sm:gap-6 target:border-brand-gold target:ring-2 target:ring-brand-gold/50 ${
          isHighlighted
            ? "border-brand-gold ring-2 ring-brand-gold/60 shadow-md"
            : "border-gray-100"
        }`}
      >
        {/* Fecha destacada */}
        <div className="flex h-20 w-20 flex-shrink-0 flex-col items-center justify-center rounded-md bg-brand-beige">
          <span className="font-serif text-3xl font-black leading-none text-gray-900">
            {dia}
          </span>
          <span className="mt-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-600">
            {mes}
          </span>
        </div>

        {/* Cuerpo del comunicado */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Metadatos superiores */}
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="rounded-sm bg-brand-dark px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-brand-gold">
                COMUNICADO OFICIAL
              </span>
              <span className="inline-flex items-center rounded-sm border border-brand-gold/40 bg-brand-beige/60 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-brand-dark">
                {alcancePublicacion}
              </span>
              {esProgramado && (
                <span className="inline-flex items-center gap-1 rounded-sm border border-brand-gold bg-brand-beige/70 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-brand-dark">
                  ● PROGRAMADO
                </span>
              )}
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                POR: {nombreAutor}
              </span>
              <span className="text-[10px] font-medium text-gray-400">
                • {fechaAmigable}
              </span>
            </div>

            {publicacion.requiere_acuse && (
              <span className="inline-flex items-center gap-1 rounded-sm border border-status-warning/40 bg-status-warning/15 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-status-warning">
                ● LECTURA OBLIGATORIA
              </span>
            )}
          </div>

          {/* Título */}
          <h2 className="mb-3 font-serif text-2xl font-bold leading-snug text-gray-900">
            {publicacion.titulo}
          </h2>

          {/* Contenido respetando saltos de línea y convirtiendo URLs en enlaces clickeables seguros (sin dangerouslySetInnerHTML) */}
          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-800">
            {segmentosContenido.map((seg, idx) =>
              seg.tipo === "enlace" ? (
                <a
                  key={`seg-${idx}`}
                  href={seg.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-brand-gold underline decoration-brand-gold/60 underline-offset-2 transition-colors hover:text-brand-dark"
                >
                  {seg.texto}
                </a>
              ) : (
                <span key={`seg-${idx}`}>{seg.valor}</span>
              )
            )}
          </div>

          {/* Galería de imágenes ordenada y armónica */}
          {imagenes.length === 1 && (
            <div className="mt-4 flex justify-start">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagenes[0]}
                alt={publicacion.titulo}
                onClick={() => handleImageClick(0)}
                {...(isPriorityImage
                  ? { fetchPriority: "high" as const }
                  : { loading: "lazy" as const })}
                className="h-auto max-h-[480px] w-auto max-w-full cursor-pointer rounded-lg border border-gray-200/80 bg-neutral-100/50 object-contain object-left transition-transform hover:scale-[1.01]"
              />
            </div>
          )}

          {imagenes.length > 1 && (
            <div className="mt-4 flex flex-col gap-2">
              <div
                className={`grid gap-3 ${
                  imagenes.length === 2
                    ? "max-w-3xl grid-cols-1 sm:grid-cols-2"
                    : imagenes.length === 3
                    ? "max-w-4xl grid-cols-1 sm:grid-cols-3"
                    : "max-w-4xl grid-cols-2"
                }`}
              >
                {imagenes.slice(0, 4).map((urlImg, idx) => {
                  const restantes = imagenes.length - 4;
                  const mostrarOverlayMas = idx === 3 && restantes > 0;
                  const esPrioritaria = isPriorityImage && idx === 0;

                  return (
                    <button
                      key={`${publicacion.id}-img-${idx}`}
                      type="button"
                      onClick={() => handleImageClick(idx)}
                      aria-label={`Ver imagen ${idx + 1} de ${imagenes.length}: ${publicacion.titulo}`}
                      className={`group relative w-full overflow-hidden rounded-lg border border-gray-200 bg-neutral-100 text-left shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-gold ${
                        imagenes.length === 2
                          ? "aspect-[4/3] max-h-[320px]"
                          : imagenes.length === 3
                          ? "aspect-[4/3] max-h-[260px]"
                          : "aspect-[16/10] max-h-[240px]"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={urlImg}
                        alt={`${publicacion.titulo} - imagen ${idx + 1} de ${imagenes.length}`}
                        {...(esPrioritaria
                          ? { fetchPriority: "high" as const }
                          : { loading: "lazy" as const })}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />

                      {/* Indicador de orden armónico */}
                      <span className="absolute left-2.5 top-2.5 rounded-sm bg-brand-dark/85 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-brand-gold shadow-sm backdrop-blur-sm">
                        {idx + 1} / {imagenes.length}
                      </span>

                      {mostrarOverlayMas && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-brand-dark/75 text-white backdrop-blur-[2px] transition-colors group-hover:bg-brand-dark/85">
                          <span className="font-serif text-2xl font-bold text-brand-gold">
                            +{restantes}
                          </span>
                          <span className="mt-1 text-[10px] font-bold uppercase tracking-widest text-white">
                            VER {imagenes.length} IMÁGENES
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Galería de {imagenes.length} imágenes ordenadas · Haz clic en cualquiera para ampliar
              </span>
            </div>
          )}

          {/* Resumen de Reacciones Agrupadas (ej. "👍 2   👏 1   💡 1") */}
          {reaccionesConConteo.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {reaccionesConConteo.map((reaccion) => (
                <span
                  key={reaccion.tipo}
                  title={`${reaccion.label}: ${conteoPorReaccion[reaccion.tipo]}`}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                    miReaccionActiva === reaccion.tipo
                      ? "border-brand-gold bg-brand-gold/15 text-brand-dark"
                      : "border-gray-200 bg-brand-beige/50 text-gray-700"
                  }`}
                >
                  <span aria-hidden="true">{reaccion.emoji}</span>
                  <span>{conteoPorReaccion[reaccion.tipo]}</span>
                </span>
              ))}
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                • {reaccionesList.length}{" "}
                {reaccionesList.length === 1 ? "reacción" : "reacciones"}
              </span>
            </div>
          )}

          {/* Barra de Interacciones: Selector de Reacciones Flotante, Comentarios y Acuse */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
            <div className="flex items-center gap-4">
              {/* Selector de Reacciones con bloqueo anti-spam isReacting */}
              <div
                className={`relative inline-block transition-opacity ${
                  isReacting ? "pointer-events-none opacity-50" : ""
                }`}
                onMouseEnter={() => {
                  if (!isReacting) setMenuReaccionesAbierto(true);
                }}
                onMouseLeave={() => setMenuReaccionesAbierto(false)}
              >
                {/* Menú flotante superior con puente invisible pb-2 para no perder el hover */}
                {menuReaccionesAbierto && !isReacting && (
                  <div className="absolute bottom-full left-0 z-30 pb-2">
                    <div
                      role="toolbar"
                      aria-label="Seleccionar reacción"
                      className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-brand-surface px-3 py-1.5 shadow-lg"
                    >
                      {CATALOGO_REACCIONES.map((opcion) => {
                        const esActiva = miReaccionActiva === opcion.tipo;
                        return (
                          <button
                            key={opcion.tipo}
                            type="button"
                            disabled={isReacting}
                            onClick={() => handleReaccion(opcion.tipo)}
                            title={opcion.label}
                            className={`group flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold transition-all hover:-translate-y-0.5 hover:bg-brand-beige/70 disabled:pointer-events-none disabled:opacity-50 ${
                              esActiva
                                ? "bg-brand-gold/20 text-brand-dark ring-1 ring-brand-gold"
                                : "text-gray-700"
                            }`}
                          >
                            <span className="text-base leading-none transition-transform group-hover:scale-125">
                              {opcion.emoji}
                            </span>
                            <span className="text-[10px] font-bold uppercase tracking-wider">
                              {opcion.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Botón Principal de Reacción */}
                <button
                  type="button"
                  disabled={isReacting}
                  aria-pressed={Boolean(miReaccionActiva)}
                  aria-expanded={menuReaccionesAbierto}
                  onClick={() => {
                    // En móvil/clic directo: si ya tiene reacción la quita; si no, aplica 'Like'
                    handleReaccion(miReaccionActiva ?? "Like");
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-sm border px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all disabled:pointer-events-none disabled:cursor-wait disabled:opacity-50 ${
                    configMiReaccion
                      ? configMiReaccion.activeButtonClass
                      : "border-gray-200 bg-brand-surface text-gray-600 hover:border-brand-gold/60 hover:text-gray-900"
                  }`}
                >
                  <span className="text-sm leading-none" aria-hidden="true">
                    {configMiReaccion ? configMiReaccion.emoji : "👍"}
                  </span>
                  <span>
                    {isReacting
                      ? "PROCESANDO…"
                      : configMiReaccion
                      ? configMiReaccion.label
                      : "Reaccionar"}
                  </span>
                </button>
              </div>

              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                <MessageSquareIcon className="h-3.5 w-3.5" />
                <span>
                  {comentariosAprobados.length}{" "}
                  {comentariosAprobados.length === 1
                    ? "COMENTARIO"
                    : "COMENTARIOS"}
                </span>
              </span>
            </div>

            {/* Botón de Acuse de Recibo si requiere_acuse === true */}
            {publicacion.requiere_acuse &&
              (acuseConfirmado ? (
                <span className="inline-flex items-center gap-1.5 rounded-sm border border-status-success/40 bg-status-success/10 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-status-success">
                  <CheckCircleIcon className="h-4 w-4 text-status-success" />
                  ENTERADO CONFIRMADO · ACUSE REGISTRADO
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleConfirmarAcuse}
                  disabled={isSubmittingAcuse}
                  className="inline-flex items-center gap-2 rounded-sm bg-brand-dark px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-brand-gold shadow-sm transition-colors hover:bg-brand-dark/90 disabled:opacity-50"
                >
                  <CheckCircleIcon className="h-4 w-4 text-brand-gold" />
                  {isSubmittingAcuse
                    ? "REGISTRANDO ACUSE…"
                    : "CONFIRMAR DE ENTERADO"}
                </button>
              ))}
          </div>

          {errorInteraccion && (
            <p
              role="alert"
              className="mt-2 text-[11px] font-semibold text-status-danger"
            >
              {errorInteraccion}
            </p>
          )}

          {/* Lista de Comentarios Aprobados */}
          {comentariosAprobados.length > 0 && (
            <div className="mt-4 flex flex-col gap-2.5">
              {comentariosAprobados.map((item) => {
                const autorComentario =
                  item.colaboradores?.nombre_completo?.trim() || "Colaborador";
                return (
                  <div
                    key={item.id}
                    className="flex flex-col gap-1 rounded-md border border-gray-100 bg-brand-beige/40 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-700">
                        {autorComentario}
                      </span>
                      {item.created_at && (
                        <span className="text-[9px] font-medium text-gray-400">
                          {formatearFechaPublicacion(item.created_at)}
                        </span>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap text-xs text-gray-800">
                      {item.contenido_comentario}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Formulario para enviar nuevo comentario (sujeto a moderación) */}
          <form
            onSubmit={handleEnviarComentario}
            className="mt-4 flex w-full items-center overflow-hidden rounded-md border border-gray-200 bg-brand-beige/30"
          >
            <input
              type="text"
              value={textoComentario}
              disabled={isSubmittingComentario}
              onChange={(e) => {
                setComentarioEnviadoRevision(false);
                setErrorInteraccion(null);
                setTextoComentario(e.target.value);
              }}
              placeholder="Escribe un comentario..."
              aria-label="Escribir comentario"
              className="flex-1 bg-transparent px-4 py-2.5 text-xs text-gray-800 placeholder:text-gray-400 focus:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={isSubmittingComentario || !textoComentario.trim()}
              className="flex items-center self-stretch bg-brand-dark px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-brand-gold transition-colors hover:bg-brand-dark/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmittingComentario ? "ENVIANDO…" : "COMENTAR"}
            </button>
          </form>

          {comentarioEnviadoRevision && (
            <p
              role="status"
              className="mt-2 text-[11px] font-semibold text-status-success"
            >
              ✓ Comentario enviado para revisión
            </p>
          )}
        </div>
      </article>

      {/* Lightbox de respaldo si PostCard se usa sin MuroPage */}
      {indiceExpandidoLocal !== null && imagenes[indiceExpandidoLocal] && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Visor de imagen expandida"
          onClick={() => setIndiceExpandidoLocal(null)}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden overscroll-contain bg-black/90 p-4"
        >
          <button
            type="button"
            aria-label="Cerrar visor de imagen"
            onClick={() => setIndiceExpandidoLocal(null)}
            className="absolute right-6 top-6 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xl font-bold text-white transition-colors hover:bg-white/25"
          >
            ✕
          </button>

          {imagenes.length > 1 && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="mb-3 rounded-full bg-white/10 px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-brand-gold"
            >
              Imagen {indiceExpandidoLocal + 1} de {imagenes.length}
            </div>
          )}

          <div
            onClick={(e) => e.stopPropagation()}
            className="relative flex max-h-[82vh] max-w-[92vw] items-center justify-center"
          >
            {imagenes.length > 1 && (
              <button
                type="button"
                aria-label="Imagen anterior"
                onClick={() =>
                  setIndiceExpandidoLocal(
                    (indiceExpandidoLocal - 1 + imagenes.length) %
                      imagenes.length
                  )
                }
                className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-lg font-bold text-white transition-colors hover:bg-brand-gold hover:text-brand-dark"
              >
                ‹
              </button>
            )}

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagenes[indiceExpandidoLocal]}
              alt={`${publicacion.titulo} (${indiceExpandidoLocal + 1} de ${imagenes.length})`}
              className="max-h-[80vh] max-w-[82vw] rounded-lg object-contain shadow-2xl"
            />

            {imagenes.length > 1 && (
              <button
                type="button"
                aria-label="Imagen siguiente"
                onClick={() =>
                  setIndiceExpandidoLocal(
                    (indiceExpandidoLocal + 1) % imagenes.length
                  )
                }
                className="ml-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-lg font-bold text-white transition-colors hover:bg-brand-gold hover:text-brand-dark"
              >
                ›
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
