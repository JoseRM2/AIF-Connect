"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import type { EstatusSolicitud } from "@/types/solicitudes";
import type { VacacionesPagadasForm } from "@/types/rh";

interface ColaboradorRelacion {
  nombre_completo: string;
  saldo_vacaciones?: number | null;
}

interface SolicitudConColaborador {
  id: string;
  colaborador_id: string;
  tipo_solicitud: string;
  fecha_inicio: string;
  fecha_fin: string;
  motivo: string | null;
  estatus: EstatusSolicitud;
  created_at: string;
  colaboradores: ColaboradorRelacion | ColaboradorRelacion[] | null;
}

interface ColaboradorCatalogo {
  id: string;
  nombre_completo: string;
  empresa?: string | null;
}

const ESTATUS_BADGE: Record<
  EstatusSolicitud,
  { label: string; className: string }
> = {
  Pendiente_Jefe: {
    label: "Pendiente (Jefe)",
    className:
      "border-status-warning bg-status-warning/10 text-status-warning-dark",
  },
  Aprobado_Jefe: {
    label: "Aprobado (Jefe)",
    className: "border-status-info bg-status-info/10 text-status-info-dark",
  },
  Pendiente_RH: {
    label: "Pendiente (RH)",
    className:
      "border-status-warning-dark bg-status-warning/20 text-status-warning-dark",
  },
  Rechazado: {
    label: "Rechazado",
    className:
      "border-status-danger bg-status-danger/10 text-status-danger-dark",
  },
  Completado: {
    label: "Completado",
    className:
      "border-status-success bg-status-success/10 text-status-success-dark",
  },
};

const FORM_INICIAL: VacacionesPagadasForm = {
  colaborador_id: "",
  fecha_inicio: "",
  fecha_fin: "",
  dias_a_pagar: 1,
};

const LABEL =
  "mb-1.5 block text-[9px] font-bold uppercase tracking-widest text-gray-400";
const FIELD =
  "h-10 w-full rounded-sm border border-gray-200 bg-brand-beige/40 px-3 text-xs text-gray-800 focus:border-brand-dark focus:outline-none";

function normalizarEstatus(raw: string | null | undefined): EstatusSolicitud {
  const valor = (raw ?? "").trim();
  if (
    valor === "Pendiente_Jefe" ||
    valor === "Aprobado_Jefe" ||
    valor === "Pendiente_RH" ||
    valor === "Rechazado" ||
    valor === "Completado"
  ) {
    return valor;
  }

  const limpio = valor.toLowerCase();
  if (limpio === "aprobado_jefe") return "Aprobado_Jefe";
  if (limpio === "pendiente_rh") return "Pendiente_RH";
  if (limpio.includes("complet") || limpio.includes("aprob")) {
    return "Completado";
  }
  if (limpio.includes("rechaz") || limpio.includes("deneg")) {
    return "Rechazado";
  }
  return "Pendiente_Jefe";
}

function obtenerNombreColaborador(
  rel: ColaboradorRelacion | ColaboradorRelacion[] | null | undefined
): string {
  if (!rel) return "Colaborador";
  if (Array.isArray(rel)) {
    return rel[0]?.nombre_completo || "Colaborador";
  }
  return rel.nombre_completo || "Colaborador";
}

function obtenerSaldoColaborador(
  rel: ColaboradorRelacion | ColaboradorRelacion[] | null | undefined
): number {
  if (!rel) return 0;
  if (Array.isArray(rel)) {
    return rel[0]?.saldo_vacaciones ?? 0;
  }
  return rel.saldo_vacaciones ?? 0;
}

/**
 * Calcula los días inclusivos entre fecha_inicio y fecha_fin usando milisegundos UTC.
 * Ej: del 10 al 11 son 2 días.
 */
