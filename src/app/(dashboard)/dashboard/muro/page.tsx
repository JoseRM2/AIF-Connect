"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PostCard from "@/components/muro/PostCard";
import { createClient } from "@/lib/supabase/client";
import type { InteraccionMuroRow, PublicacionMuro } from "@/types/muro";

export default function MuroPage() {
  const [publicaciones, setPublicaciones] = useState<PublicacionMuro[]>([]);
  const [interacciones, setInteracciones] = useState<InteraccionMuroRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [imagenExpandida, setImagenExpandida] = useState<string | null>(null);

  const fetchMuroData = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUserId(user?.id ?? null);

      // 1. Consultar muro_publicaciones incluyendo el nombre del autor
      const pubRes = await supabase
        .from("muro_publicaciones")
        .select("*, colaboradores!autor_id(nombre_completo)")
        .order("created_at", { ascending: false });

      if (!pubRes.error && pubRes.data) {
        setPublicaciones(pubRes.data as unknown as PublicacionMuro[]);
      } else {
        const fallback = await supabase
          .from("muro_publicaciones")
          .select("*, colaboradores!autor_id(nombre_completo)")
          .order("fecha_publicacion", { ascending: false });

        if (fallback.error) {
          setErrorMsg(pubRes.error?.message ?? fallback.error.message);
          setPublicaciones([]);
          return;
        }

        setPublicaciones((fallback.data ?? []) as unknown as PublicacionMuro[]);
      }

      // 2. Consultar muro_interacciones incluyendo el nombre del colaborador
      const intRes = await supabase
        .from("muro_interacciones")
        .select("*, colaboradores!colaborador_id(nombre_completo)")
        .order("created_at", { ascending: true });

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
  }, []);

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

  // Cerrar el visor de pantalla completa con la tecla Escape
  useEffect(() => {
    if (!imagenExpandida) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setImagenExpandida(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [imagenExpandida]);

  return (
    <div className="flex flex-col px-10 py-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-serif text-3xl font-black text-gray-900">
            Comunicación Interna
          </h1>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
            AVISOS Y BOLETINES OFICIALES EN TIEMPO REAL.
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
                interaccionesPorPublicacion[publicacion.id] ?? []
              }
              isPriorityImage={index === 0}
              onExpandImage={(url) => setImagenExpandida(url)}
            />
          ))}
        </section>
      )}

      {/* Visor de Pantalla Completa (Lightbox) */}
      {imagenExpandida && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Visor de imagen expandida"
          onClick={() => setImagenExpandida(null)}
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 overflow-hidden overscroll-contain"
        >
          <button
            type="button"
            aria-label="Cerrar visor de imagen"
            onClick={() => setImagenExpandida(null)}
            className="absolute right-6 top-6 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xl font-bold text-white transition-colors hover:bg-white/25"
          >
            ✕
          </button>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imagenExpandida}
            alt="Comunicado expandido"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
