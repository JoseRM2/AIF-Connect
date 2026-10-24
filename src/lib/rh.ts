import type { Empleado, RolEmpleado } from "@/types/rh";

export const ROL_LABELS: Record<RolEmpleado, string> = {
  rh: "RH",
  colaborador: "Colaborador",
};

const escaparCsv = (valor: string) => `"${valor.replace(/"/g, '""')}"`;

/** Serializa empleados a CSV (separador coma, valores entrecomillados). */
export function empleadosACsv(empleados: Empleado[]): string {
  const encabezados = [
    "Nombre",
    "Correo",
    "Puesto",
    "Departamento",
    "Empresa",
    "Rol",
    "Estatus",
  ];
  const filas = empleados.map((e) =>
    [
      e.nombre,
      e.correo,
      e.puesto,
      e.departamento,
      e.empresa,
      ROL_LABELS[e.rol],
      e.estatus,
    ]
      .map(escaparCsv)
      .join(","),
  );
  return [encabezados.map(escaparCsv).join(","), ...filas].join("\n");
}

/** Descarga un CSV en el navegador (con BOM para que Excel respete acentos). */
export function descargarCsv(nombreArchivo: string, contenido: string): void {
  const blob = new Blob(["\uFEFF", contenido], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.click();
  URL.revokeObjectURL(url);
}