function calcularDiasSolicitados(
  fechaInicio: string,
  fechaFin: string
): number {
  if (!fechaInicio || !fechaFin) return 0;

  const [y1, m1, d1] = fechaInicio.split("-").map(Number);
  const [y2, m2, d2] = fechaFin.split("-").map(Number);
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return 0;

  const inicioMs = Date.UTC(y1, m1 - 1, d1);
  const finMs = Date.UTC(y2, m2 - 1, d2);
  if (finMs < inicioMs) return 0;

  const MS_POR_DIA = 1000 * 60 * 60 * 24;
  return Math.round((finMs - inicioMs) / MS_POR_DIA) + 1;
}

export default function GestionSolicitudesTab() {
  const [solicitudes, setSolicitudes] = useState<SolicitudConColaborador[]>([]);
  const [colaboradores, setColaboradores] = useState<ColaboradorCatalogo[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [form, setForm] = useState<VacacionesPagadasForm>(FORM_INICIAL);
  const [isCreatingVacaciones, setIsCreatingVacaciones] = useState(false);
  const [mensajeCreada, setMensajeCreada] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    async function cargarDatos() {
      setIsLoading(true);
      setErrorMsg(null);

      try {
        const supabase = createClient();

        const [solicitudesRes, colaboradoresRes] = await Promise.all([
          supabase
            .from("solicitudes")
            .select(
              "*, colaboradores!colaborador_id(nombre_completo, saldo_vacaciones)"
            )
            .order("created_at", { ascending: false }),
          supabase
            .from("colaboradores")
            .select("id, nombre_completo, empresa")
            .order("nombre_completo", { ascending: true }),
        ]);

        if (cancelado) return;

        if (solicitudesRes.error) {
          setErrorMsg(
            `Error al consultar las solicitudes: ${solicitudesRes.error.message}`
          );
          setSolicitudes([]);
        } else {
          const filas: SolicitudConColaborador[] = (
            solicitudesRes.data ?? []
          ).map((item) => ({
            id: item.id,
            colaborador_id: item.colaborador_id,
            tipo_solicitud: item.tipo_solicitud || item.tipo || "Solicitud",
            fecha_inicio: item.fecha_inicio,
            fecha_fin: item.fecha_fin,
            motivo: item.motivo ?? null,
            estatus: normalizarEstatus(item.estatus),
            created_at: item.created_at,
            colaboradores:
              (item.colaboradores as
                | ColaboradorRelacion
                | ColaboradorRelacion[]
                | null) ?? null,
          }));
          setSolicitudes(filas);
        }

        if (!colaboradoresRes.error && colaboradoresRes.data) {
          setColaboradores(colaboradoresRes.data);
        }
      } catch (err) {
        if (cancelado) return;
        setErrorMsg(
          err instanceof Error
            ? `Error al cargar las solicitudes: ${err.message}`
            : "No fue posible cargar la gestión de solicitudes."
        );
      } finally {
        if (!cancelado) {
          setIsLoading(false);
        }
      }
    }

    cargarDatos();

    return () => {
      cancelado = true;
    };
  }, []);

  /**
   * Actualiza el estatus de una solicitud en Supabase ('Completado' o 'Rechazado'),
   * descuenta días de saldo_vacaciones cuando se aprueban Vacaciones y sincroniza la UI.
   */
  const handleUpdateStatus = async (
    id: string,
    newStatus: "Completado" | "Rechazado",
    solicitud: SolicitudConColaborador
  ) => {
    if (updatingId) return;
    setUpdatingId(id);
    setErrorMsg(null);

    try {
      const supabase = createClient();
      const esVacaciones =
        solicitud.tipo_solicitud.trim().toLowerCase() === "vacaciones";
      let nuevoSaldoAplicado: number | null = null;

      // Si se aprueba ('Completado') y es de tipo 'Vacaciones', descontar días del saldo_vacaciones
      if (newStatus === "Completado" && esVacaciones) {
        const diasSolicitados = calcularDiasSolicitados(
          solicitud.fecha_inicio,
          solicitud.fecha_fin
        );
        const saldoActual = obtenerSaldoColaborador(solicitud.colaboradores);
        const nuevoSaldo = saldoActual - diasSolicitados;

        const { error: errorSaldo } = await supabase
          .from("colaboradores")
          .update({ saldo_vacaciones: nuevoSaldo })
          .eq("id", solicitud.colaborador_id);

        if (errorSaldo) {
          alert(
            "Error al descontar saldo de vacaciones: " + errorSaldo.message
          );
          setErrorMsg(
            "Error al descontar saldo de vacaciones: " + errorSaldo.message
          );
          return;
        }

        nuevoSaldoAplicado = nuevoSaldo;
      }

      const { data, error } = await supabase
        .from("solicitudes")
        .update({ estatus: newStatus })
        .eq("id", id)
        .select();

      if (error) {
        alert("Error al actualizar: " + error.message);
        setErrorMsg("Error al actualizar: " + error.message);
        return;
      }

      if (!data || data.length === 0) {
        const msgRls =
          "No se modificó ningún registro en la base de datos (verifica los permisos RLS de UPDATE en la tabla 'solicitudes').";
        alert("Error al actualizar: " + msgRls);
        setErrorMsg("Error al actualizar: " + msgRls);
        return;
      }

      setSolicitudes((prev) =>
        prev.map((s) => {
          const mismoColaborador = s.colaborador_id === solicitud.colaborador_id;
          let relActualizada = s.colaboradores;

          if (mismoColaborador && nuevoSaldoAplicado !== null && relActualizada) {
            if (Array.isArray(relActualizada)) {
              relActualizada = relActualizada.map((r) => ({
                ...r,
                saldo_vacaciones: nuevoSaldoAplicado,
              }));
            } else {
              relActualizada = {
                ...relActualizada,
                saldo_vacaciones: nuevoSaldoAplicado,
              };
            }
          }

          if (s.id === id) {
            return {
              ...s,
              estatus: newStatus,
              colaboradores: relActualizada,
            };
          }

          return mismoColaborador
            ? { ...s, colaboradores: relActualizada }
            : s;
        })
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Ocurrió un error al actualizar la solicitud.";
      alert("Error al actualizar: " + msg);
      setErrorMsg("Error al actualizar: " + msg);
    } finally {
      setUpdatingId(null);
    }
  };

  /** Crea una solicitud directa de vacaciones pagadas desde RH en Supabase. */
  const handleCrearVacaciones = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isCreatingVacaciones) return;

    const colaborador = colaboradores.find((c) => c.id === form.colaborador_id);
    if (!colaborador) return;

    const dias = Math.max(1, Number(form.dias_a_pagar) || 1);
    const motivoTexto = `Solicitud directa de vacaciones pagadas (${dias} ${
      dias === 1 ? "día" : "días"
    })`;

    setIsCreatingVacaciones(true);
    setErrorMsg(null);
    setMensajeCreada(null);

    try {
      const supabase = createClient();
      const { data: insertada, error } = await supabase
        .from("solicitudes")
        .insert({
          colaborador_id: colaborador.id,
          tipo_solicitud: "Vacaciones Pagadas",
          fecha_inicio: form.fecha_inicio,
          fecha_fin: form.fecha_fin || form.fecha_inicio,
          motivo: motivoTexto,
          estatus: "Completado",
        })
        .select(
          "*, colaboradores!colaborador_id(nombre_completo, saldo_vacaciones)"
        )
        .single();

      if (error) {
        setErrorMsg(
          `No se pudo crear la solicitud de vacaciones pagadas: ${error.message}`
        );
        return;
      }

      if (insertada) {
        const nuevaFila: SolicitudConColaborador = {
          id: insertada.id,
          colaborador_id: insertada.colaborador_id,
          tipo_solicitud: insertada.tipo_solicitud || "Vacaciones Pagadas",
          fecha_inicio: insertada.fecha_inicio,
          fecha_fin: insertada.fecha_fin,
          motivo: insertada.motivo ?? motivoTexto,
          estatus: normalizarEstatus(insertada.estatus),
          created_at: insertada.created_at,
          colaboradores: (insertada.colaboradores as
            | ColaboradorRelacion
            | ColaboradorRelacion[]
            | null) ?? { nombre_completo: colaborador.nombre_completo },
        };
        setSolicitudes((prev) => [nuevaFila, ...prev]);
      }

      setForm(FORM_INICIAL);
      setMensajeCreada(
        `Solicitud creada para ${colaborador.nombre_completo} (${dias} ${
          dias === 1 ? "día" : "días"
        }).`
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Ocurrió un error al registrar las vacaciones pagadas."
      );
    } finally {
      setIsCreatingVacaciones(false);
    }
  };

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
      {/* Bloque Izquierdo: Tabla / Bandeja de Gestión de Solicitudes */}
      <section className="overflow-hidden rounded-sm bg-brand-surface shadow-sm lg:col-span-8">
        <header className="border-b border-gray-100 px-6 py-5">
          <h2 className="text-base font-bold text-gray-900">
            Gestión de Solicitudes (RH)
          </h2>
          <p className="mt-0.5 text-xs text-gray-400">
            Historial y resolución de solicitudes de colaboradores en tiempo real
          </p>
        </header>

        {errorMsg && (
          <div
            role="alert"
            className="mx-6 my-4 rounded-sm border border-status-danger/30 bg-status-danger/10 px-4 py-3 text-xs font-semibold text-status-danger-dark"
          >
            {errorMsg}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse">
            <thead>
              <tr className="bg-brand-beige/60">
                <th
                  scope="col"
                  className="px-6 py-3.5 text-left text-[8px] font-bold uppercase tracking-widest text-gray-500"
                >
                  COLABORADOR / TIPO
                </th>
                <th
                  scope="col"
                  className="px-6 py-3.5 text-left text-[8px] font-bold uppercase tracking-widest text-gray-500"
                >
                  FECHAS
                </th>
                <th
                  scope="col"
                  className="px-6 py-3.5 text-left text-[8px] font-bold uppercase tracking-widest text-gray-500"
                >
                  MOTIVO
                </th>
                <th
                  scope="col"
                  className="px-6 py-3.5 text-left text-[8px] font-bold uppercase tracking-widest text-gray-500"
                >
                  ESTATUS
                </th>
                <th
                  scope="col"
                  className="px-6 py-3.5 text-right text-[8px] font-bold uppercase tracking-widest text-gray-500"
                >
                  ACCIONES
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading && (
                <>
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 pt-6 pb-2 text-center text-xs font-semibold text-gray-500"
                    >
                      Cargando solicitudes...
                    </td>
                  </tr>
                  {[1, 2, 3].map((fila) => (
                    <tr
                      key={fila}
                      aria-hidden="true"
                      className="animate-pulse"
                    >
                      <td className="px-6 py-4">
                        <div className="h-3 w-36 rounded bg-gray-200" />
                        <div className="mt-2 h-2 w-24 rounded bg-gray-100" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-3 w-32 rounded bg-gray-200" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-3 w-40 rounded bg-gray-200" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-4 w-24 rounded bg-gray-200" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="ml-auto h-6 w-28 rounded bg-gray-200" />
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {!isLoading && solicitudes.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-8 text-center text-xs text-gray-400"
                  >
                    No hay solicitudes registradas en la base de datos.
                  </td>
                </tr>
              )}

              {!isLoading &&
                solicitudes.map((solicitud) => {
                  const nombreColaborador = obtenerNombreColaborador(
                    solicitud.colaboradores
                  );
                  const badge =
                    ESTATUS_BADGE[solicitud.estatus] ??
                    ESTATUS_BADGE.Pendiente_Jefe;
                  const mostrarAcciones =
                    solicitud.estatus !== "Completado" &&
                    solicitud.estatus !== "Rechazado";
                  const procesando = updatingId === solicitud.id;

                  return (
                    <tr
                      key={solicitud.id}
                      className="hover:bg-gray-50/50"
                    >
                      <td className="px-6 py-4">
                        <p className="text-xs font-bold text-gray-900">
                          {nombreColaborador}
                        </p>
                        <p className="mt-0.5 text-[9px] font-bold uppercase tracking-widest text-brand-gold">
                          {solicitud.tipo_solicitud}
                        </p>
                      </td>

                      <td className="px-6 py-4 font-mono text-[11px] text-gray-600">
                        {solicitud.fecha_inicio} al {solicitud.fecha_fin}
                      </td>

                      <td className="px-6 py-4 text-xs text-gray-600">
                        {solicitud.motivo || "-"}
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`inline-block rounded-sm border px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-right">
                        {mostrarAcciones ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              disabled={procesando}
                              onClick={() =>
                                handleUpdateStatus(
                                  solicitud.id,
                                  "Completado",
                                  solicitud
                                )
                              }
                              className="rounded-sm bg-status-success px-3 py-1.5 text-[8px] font-bold uppercase tracking-widest text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {procesando ? "..." : "APROBAR"}
                            </button>
                            <button
                              type="button"
                              disabled={procesando}
                              onClick={() =>
                                handleUpdateStatus(
                                  solicitud.id,
                                  "Rechazado",
                                  solicitud
                                )
                              }
                              className="rounded-sm border border-status-danger/30 bg-status-danger/10 px-3 py-1.5 text-[8px] font-bold uppercase tracking-widest text-status-danger-dark transition-colors hover:bg-status-danger/20 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {procesando ? "..." : "RECHAZAR"}
                            </button>
                          </div>
                        ) : (
                          <span className="text-[9px] font-semibold uppercase tracking-widest text-gray-400">
                            Resuelta
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Bloque Derecho: Vacaciones Pagadas (Formulario exclusivo RH) */}
      <aside className="rounded-sm border-t-4 border-brand-dark bg-brand-surface p-6 shadow-sm lg:col-span-4">
        <header className="mb-5">
          <h2 className="font-serif text-base font-bold text-brand-gold">
            Vacaciones Pagadas
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            Crear solicitud directa de vacaciones pagadas para un colaborador.
          </p>
        </header>

        <form onSubmit={handleCrearVacaciones} className="flex flex-col gap-4">
          <div>
            <label htmlFor="rh-vac-colaborador" className={LABEL}>
              COLABORADOR
            </label>
            <select
              id="rh-vac-colaborador"
              value={form.colaborador_id}
              onChange={(e) => {
                setForm((prev) => ({
                  ...prev,
                  colaborador_id: e.target.value,
                }));
                setMensajeCreada(null);
              }}
              required
              className={FIELD}
            >
              <option value="" disabled>
                Seleccionar...
              </option>
              {colaboradores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre_completo} ({c.empresa || "AIF"})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="rh-vac-inicio" className={LABEL}>
                FECHA INICIO
              </label>
              <input
                id="rh-vac-inicio"
                type="date"
                value={form.fecha_inicio}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, fecha_inicio: e.target.value }))
                }
                required
                className={FIELD}
              />
            </div>

            <div>
              <label htmlFor="rh-vac-fin" className={LABEL}>
                FECHA FIN
              </label>
              <input
                id="rh-vac-fin"
                type="date"
                value={form.fecha_fin}
                min={form.fecha_inicio || undefined}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, fecha_fin: e.target.value }))
                }
                required
                className={FIELD}
              />
            </div>
          </div>

          <div>
            <label htmlFor="rh-vac-dias" className={LABEL}>
              DÍAS A PAGAR
            </label>
            <input
              id="rh-vac-dias"
              type="number"
              min={1}
              max={30}
              value={form.dias_a_pagar}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  dias_a_pagar: Number(e.target.value),
                }))
              }
              required
              className={FIELD}
            />
          </div>

          <button
            type="submit"
            disabled={isCreatingVacaciones}
            className="mt-1 h-10 w-full rounded-sm bg-brand-dark text-[10px] font-bold uppercase tracking-widest text-brand-gold transition-colors hover:bg-brand-dark/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCreatingVacaciones ? "GUARDANDO..." : "CREAR SOLICITUD"}
          </button>

          {mensajeCreada && (
            <p role="status" className="text-[11px] text-status-success-dark">
              {mensajeCreada}
            </p>
          )}
        </form>
      </aside>
    </div>
  );
}
