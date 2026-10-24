"use client";

import { useEffect, useMemo, useState } from "react";
import ExpedienteColaboradorModal from "@/components/rh/ExpedienteColaboradorModal";
import ReporteEmpleados from "@/components/rh/ReporteEmpleados";
import { createClient } from "@/lib/supabase/client";
import { normalizar } from "@/lib/texto";
import type { Database } from "@/types/supabase";
import type { Empleado, Empresa, RolEmpleado } from "@/types/rh";

type ColaboradorRow = Database["public"]["Tables"]["colaboradores"]["Row"];

const TODAS = "todas";

const COLUMNAS = [
  { label: "COLABORADOR", className: "" },
  { label: "PUESTO / ÁREA", className: "" },
  { label: "EMPRESA", className: "" },
  { label: "ROL", className: "" },
  { label: "ESTATUS", className: "" },
  { label: "ACCIONES", className: "text-right" },
];

const MICRO = "text-[9px] uppercase tracking-widest text-gray-400";

function esColaboradorActivo(estatus: string | null | undefined): boolean {
  return (estatus ?? "Activo").trim().toLowerCase() !== "inactivo";
}

function normalizarEmpresa(raw: string | null | undefined): Empresa {
  const limpio = (raw ?? "AIF").trim().toUpperCase();
  if (limpio === "ROYAL") return "ROYAL";
  return "AIF";
}

function normalizarRol(raw: string | null | undefined): RolEmpleado {
  const limpio = (raw ?? "").trim().toLowerCase();
  if (
    limpio.includes("rh") ||
    limpio.includes("recursos humanos") ||
    limpio.includes("admin")
  )
    return "rh";
  return "colaborador";
}

