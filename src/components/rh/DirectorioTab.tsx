"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import ExpedienteColaboradorModal from "@/components/rh/ExpedienteColaboradorModal";
import ReporteEmpleados from "@/components/rh/ReporteEmpleados";
import VisorDocumentoExpedienteModal from "@/components/rh/VisorDocumentoExpedienteModal";
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

const MICRO = "text-[9px] font-medium uppercase tracking-wider text-gray-700";

function esColaboradorActivo(estatus: string | null | undefined): boolean {
  return (estatus ?? "Activo").trim().toLowerCase() !== "inactivo";
}

function obtenerNombreCompleto(c: {
  nombre?: string | null;
  apellidos?: string | null;
  nombre_completo?: string | null;
}): string {
  const concatenado = `${c.nombre ?? ""} ${c.apellidos ?? ""}`.trim();
  if (concatenado) return concatenado;
  return (c.nombre_completo ?? "").trim() || "Sin nombre";
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
  const [colaboradorVisorDocs, setColaboradorVisorDocs] =
    useState<ColaboradorRow | null>(null);

  // Estado para el Flujo de Baja de Colaborador (Offboarding en 2 pasos)
  const [colaboradorBaja, setColaboradorBaja] =
    useState<ColaboradorRow | null>(null);
  const [pasoBaja, setPasoBaja] = useState<"confirmacion" | "motivo" | null>(
    null
  );
  const [motivoBajaTexto, setMotivoBajaTexto] = useState<string>("");
  const [errorBaja, setErrorBaja] = useState<string | null>(null);
  const [isGuardandoBaja, setIsGuardandoBaja] = useState<boolean>(false);

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
        nombre: obtenerNombreCompleto(c),
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

      const nombre = obtenerNombreCompleto(c);
      const correo = c.correo_corporativo || c.correo || "";
      const puesto = c.puesto || "";
      const area = c.area || c.departamento || "";
      const rol = c.rol_sistema || "";

      return normalizar(
        `${nombre} ${correo} ${puesto} ${area} ${rol}`
      ).includes(termino);
    });
  }, [colaboradores, empresa, busqueda]);

  const iniciarFlujoBaja = (colaborador: ColaboradorRow) => {
    setColaboradorBaja(colaborador);
    setPasoBaja("confirmacion");
    setMotivoBajaTexto(colaborador.motivo_baja ?? "");
    setErrorBaja(null);
  };

  const cerrarFlujoBaja = () => {
    if (isGuardandoBaja) return;
    setColaboradorBaja(null);
    setPasoBaja(null);
    setMotivoBajaTexto("");
    setErrorBaja(null);
  };

  const handleConfirmarBajaSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!colaboradorBaja || isGuardandoBaja) return;

    const motivoLimpio = motivoBajaTexto.trim();
    if (!motivoLimpio) {
      setErrorBaja("Debes ingresar el motivo de la baja para continuar.");
      return;
    }

    setIsGuardandoBaja(true);
    setErrorBaja(null);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("colaboradores")
        .update({
          estatus: "Inactivo",
          motivo_baja: motivoLimpio,
        })
        .eq("id", colaboradorBaja.id);

      if (error) {
        setErrorBaja(`No se pudo registrar la baja: ${error.message}`);
        return;
      }

      const nombreColab = obtenerNombreCompleto(colaboradorBaja);
      setColaboradores((prev) =>
        prev.map((c) =>
          c.id === colaboradorBaja.id
            ? { ...c, estatus: "Inactivo", motivo_baja: motivoLimpio }
            : c
        )
      );
      setFeedbackExito(
        `El colaborador "${nombreColab}" fue dado de baja (Inactivo) y se registró el motivo de baja.`
      );
      setColaboradorBaja(null);
      setPasoBaja(null);
      setMotivoBajaTexto("");
    } catch (err) {
      setErrorBaja(
        err instanceof Error
          ? `Error al procesar la baja: ${err.message}`
          : "Ocurrió un error inesperado al dar de baja al colaborador."
      );
    } finally {
      setIsGuardandoBaja(false);
    }
  };

  const handleAlternarEstatus = async (colaborador: ColaboradorRow) => {
    const activoActual = esColaboradorActivo(colaborador.estatus);

    // Si está activo y se hace clic en "Desactivar", interceptar con el flujo de Offboarding en 2 pasos
    if (activoActual) {
      iniciarFlujoBaja(colaborador);
      return;
    }

    const nuevoEstatus = "Activo";

    // Actualización optimista en estado local al reactivar
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
        obtenerNombreCompleto(a).localeCompare(obtenerNombreCompleto(b), "es")
      );
    });

    setModalAbierto(false);
    setColaboradorEditar(null);

    const nombre = obtenerNombreCompleto(colaboradorGuardado);
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
        <div className="flex flex-wrap items-center justify-between gap-4 bg-brand-beige/30 px-6 py-4">
          <h2 className="text-base font-bold text-gray-900">
            Directorio de Colaboradores
          </h2>
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
              aria-label="Filtrar por empresa"
              className="h-9 rounded-sm border border-gray-300 bg-brand-surface px-3 text-xs font-semibold text-gray-900 focus:border-brand-dark focus:outline-none"
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
              placeholder="Buscar colaborador..."
              aria-label="Buscar colaborador"
              className="h-9 w-52 rounded-sm border border-gray-300 bg-brand-surface px-3 text-xs font-medium text-gray-900 placeholder-gray-600 focus:border-brand-dark focus:outline-none"
            />
            <button
              type="button"
              onClick={handleNuevoIngreso}
              className="h-9 rounded-sm bg-brand-dark px-4 text-[10px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-brand-dark/90"
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
              <tr className="bg-brand-beige/70">
                {COLUMNAS.map(({ label, className }) => (
                  <th
                    key={label}
                    scope="col"
                    className={`px-6 py-3 text-left text-[8px] font-extrabold uppercase tracking-wider text-gray-800 ${className}`}
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

                  const nombreMostrar = obtenerNombreCompleto(c);
                  const correoMostrar =
                    c.correo_corporativo || c.correo || "Sin correo";
                  const puestoMostrar = c.puesto || "Sin puesto";
                  const areaMostrar = c.area || c.departamento || "General";
                  const empresaMostrar = c.empresa || "AIF";
                  const rolMostrar = c.rol_sistema || "Colaborador";

                  return (
                    <tr
                      key={c.id}
                      className="border-b border-gray-200 hover:bg-gray-50/80"
                    >
                      <td className="px-6 py-3.5">
                        <p className="text-xs font-bold text-gray-900">
                          {nombreMostrar}
                        </p>
                        <p className={`mt-0.5 ${MICRO}`}>{correoMostrar}</p>
                      </td>
                      <td className="px-6 py-3.5">
                        <p className="text-xs font-bold text-gray-900">
                          {puestoMostrar}
                        </p>
                        <p className={`mt-0.5 ${MICRO}`}>{areaMostrar}</p>
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="rounded-sm border border-gray-400 bg-brand-beige/30 px-2 py-0.5 text-[8px] font-bold uppercase text-gray-800">
                          {empresaMostrar}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-[9px] font-bold uppercase tracking-wider text-gray-800">
                        {rolMostrar}
                      </td>
                      <td className="px-6 py-3.5">
                        <span
                          className={`rounded-sm border px-2 py-0.5 text-[8px] font-bold uppercase ${chipClass}`}
                        >
                          {estatusTexto}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center justify-end gap-2.5 text-[8px] font-bold uppercase tracking-wider">
                          <button
                            type="button"
                            onClick={() => setColaboradorVisorDocs(c)}
                            aria-label={`Ver documentos de ${nombreMostrar}`}
                            className="rounded-sm border border-gray-300 bg-brand-beige/40 px-2.5 py-1 text-brand-dark transition-colors hover:bg-brand-beige"
                          >
                            VER DOCUMENTO
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditar(c.id)}
                            aria-label={`Editar ${nombreMostrar}`}
                            className="rounded-sm border border-brand-dark/30 px-2.5 py-1 text-brand-dark transition-colors hover:bg-brand-dark hover:text-white"
                          >
                            EDITAR
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAlternarEstatus(c)}
                            aria-label={`${
                              activo ? "Desactivar" : "Activar"
                            } a ${nombreMostrar}`}
                            className={`rounded-sm border px-2.5 py-1 transition-colors ${
                              activo
                                ? "border-status-danger/40 text-status-danger-dark hover:bg-status-danger/10"
                                : "border-status-success/40 text-status-success-dark hover:bg-status-success/10"
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

      {colaboradorVisorDocs && (
        <VisorDocumentoExpedienteModal
          nombreColaborador={obtenerNombreCompleto(colaboradorVisorDocs)}
          comprobanteEstudiosUrl={
            colaboradorVisorDocs.comprobante_estudios_url
          }
          cartaRecomendacionUrl={colaboradorVisorDocs.carta_recomendacion_url}
          onCerrar={() => setColaboradorVisorDocs(null)}
        />
      )}

      {/* Modal 1 de Offboarding: Confirmación de desactivación */}
      {colaboradorBaja && pasoBaja === "confirmacion" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-offboarding-confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md overflow-hidden rounded-sm bg-brand-surface shadow-2xl">
            <header className="border-b border-gray-100 bg-brand-beige/30 px-6 py-4">
              <span className="text-[9px] font-bold uppercase tracking-widest text-status-danger-dark">
                CONFIRMACIÓN DE BAJA · OFFBOARDING
              </span>
              <h3
                id="modal-offboarding-confirm-title"
                className="mt-1 text-base font-bold text-gray-900"
              >
                ¿Estás seguro de desactivar a este colaborador?
              </h3>
            </header>

            <div className="px-6 py-5">
              <p className="text-xs leading-relaxed text-gray-600">
                Estás por iniciar el proceso de baja para{" "}
                <span className="font-bold text-gray-900">
                  {obtenerNombreCompleto(colaboradorBaja)}
                </span>{" "}
                ({colaboradorBaja.correo_corporativo || "Sin correo"}). En el
                siguiente paso deberás especificar el motivo de la baja.
              </p>
            </div>

            <footer className="flex items-center justify-end gap-3 border-t border-gray-100 bg-brand-beige/15 px-6 py-4">
              <button
                type="button"
                onClick={cerrarFlujoBaja}
                className="rounded-sm border border-gray-300 bg-brand-surface px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-700 transition-colors hover:bg-gray-50"
              >
                CANCELAR
              </button>
              <button
                type="button"
                onClick={() => {
                  setErrorBaja(null);
                  setPasoBaja("motivo");
                }}
                className="rounded-sm bg-status-danger px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-status-danger/90"
              >
                SÍ, CONTINUAR
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Modal 2 de Offboarding: Captura obligatoria del Motivo de la baja */}
      {colaboradorBaja && pasoBaja === "motivo" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-offboarding-motivo-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
        >
          <form
            onSubmit={handleConfirmarBajaSubmit}
            className="w-full max-w-lg overflow-hidden rounded-sm bg-brand-surface shadow-2xl"
          >
            <header className="border-b border-gray-100 bg-brand-dark px-6 py-4 text-white">
              <span className="text-[9px] font-bold uppercase tracking-widest text-brand-gold">
                PASO 2 DE 2 · REGISTRO DE OFFBOARDING
              </span>
              <h3
                id="modal-offboarding-motivo-title"
                className="mt-1 text-base font-bold text-white"
              >
                Motivo de la baja de {obtenerNombreCompleto(colaboradorBaja)}
              </h3>
            </header>

            <div className="flex flex-col gap-4 px-6 py-5">
              {errorBaja && (
                <div
                  role="alert"
                  className="rounded-sm border border-status-danger/30 bg-status-danger/10 px-3.5 py-2.5 text-xs font-semibold text-status-danger-dark"
                >
                  {errorBaja}
                </div>
              )}

              <div>
                <label
                  htmlFor="motivo-baja-textarea"
                  className="mb-1.5 block text-[9px] font-bold uppercase tracking-widest text-gray-500"
                >
                  MOTIVO DE LA BAJA *
                </label>
                <textarea
                  id="motivo-baja-textarea"
                  rows={4}
                  required
                  autoFocus
                  disabled={isGuardandoBaja}
                  value={motivoBajaTexto}
                  onChange={(e) => {
                    setErrorBaja(null);
                    setMotivoBajaTexto(e.target.value);
                  }}
                  placeholder="Describe detalladamente el motivo de la baja o desactivación del colaborador..."
                  className="w-full resize-y rounded-sm border border-gray-200 bg-brand-surface px-3.5 py-2.5 text-xs leading-relaxed text-gray-800 placeholder-gray-400 focus:border-brand-dark focus:outline-none disabled:opacity-60"
                />
                <p className="mt-1 text-[10px] text-gray-400">
                  Al guardar, el estatus cambiará a Inactivo y este motivo quedará registrado en el expediente.
                </p>
              </div>
            </div>

            <footer className="flex items-center justify-end gap-3 border-t border-gray-100 bg-brand-beige/15 px-6 py-4">
              <button
                type="button"
                disabled={isGuardandoBaja}
                onClick={cerrarFlujoBaja}
                className="rounded-sm border border-gray-300 bg-brand-surface px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                CANCELAR
              </button>
              <button
                type="submit"
                disabled={isGuardandoBaja || !motivoBajaTexto.trim()}
                className="rounded-sm bg-brand-dark px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-brand-gold transition-colors hover:bg-brand-dark/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isGuardandoBaja ? "GUARDANDO BAJA..." : "CONFIRMAR BAJA"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}
