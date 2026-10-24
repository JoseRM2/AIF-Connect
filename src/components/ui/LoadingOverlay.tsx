"use client";

import React from "react";

interface LoadingOverlayProps {
  /** Controla si el overlay es visible */
  isLoading: boolean;
  /** Texto opcional descriptivo debajo del spinner */
  message?: string;
}

/**
 * Capa superpuesta reutilizable (`fixed inset-0 z-50`) con efecto blur (`backdrop-blur-sm`)
 * y spinner corporativo minimalista para enmascarar tiempos de espera en formularios o Login.
 */
export function LoadingOverlay({
  isLoading,
  message = "Procesando...",
}: LoadingOverlayProps) {
  if (!isLoading) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/60 backdrop-blur-sm transition-opacity duration-200"
    >
      <div className="flex flex-col items-center gap-3.5 rounded-2xl border border-brand-secondary/30 bg-white/90 px-7 py-5 shadow-lg">
        {/* Spinner corporativo minimalista */}
        <div
          aria-hidden="true"
          className="h-9 w-9 animate-spin motion-reduce:animate-[spin_6s_linear_infinite] rounded-full border-[3px] border-brand-dark/15 border-t-brand-dark"
        />
        {message && (
          <span className="text-xs font-semibold tracking-wide text-brand-dark">
            {message}
          </span>
        )}
      </div>
    </div>
  );
}

export default LoadingOverlay;
