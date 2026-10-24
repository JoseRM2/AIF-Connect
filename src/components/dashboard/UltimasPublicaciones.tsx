"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PostCard from "@/components/dashboard/PostCard";
import { formatearFechaPublicacion } from "@/lib/muro";
import { createClient } from "@/lib/supabase/client";
import type { PublicacionMuro } from "@/types/muro";

function generarExtracto(contenido: string): string {
  const limpio = (contenido ?? "").replace(/\s+/g, " ").trim();
  if (limpio.length <= 100) return limpio;
  return `${limpio.substring(0, 100).trimEnd()}...`;
}

export default function UltimasPublicaciones() {
  const [publicaciones, setPublicaciones] = useState<PublicacionMuro[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let activo = true;

    async function cargarUltimasPublicaciones() {
      setIsLoading(true);
      try {
        const supabase = createClient();

        const { data, error } = await supabase
          .from("muro_publicaciones")
          .select("*, colaboradores!autor_id(nombre_completo)")
          .order("created_at", { ascending: false })
          .limit(3);

        if (!activo) return;

        if (!error && data) {
          setPublicaciones(data as unknown as PublicacionMuro[]);
          return;
        }

        // Fallback en caso de que la tabla use fecha_publicacion
        const fallback = await supabase
          .from("muro_publicaciones")
          .select("*, colaboradores!autor_id(nombre_completo)")
          .order("fecha_publicacion", { ascending: false })
          .limit(3);

        if (!activo) return;
        setPublicaciones((fallback.data ?? []) as unknown as PublicacionMuro[]);
      } finally {
        if (activo) {
          setIsLoading(false);
        }
      }
    }

    cargarUltimasPublicaciones();

    return () => {
      activo = false;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="grid h-full flex-1 grid-cols-1 gap-6 md:grid-cols-3">
        {[0, 1, 2].map((idx) => (
          <div
            key={idx}
            className="flex h-full animate-pulse flex-col rounded-md border border-gray-100 bg-brand-surface p-6 shadow-sm"
          >
            <div className="flex-1 space-y-3">
              <div className="h-3 w-24 rounded bg-gray-200" />
              <div className="h-5 w-3/4 rounded bg-gray-200" />
              <div className="h-3 w-1/3 rounded bg-gray-200" />
              <div className="h-10 w-full rounded bg-gray-100" />
            </div>
            <div className="mt-auto border-t border-gray-100 pt-4">
              <div className="h-3 w-28 rounded bg-gray-200" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (publicaciones.length === 0) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 rounded-md border border-gray-100 bg-brand-surface p-8 text-center shadow-sm">
        <p className="text-xs font-medium text-gray-500">
          Aún no hay comunicados publicados recientemente.
        </p>
        <Link
          href="/dashboard/muro"
          className="rounded-sm bg-brand-dark px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-brand-gold transition-colors hover:bg-brand-dark/90"
        >
          IR AL MURO CORPORATIVO
        </Link>
      </div>
    );
  }

  return (
    <div className="grid h-full flex-1 grid-cols-1 gap-6 md:grid-cols-3">
      {publicaciones.map((pub) => {
        const fechaRaw = pub.created_at ?? pub.fecha_publicacion ?? null;
        const fechaFormateada = formatearFechaPublicacion(fechaRaw);
        const nombreAutor =
          pub.colaboradores?.nombre_completo?.trim() || "Recursos Humanos";

        return (
          <PostCard
            key={pub.id}
            id={pub.id}
            date={fechaFormateada}
            title={pub.titulo}
            author={nombreAutor}
            excerpt={generarExtracto(pub.contenido)}
            requiereAcuse={Boolean(pub.requiere_acuse)}
          />
        );
      })}
    </div>
  );
}