export default function DirectorioTab() {
  const [colaboradores, setColaboradores] = useState<ColaboradorRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedbackExito, setFeedbackExito] = useState<string | null>(null);
  const [empresa, setEmpresa] = useState(TODAS);
  const [busqueda, setBusqueda] = useState("");
  const [modalAbierto, setModalAbierto] = useState<boolean>(false);
  const [colaboradorEditar, setColaboradorEditar] =
    useState<ColaboradorRow | null>(null);

  useEffect(() => {
    let cancelado = false;

    async function cargarDirectorio() {
      setIsLoading(true);
      setErrorMsg(null);

      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("colaboradores")
          .select("*")
          .order("nombre_completo", { ascending: true });

        if (cancelado) return;

        if (error) {
          const msgLower = error.message.toLowerCase();
          const esPermiso =
            error.code === "42501" ||
            msgLower.includes("permission") ||
            msgLower.includes("denied") ||
            msgLower.includes("policy");

          setErrorMsg(
            esPermiso
              ? "Acceso Denegado: No cuentas con permisos de Recursos Humanos para visualizar el directorio."
              : `Acceso Denegado / Error al consultar el directorio: ${error.message}`
          );
          setColaboradores([]);
          return;
        }

        setColaboradores(data ?? []);
      } catch (err) {
        if (cancelado) return;
        setErrorMsg(
          err instanceof Error
            ? `Error al cargar el directorio: ${err.message}`
            : "Acceso Denegado: No fue posible cargar el directorio de colaboradores."
        );
      } finally {
        if (!cancelado) {
          setIsLoading(false);
        }
      }
    }

    cargarDirectorio();

    return () => {
      cancelado = true;
    };
  }, []);

  const empleadosReporte = useMemo<Empleado[]>(
    () =>
      colaboradores.map((c) => ({
        id: c.id,
        nombre: c.nombre_completo || c.nombre || "Sin nombre",
        correo: c.correo_corporativo || c.correo || "",
        puesto: c.puesto || "Sin puesto",
        departamento: c.area || c.departamento || "General",
        empresa: normalizarEmpresa(c.empresa),
        rol: normalizarRol(c.rol_sistema),
        estatus: esColaboradorActivo(c.estatus) ? "activo" : "inactivo",
      })),
    [colaboradores]
  );

  const empresas = useMemo(
    () =>
      Array.from(
        new Set([
          "AIF",
          "ROYAL",
          ...colaboradores
            .map((c) => (c.empresa || "AIF").trim().toUpperCase())
            .filter(Boolean),
        ])
      ),
    [colaboradores]
  );

  const filtrados = useMemo(() => {
    const termino = normalizar(busqueda.trim());
    return colaboradores.filter((c) => {
      const emp = (c.empresa || "AIF").trim().toUpperCase();
      if (empresa !== TODAS && emp !== empresa) return false;
      if (!termino) return true;

      const nombre = c.nombre_completo || c.nombre || "";
      const correo = c.correo_corporativo || c.correo || "";
      const puesto = c.puesto || "";
      const area = c.area || c.departamento || "";
      const rol = c.rol_sistema || "";

      return normalizar(
        `${nombre} ${correo} ${puesto} ${area} ${rol}`
      ).includes(termino);
    });
  }, [colaboradores, empresa, busqueda]);

  const handleAlternarEstatus = async (colaborador: ColaboradorRow) => {
    const activoActual = esColaboradorActivo(colaborador.estatus);
    const nuevoEstatus = activoActual ? "Inactivo" : "Activo";

    // Actualización optimista en estado local
    setColaboradores((prev) =>
      prev.map((c) =>
        c.id === colaborador.id ? { ...c, estatus: nuevoEstatus } : c
      )
    );

    const supabase = createClient();
    const { error } = await supabase
      .from("colaboradores")
      .update({ estatus: nuevoEstatus })
      .eq("id", colaborador.id);

    if (error) {
      // Revertir en caso de fallo de permisos o red
      setColaboradores((prev) =>
        prev.map((c) =>
          c.id === colaborador.id
            ? { ...c, estatus: colaborador.estatus }
            : c
        )
      );
    }
  };

  const handleEditar = (id: string) => {
    const encontrado = colaboradores.find((c) => c.id === id) ?? null;
    setColaboradorEditar(encontrado);
    setModalAbierto(true);
  };

  const handleNuevoIngreso = () => {
    setColaboradorEditar(null);
    setModalAbierto(true);
  };

  const handleGuardadoExitoso = (
    colaboradorGuardado: ColaboradorRow,
    esEdicion: boolean,
    mensajeExtra?: string
  ) => {
    setColaboradores((prev) => {
      const listaActualizada = esEdicion
        ? prev.map((c) =>
            c.id === colaboradorGuardado.id ? colaboradorGuardado : c
          )
        : [colaboradorGuardado, ...prev];

      return [...listaActualizada].sort((a, b) =>
        (a.nombre_completo || a.nombre || "").localeCompare(
          b.nombre_completo || b.nombre || "",
          "es"
        )
      );
    });

    setModalAbierto(false);
    setColaboradorEditar(null);

    const nombre =
      colaboradorGuardado.nombre_completo ||
      colaboradorGuardado.nombre ||
      "Colaborador";
    setFeedbackExito(
      esEdicion
        ? `Expediente de "${nombre}" actualizado correctamente en Supabase.`
        : `Nuevo ingreso "${nombre}" (${
            colaboradorGuardado.empresa || "AIF"
          }) registrado exitosamente en el directorio.${
            mensajeExtra ? ` ${mensajeExtra}` : ""
          }`
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <ReporteEmpleados empleados={empleadosReporte} />

      <section className="overflow-hidden rounded-sm bg-brand-surface shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 bg-brand-beige/20 px-6 py-5">
          <h2 className="text-base font-bold text-gray-900">
            Directorio de Colaboradores
          </h2>
          <div className="flex items-center gap-3">
            <select
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
              aria-label="Filtrar por empresa"
              className="h-8 rounded-sm border border-gray-200 bg-brand-surface px-2 text-[11px] text-gray-800 focus:border-brand-dark focus:outline-none"
            >
              <option value={TODAS}>Todas las Empresas</option>
              {empresas.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar..."
              aria-label="Buscar colaborador"
              className="h-8 w-44 rounded-sm border border-gray-200 bg-brand-surface px-3 text-[11px] text-gray-800 placeholder-gray-400 focus:border-brand-dark focus:outline-none"
            />
            <button
              type="button"
              onClick={handleNuevoIngreso}
              className="h-8 rounded-sm bg-brand-dark px-4 text-[9px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-brand-dark/90"
            >
              NUEVO INGRESO
            </button>
          </div>
        </div>

        {feedbackExito && (
          <div
            role="status"
            aria-live="polite"
            className="mx-6 my-4 flex items-center justify-between gap-3 rounded-sm border border-status-success/30 bg-status-success/10 px-4 py-3 text-xs font-semibold text-status-success-dark"
          >
            <span>{feedbackExito}</span>
            <button
              type="button"
              onClick={() => setFeedbackExito(null)}
              className="text-[9px] font-bold uppercase tracking-widest text-status-success-dark underline hover:opacity-80"
            >
              CERRAR
            </button>
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="mx-6 my-4 rounded-sm border border-status-danger/30 bg-status-danger/10 px-4 py-3 text-xs font-semibold text-status-danger-dark"
          >
            {errorMsg}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="bg-brand-beige/60">
                {COLUMNAS.map(({ label, className }) => (
                  <th
                    key={label}
                    scope="col"
                    className={`px-6 py-3.5 text-left text-[8px] font-bold uppercase tracking-widest text-gray-500 ${className}`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <>
                  <tr>
                    <td
                      colSpan={COLUMNAS.length}
                      className="px-6 pt-6 pb-2 text-center text-xs font-semibold text-gray-500"
                    >
                      Cargando directorio...
                    </td>
                  </tr>
                  {[1, 2, 3].map((fila) => (
                    <tr
                      key={fila}
                      aria-hidden="true"
                      className="animate-pulse border-b border-gray-100"
                    >
                      <td className="px-6 py-4">
                        <div className="h-3 w-36 rounded bg-gray-200" />
                        <div className="mt-2 h-2 w-44 rounded bg-gray-100" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-3 w-28 rounded bg-gray-200" />
                        <div className="mt-2 h-2 w-24 rounded bg-gray-100" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-4 w-12 rounded bg-gray-200" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-3 w-20 rounded bg-gray-200" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-4 w-16 rounded bg-gray-200" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="ml-auto h-3 w-24 rounded bg-gray-200" />
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {!isLoading && !errorMsg && filtrados.length === 0 && (
                <tr>
                  <td
                    colSpan={COLUMNAS.length}
                    className="px-6 py-8 text-center text-xs text-gray-400"
                  >
                    No hay colaboradores que coincidan con la búsqueda.
                  </td>
                </tr>
              )}

              {!isLoading &&
                filtrados.map((c) => {
                  const activo = esColaboradorActivo(c.estatus);
                  const estatusTexto = (
                    c.estatus || (activo ? "Activo" : "Inactivo")
                  ).toUpperCase();
                  const chipClass = activo
                    ? "border-status-success/30 bg-status-success/10 text-status-success-dark"
                    : "border-gray-200 bg-gray-100 text-gray-500";

                  const nombreMostrar =
                    c.nombre_completo || c.nombre || "Sin nombre";
                  const correoMostrar =
                    c.correo_corporativo || c.correo || "Sin correo";
                  const puestoMostrar = c.puesto || "Sin puesto";
                  const areaMostrar = c.area || c.departamento || "General";
                  const empresaMostrar = c.empresa || "AIF";
                  const rolMostrar = c.rol_sistema || "Colaborador";

                  return (
                    <tr
                      key={c.id}
                      className="border-b border-gray-100 hover:bg-gray-50/50"
                    >
                      <td className="px-6 py-4">
                        <p className="text-xs font-bold text-gray-900">
                          {nombreMostrar}
                        </p>
                        <p className={`mt-0.5 ${MICRO}`}>{correoMostrar}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-xs font-bold text-gray-900">
                          {puestoMostrar}
                        </p>
                        <p className={`mt-0.5 ${MICRO}`}>{areaMostrar}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="rounded-sm border border-gray-300 px-1.5 py-0.5 text-[8px] font-bold uppercase text-gray-600">
                          {empresaMostrar}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-[10px] font-semibold uppercase tracking-widest text-gray-600">
                        {rolMostrar}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`rounded-sm border px-1.5 py-0.5 text-[8px] font-bold uppercase ${chipClass}`}
                        >
                          {estatusTexto}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-3 text-[8px] font-bold uppercase tracking-widest">
                          <button
                            type="button"
                            onClick={() => handleEditar(c.id)}
                            aria-label={`Editar ${nombreMostrar}`}
                            className="text-brand-dark transition-opacity hover:opacity-70"
                          >
                            EDITAR
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAlternarEstatus(c)}
                            aria-label={`${
                              activo ? "Desactivar" : "Activar"
                            } a ${nombreMostrar}`}
                            className={`transition-opacity hover:opacity-70 ${
                              activo
                                ? "text-status-danger-dark"
                                : "text-status-success-dark"
                            }`}
                          >
                            {activo ? "DESACTIVAR" : "ACTIVAR"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>

      {modalAbierto && (
        <ExpedienteColaboradorModal
          colaboradorEditar={colaboradorEditar}
          colaboradoresExistentes={colaboradores}
          onGuardadoExitoso={handleGuardadoExitoso}
          onCerrar={() => {
            setModalAbierto(false);
            setColaboradorEditar(null);
          }}
        />
      )}
    </div>
  );
}
