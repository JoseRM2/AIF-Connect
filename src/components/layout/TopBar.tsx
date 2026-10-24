/** Barra superior del área de contenido (indicador de sesión y avatar). */
export default function TopBar() {
  return (
    <div className="flex items-center justify-end gap-4 border-b border-brand-dark/10 px-8 py-3.5">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-600">
        ESPACIO DE TRABAJO SEGURO
      </span>
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-dark text-xs font-semibold text-white">
        JR
      </div>
    </div>
  );
}
