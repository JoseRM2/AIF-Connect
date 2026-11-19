"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { obtenerDatosMuroAction } from "@/app/actions/muro";
import { useAuthRole } from "@/components/auth/AuthRoleContext";
import PostCard from "@/components/muro/PostCard";
import { cumpleFiltroAudiencia } from "@/lib/muro";
import { createClient } from "@/lib/supabase/client";
import type { InteraccionMuroRow, PublicacionMuro } from "@/types/muro";

const INTERACCIONES_VACIAS: InteraccionMuroRow[] = [];

function ordenarPublicacionesPorFecha(
  lista: PublicacionMuro[]
): PublicacionMuro[] {
  return [...lista].sort((a, b) => {
    const fechaA = a.fecha_publicacion ?? a.created_at ?? "";
    const fechaB = b.fecha_publicacion ?? b.created_at ?? "";
    return fechaB.localeCompare(fechaA);
  });
}

export default function MuroPage() {
  const {
    rolSistema: rolContexto,
    empresa: empresaContexto,
    departamento: departamentoContexto,
  } = useAuthRole();
  const [publicaciones, setPublicaciones] = useState<PublicacionMuro[]>([]);
  const [interacciones, setInteracciones] = useState<InteraccionMuroRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [galeriaExpandida, setGaleriaExpandida] = useState<{
    urls: string[];
    indice: number;
  } | null>(null);
  const [publicacionDestacadaId, setPublicacionDestacadaId] = useState<
    string | null
  >(null);

  const fetchMuroData = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);

    try {
      // 0. Consultar vía Server Action con aislamiento de datos por rol/audiencia
      const serverData = await obtenerDatosMuroAction();
      if (serverData.ok) {
        setCurrentUserId(serverData.currentUserId);
        setPublicaciones(ordenarPublicacionesPorFecha(serverData.publicaciones));
        setInteracciones(serverData.interacciones);
        return;
      }

      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUserId(user?.id ?? null);

      // 1. Validación de Usuario: obtener rol, empresa y departamento del empleado logueado
      let esRH = rolContexto === "Recursos Humanos";
      let userEmpresa = (empresaContexto || "AIF").trim();
      let userDepartamento = (departamentoContexto || "Todos").trim();

      if (user?.id) {
        const { data: colab } = await supabase
          .from("colaboradores")
          .select("rol_sistema, empresa, departamento")
          .eq("id", user.id)
          .maybeSingle();

        if (colab) {
          const rolLimpio = (colab.rol_sistema ?? "").trim();
          esRH =
            esRH || rolLimpio === "Recursos Humanos" || rolLimpio === "RH";
          if (colab.empresa?.trim()) {
            userEmpresa = colab.empresa.trim();
          }
          const depColab = (colab.departamento ?? "").trim();
          if (depColab) {
            userDepartamento = depColab;
          }
        }
      }

      const ahoraIso = new Date().toISOString();

      // 2. Consultar en paralelo muro_publicaciones y muro_interacciones:
      // - Si NO es Recursos Humanos:
      //   * Ocultar comunicados programados a futuro con .lte('fecha_publicacion', ahoraIso)
      //   * Filtrar audiencia por empresa_destino ('Ambas' o userEmpresa) y departamento_destino ('Todos' o userDepartamento)
      // - Si ES Recursos Humanos: cargar todos sin restricciones de audiencia ni fecha
      let queryPublicaciones = supabase
        .from("muro_publicaciones")
        .select("*, colaboradores!autor_id(nombre_completo)");

      if (!esRH) {
        queryPublicaciones = queryPublicaciones
          .lte("fecha_publicacion", ahoraIso)
          .or(
            `empresa_destino.eq.Ambas,empresa_destino.eq."${userEmpresa}",empresa_destino.is.null`
          )
          .or(
            `departamento_destino.eq.Todos,departamento_destino.eq."${userDepartamento}",departamento_destino.is.null`
          );
      }

      const [pubRes, intRes] = await Promise.all([
        queryPublicaciones.order("fecha_publicacion", {
          ascending: false,
        }),
        supabase
          .from("muro_interacciones")
          .select("*, colaboradores!colaborador_id(nombre_completo)")
          .order("created_at", { ascending: true }),
      ]);

      if (!pubRes.error && pubRes.data) {
        const filtradas = esRH
          ? (pubRes.data as unknown as PublicacionMuro[])
          : (pubRes.data as unknown as PublicacionMuro[]).filter(
              (p) =>
                (!p.fecha_publicacion ||
                  new Date(p.fecha_publicacion).getTime() <= Date.now()) &&
                cumpleFiltroAudiencia(p, userEmpresa, userDepartamento)
            );
        setPublicaciones(ordenarPublicacionesPorFecha(filtradas));
      } else {
        let fallbackQuery = supabase
          .from("muro_publicaciones")
          .select("*, colaboradores!autor_id(nombre_completo)");

        if (!esRH) {
          fallbackQuery = fallbackQuery.lte("fecha_publicacion", ahoraIso);
        }

        const fallback = await fallbackQuery.order("created_at", {
          ascending: false,
        });

        if (fallback.error) {
          setErrorMsg(pubRes.error?.message ?? fallback.error.message);
          setPublicaciones([]);
          return;
        }

        const filtradasFallback = esRH
          ? ((fallback.data ?? []) as unknown as PublicacionMuro[])
          : ((fallback.data ?? []) as unknown as PublicacionMuro[]).filter(
              (p) =>
                (!p.fecha_publicacion ||
                  new Date(p.fecha_publicacion).getTime() <= Date.now()) &&
                cumpleFiltroAudiencia(p, userEmpresa, userDepartamento)
            );
        setPublicaciones(ordenarPublicacionesPorFecha(filtradasFallback));
      }

      if (!intRes.error && intRes.data) {
        setInteracciones(intRes.data as unknown as InteraccionMuroRow[]);
      } else {
        const intFallback = await supabase
          .from("muro_interacciones")
          .select("*")
          .order("created_at", { ascending: true });

        setInteracciones(
          (intFallback.data ?? []) as unknown as InteraccionMuroRow[]
        );
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Ocurrió un error al cargar el Muro Corporativo."
      );
    } finally {
      setIsLoading(false);
    }
  }, [rolContexto, empresaContexto, departamentoContexto]);

  useEffect(() => {
    fetchMuroData();
  }, [fetchMuroData]);

  // Agrupar interacciones por publicacion_id para acceso O(1) en cada PostCard
  const interaccionesPorPublicacion = useMemo(() => {
    const mapa: Record<string, InteraccionMuroRow[]> = {};
    for (const item of interacciones) {
      if (!mapa[item.publicacion_id]) {
        mapa[item.publicacion_id] = [];
      }
      mapa[item.publicacion_id].push(item);
    }
    return mapa;
  }, [interacciones]);

  // Desplazar y resaltar la publicación específica cuando se navega desde Inicio (#publicacion-<id>)
  useEffect(() => {
    if (isLoading || publicaciones.length === 0 || typeof window === "undefined") {
      return;
    }

    const hash = window.location.hash.replace(/^#/, "");
    const searchParams = new URLSearchParams(window.location.search);
    const paramPubId = searchParams.get("publicacion");
    const targetDomId = hash.startsWith("publicacion-")
      ? hash
      : paramPubId
      ? `publicacion-${paramPubId}`
      : "";

    if (!targetDomId) return;

    const pubId = targetDomId.replace(/^publicacion-/, "");
    setPublicacionDestacadaId(pubId);

    const timerScroll = window.setTimeout(() => {
      const elemento = document.getElementById(targetDomId);
      if (elemento) {
        elemento.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 80);

    const timerClear = window.setTimeout(() => {
      setPublicacionDestacadaId(null);
    }, 4500);

    return () => {
      window.clearTimeout(timerScroll);
      window.clearTimeout(timerClear);
    };
  }, [isLoading, publicaciones]);

  // Cerrar el visor de pantalla completa con Escape y navegar entre imágenes con flechas
  useEffect(() => {
    if (!galeriaExpandida) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setGaleriaExpandida(null);
      } else if (e.key === "ArrowRight" && galeriaExpandida.urls.length > 1) {
        setGaleriaExpandida((prev) =>
          prev
            ? { ...prev, indice: (prev.indice + 1) % prev.urls.length }
            : null
        );
      } else if (e.key === "ArrowLeft" && galeriaExpandida.urls.length > 1) {
        setGaleriaExpandida((prev) =>
          prev
            ? {
                ...prev,
                indice:
                  (prev.indice - 1 + prev.urls.length) % prev.urls.length,
              }
            : null
        );
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [galeriaExpandida]);

  const handleExpandImage = useCallback(
    (url: string, todasLasUrls?: string[], indiceActual?: number) => {
      setGaleriaExpandida({
        urls: todasLasUrls && todasLasUrls.length > 0 ? todasLasUrls : [url],
        indice: indiceActual ?? 0,
      });
    },
    []
  );

  return (
    <div className="flex flex-col px-10 py-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-serif text-3xl font-black text-gray-900">
            Comunicación Interna
          </h1>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
            AVISOS Y BOLETINES OFICIALES.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchMuroData}
          disabled={isLoading}
          className="rounded-sm border border-gray-200 bg-brand-surface px-3.5 py-2 text-[9px] font-bold uppercase tracking-widest text-gray-600 transition-colors hover:bg-brand-beige/50 disabled:opacity-50"
        >
          {isLoading ? "ACTUALIZANDO…" : "ACTUALIZAR MURO"}
        </button>
      </header>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center rounded-md border border-gray-100 bg-brand-surface p-8 text-xs font-bold uppercase tracking-widest text-gray-400 shadow-sm">
          Cargando comunicados oficiales…
        </div>
      ) : errorMsg ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-status-danger/30 bg-brand-surface p-8 text-center shadow-sm">
          <p className="text-xs font-bold text-status-danger">
            Error al cargar las publicaciones: {errorMsg}
          </p>
          <button
            type="button"
            onClick={fetchMuroData}
            className="rounded-sm bg-brand-dark px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-brand-gold"
          >
            REINTENTAR
          </button>
        </div>
      ) : publicaciones.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-md border border-gray-100 bg-brand-surface p-8 text-center text-xs font-medium text-gray-400 shadow-sm">
          No hay comunicados oficiales publicados por el momento.
        </div>
      ) : (
        <section
          aria-label="Publicaciones"
          className="flex w-full flex-col gap-6"
        >
          {publicaciones.map((publicacion, index) => (
            <PostCard
              key={publicacion.id}
              publicacion={publicacion}
              currentUserId={currentUserId}
              interaccionesIniciales={
                interaccionesPorPublicacion[publicacion.id] ??
                INTERACCIONES_VACIAS
              }
              isPriorityImage={index === 0}
              isHighlighted={publicacionDestacadaId === publicacion.id}
              onExpandImage={handleExpandImage}
            />
          ))}
        </section>
      )}

      {/* Visor de Pantalla Completa (Lightbox con soporte para múltiples imágenes ordenadas) */}
      {galeriaExpandida && galeriaExpandida.urls[galeriaExpandida.indice] && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Visor de imagen expandida"
          onClick={() => setGaleriaExpandida(null)}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden overscroll-contain bg-black/90 p-4"
        >
          <button
            type="button"
            aria-label="Cerrar visor de imagen"
            onClick={() => setGaleriaExpandida(null)}
            className="absolute right-6 top-6 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xl font-bold text-white transition-colors hover:bg-white/25"
          >
            ✕
          </button>

          {galeriaExpandida.urls.length > 1 && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="mb-3 rounded-full bg-white/10 px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-brand-gold"
            >
              Imagen {galeriaExpandida.indice + 1} de{" "}
              {galeriaExpandida.urls.length}
            </div>
          )}

          <div
            onClick={(e) => e.stopPropagation()}
            className="relative flex max-h-[80vh] max-w-[92vw] items-center justify-center"
          >
            {galeriaExpandida.urls.length > 1 && (
              <button
                type="button"
                aria-label="Imagen anterior"
                onClick={() =>
                  setGaleriaExpandida((prev) =>
                    prev
                      ? {
                          ...prev,
                          indice:
                            (prev.indice - 1 + prev.urls.length) %
                            prev.urls.length,
                        }
                      : null
                  )
                }
                className="mr-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-xl font-bold text-white transition-colors hover:bg-brand-gold hover:text-brand-dark"
              >
                ‹
              </button>
            )}

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={galeriaExpandida.urls[galeriaExpandida.indice]}
              alt={`Comunicado expandido (${galeriaExpandida.indice + 1} de ${galeriaExpandida.urls.length})`}
              className="max-h-[78vh] max-w-[82vw] rounded-lg object-contain shadow-2xl"
            />

            {galeriaExpandida.urls.length > 1 && (
              <button
                type="button"
                aria-label="Imagen siguiente"
                onClick={() =>
                  setGaleriaExpandida((prev) =>
                    prev
                      ? {
                          ...prev,
                          indice: (prev.indice + 1) % prev.urls.length,
                        }
                      : null
                  )
                }
                className="ml-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-xl font-bold text-white transition-colors hover:bg-brand-gold hover:text-brand-dark"
              >
                ›
              </button>
            )}
          </div>

          {galeriaExpandida.urls.length > 1 && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="mt-4 flex max-w-[90vw] items-center gap-2 overflow-x-auto px-2 py-1"
            >
              {galeriaExpandida.urls.map((thumbUrl, thumbIdx) => {
                const activa = thumbIdx === galeriaExpandida.indice;
                return (
                  <button
                    key={`thumb-${thumbIdx}`}
                    type="button"
                    onClick={() =>
                      setGaleriaExpandida((prev) =>
                        prev ? { ...prev, indice: thumbIdx } : null
                      )
                    }
                    className={`relative h-14 w-20 shrink-0 overflow-hidden rounded border-2 transition-all ${
                      activa
                        ? "border-brand-gold opacity-100 scale-105"
                        : "border-transparent opacity-55 hover:opacity-90"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumbUrl}
                      alt={`Miniatura ${thumbIdx + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
