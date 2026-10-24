import React from "react";

/**
 * Boundary nativo de React Suspense en Next.js App Router para las transiciones
 * entre rutas dentro de `/dashboard/*`.
 */
export default function DashboardLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex min-h-[65vh] w-full flex-col items-center justify-center gap-3.5"
    >
      <div
        aria-hidden="true"
        className="h-9 w-9 animate-spin motion-reduce:animate-[spin_6s_linear_infinite] rounded-full border-[3px] border-brand-dark/15 border-t-brand-dark"
      />
      <p className="text-xs font-semibold tracking-wide text-brand-dark/70">
        Cargando módulo...
      </p>
    </div>
  );
}
