"use client";

import { useAuthRole } from "@/components/auth/AuthRoleContext";

/** Barra superior del área de contenido (indicador de sesión y avatar). */
export default function TopBar() {
  const { nombreCompleto } = useAuthRole();

  const iniciales =
    nombreCompleto && nombreCompleto.trim() && nombreCompleto !== "Colaborador"
      ? nombreCompleto
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((palabra) => palabra[0]?.toUpperCase() ?? "")
          .join("") || "JR"
      : "JR";

  return (
    <div className="flex items-center justify-end gap-4 border-b border-brand-dark/10 px-8 py-3.5">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-600">
        ESPACIO DE TRABAJO SEGURO
      </span>
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-dark text-xs font-semibold text-white">
        {iniciales}
      </div>
    </div>
  );
}
