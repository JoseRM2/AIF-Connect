"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CelebracionPrivadaOverlay } from "@/lib/calendario";

interface GreetingOverlayModalProps {
  userId: string;
  celebracionesIniciales?: CelebracionPrivadaOverlay[];
  modoVistaPrevia?: boolean;
  onCerrarVistaPrevia?: () => void;
}

const PREFIJO_STORAGE_GREETING = "aif_greeting_visto_";

interface ParticulaConfeti {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  color: string;
  rotacion: number;
  velRotacion: number;
}

const COLORES_CONFETI = [
  "#C5A059", // Brand Gold
  "#E5C158", // Bright Gold
  "#1D6F42", // Emerald
  "#2563EB", // Royal Blue
  "#D97706", // Amber
  "#E11D48", // Rose
  "#F4F1EA", // Brand Beige
];

export default function GreetingOverlayModal({
  userId,
  celebracionesIniciales = [],
  modoVistaPrevia = false,
  onCerrarVistaPrevia,
}: GreetingOverlayModalProps) {
  const [colaPendiente, setColaPendiente] = useState<
    CelebracionPrivadaOverlay[]
  >([]);
  const [indiceImagenActual, setIndiceImagenActual] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (modoVistaPrevia) {
      setColaPendiente(celebracionesIniciales);
      setIndiceImagenActual(0);
      return;
    }

    if (typeof window === "undefined" || celebracionesIniciales.length === 0) {
      setColaPendiente([]);
      return;
    }

    const noVistas = celebracionesIniciales.filter((item) => {
      try {
        const clave = `${PREFIJO_STORAGE_GREETING}${userId}_${item.idCelebracionAnual}`;
        return window.localStorage.getItem(clave) !== "1";
      } catch {
        return true;
      }
    });

    setColaPendiente(noVistas);
    setIndiceImagenActual(0);
  }, [userId, celebracionesIniciales, modoVistaPrevia]);

  const celebracionActiva = useMemo(
    () => colaPendiente[0] ?? null,
    [colaPendiente]
  );

  // Efecto de confeti virtual en Canvas
  useEffect(() => {
    if (!celebracionActiva) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animFrameId = 0;
    const ajustarDimensiones = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    ajustarDimensiones();
    window.addEventListener("resize", ajustarDimensiones);

    const totalParticulas = 130;
    const particulas: ParticulaConfeti[] = Array.from(
      { length: totalParticulas },
      () => ({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * canvas.height * 0.7,
        vx: (Math.random() - 0.5) * 3.2,
        vy: 2.2 + Math.random() * 3.8,
        w: 7 + Math.random() * 7,
        h: 4 + Math.random() * 6,
        color:
          COLORES_CONFETI[Math.floor(Math.random() * COLORES_CONFETI.length)] ??
          "#C5A059",
        rotacion: Math.random() * Math.PI * 2,
        velRotacion: (Math.random() - 0.5) * 0.14,
      })
    );

    const renderizar = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particulas) {
        p.x += p.vx;
        p.y += p.vy;
        p.rotacion += p.velRotacion;

        if (p.y > canvas.height + 24) {
          p.y = -20;
          p.x = Math.random() * canvas.width;
        }
        if (p.x < -20) p.x = canvas.width + 20;
        if (p.x > canvas.width + 20) p.x = -20;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotacion);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      animFrameId = window.requestAnimationFrame(renderizar);
    };

    animFrameId = window.requestAnimationFrame(renderizar);

    return () => {
      window.cancelAnimationFrame(animFrameId);
      window.removeEventListener("resize", ajustarDimensiones);
    };
  }, [celebracionActiva]);

  const handleCerrarActual = () => {
    if (!celebracionActiva) return;

    if (modoVistaPrevia) {
      setColaPendiente([]);
      onCerrarVistaPrevia?.();
      return;
    }

    try {
      const clave = `${PREFIJO_STORAGE_GREETING}${userId}_${celebracionActiva.idCelebracionAnual}`;
      window.localStorage.setItem(clave, "1");
    } catch {
      // Ignorar si el navegador restringe localStorage
    }

    setIndiceImagenActual(0);
    setColaPendiente((prev) => prev.slice(1));
  };

  if (!celebracionActiva) return null;

  const imagenes = celebracionActiva.imagenesUrls ?? [];
  const imagenActual = imagenes[indiceImagenActual] ?? null;
  const esCumple = celebracionActiva.tipo === "cumpleanos";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={celebracionActiva.titulo}
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-brand-dark/75 p-4 backdrop-blur-md"
    >
      {/* Lienzo de confeti virtual */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 h-full w-full"
      />

      <div className="relative z-10 my-auto flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border-2 border-brand-gold bg-brand-surface shadow-2xl">
        {/* Cabecera conmemorativa */}
        <div className="relative flex flex-col items-center bg-brand-dark px-8 pb-6 pt-7 text-center text-white">
          <button
            type="button"
            onClick={handleCerrarActual}
            aria-label="Cerrar tarjeta de felicitación"
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-gray-300 transition-colors hover:bg-white/20 hover:text-white"
          >
            ✕
          </button>

          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full border-2 border-brand-gold bg-brand-gold/15 text-3xl shadow-inner">
            {esCumple ? "🎂" : "🏆"}
          </div>

          <span className="rounded-full border border-brand-gold/50 bg-brand-gold/15 px-3.5 py-1 text-[9px] font-bold uppercase tracking-widest text-brand-gold">
            {esCumple
              ? `FELICITACIÓN ESPECIAL · ${celebracionActiva.empresa}`
              : `RECONOCIMIENTO DE TRAYECTORIA · ${celebracionActiva.empresa}`}
          </span>

          <h2 className="mt-3 font-serif text-2xl font-bold leading-snug text-white">
            {celebracionActiva.titulo}
          </h2>
        </div>

        {/* Imagen(es) de plantilla subida por RH */}
        {imagenActual && (
          <div className="relative flex flex-col items-center justify-center border-b border-gray-100 bg-neutral-900/95 p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagenActual}
              alt={celebracionActiva.titulo}
              className="max-h-72 w-auto max-w-full rounded-lg object-contain shadow-md"
            />

            {imagenes.length > 1 && (
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setIndiceImagenActual(
                      (indiceImagenActual - 1 + imagenes.length) %
                        imagenes.length
                    )
                  }
                  className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-bold text-white hover:bg-brand-gold hover:text-brand-dark"
                >
                  ‹
                </button>
                <span className="text-[10px] font-bold uppercase tracking-widest text-brand-gold">
                  {indiceImagenActual + 1} / {imagenes.length}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setIndiceImagenActual(
                      (indiceImagenActual + 1) % imagenes.length
                    )
                  }
                  className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-bold text-white hover:bg-brand-gold hover:text-brand-dark"
                >
                  ›
                </button>
              </div>
            )}
          </div>
        )}

        {/* Mensaje personalizado */}
        <div className="flex flex-col items-center px-8 py-6 text-center">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
            {celebracionActiva.mensaje}
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <span className="rounded-sm bg-brand-beige px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-brand-dark">
              {celebracionActiva.nombreColaborador}
            </span>
            <span className="rounded-sm border border-brand-gold/40 bg-brand-beige/50 px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-gray-700">
              {celebracionActiva.departamento}
            </span>
          </div>

          <button
            type="button"
            onClick={handleCerrarActual}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand-dark px-6 py-3 text-xs font-bold uppercase tracking-widest text-brand-gold shadow-md transition-colors hover:bg-brand-dark/90"
          >
            {modoVistaPrevia
              ? "CERRAR VISTA PREVIA"
              : "¡MUCHAS GRACIAS! · CONTINUAR A MI INICIO"}
          </button>
        </div>
      </div>
    </div>
  );
}
