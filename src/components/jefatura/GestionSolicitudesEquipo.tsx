"use client";

import { useCallback, useEffect, useState } from "react";
import {
  obtenerSolicitudesEquipoAction,
  resolverSolicitudEquipoAction,
  type DiagnosticoJefatura,
} from "@/app/actions/jefatura";
import { createClient } from "@/lib/supabase/client";

interface ColaboradorEquipoRelacion {
  id?: string;
  nombre_completo: string;
  departamento?: string | null;
  puesto?: string | null;
  jefe_directo_id?: string | null;
  jefe_directo?: string | null;
}

export interface SolicitudEquipoItem {
  id: string;
  colaborador_id: string;
  nombre_colaborador: string;
  puesto_colaborador: string;
  tipo_solicitud: string;
  fecha_inicio: string;
  fecha_fin: string;
  motivo: string | null;
  estatus: string;
  created_at: string;
}

const COLUMNAS = [
  { label: "NOMBRE DEL COLABORADOR", className: "text-left" },
  { label: "TIPO DE SOLICITUD", className: "text-left" },
  { label: "FECHAS (INICIO Y FIN)", className: "text-left" },
  { label: "MOTIVO", className: "text-left" },
  { label: "ESTATUS ACTUAL", className: "text-left" },
  { label: "ACCIONES", className: "text-right" },
] as const;

function esEstatusPendiente(estatus: string | null | undefined): boolean {
  const limpio = (estatus ?? "").trim().toLowerCase();
  return limpio === "pendiente" || limpio === "pendiente_jefe";
}

function obtenerConfigEstatus(estatus: string | null | undefined): {
  label: string;
  className: string;
} {
  const limpio = (estatus ?? "").trim().toLowerCase();

  if (limpio === "pendiente" || limpio === "pendiente_jefe") {
    return {
      label: "Pendiente",
      className:
        "border-status-warning bg-status-warning/10 text-status-warning-dark",
    };
  }
  if (
    limpio === "aprobado" ||
    limpio === "aprobado_jefe" ||
    limpio === "completado"
  ) {
    return {
      label:
        limpio === "aprobado_jefe"
          ? "Aprobado (Jefe)"
          : limpio === "completado"
            ? "Completado"
            : "Aprobado",
      className:
        "border-status-success bg-status-success/10 text-status-success-dark",
    };
  }
  if (limpio === "pendiente_rh") {
    return {
      label: "Pendiente (RH)",
      className: "border-status-info bg-status-info/10 text-status-info-dark",
    };
  }
  if (limpio === "rechazado") {
    return {
      label: "Rechazado",
      className:
        "border-status-danger bg-status-danger/10 text-status-danger-dark",
    };
  }

  return {
    label: estatus || "Pendiente",
    className:
      "border-status-warning bg-status-warning/10 text-status-warning-dark",
  };
}

function extraerColaborador(
  rel:
    | ColaboradorEquipoRelacion
    | ColaboradorEquipoRelacion[]
    | null
    | undefined
): ColaboradorEquipoRelacion {
  if (!rel) return { nombre_completo: "Colaborador" };
  if (Array.isArray(rel)) {
    return rel[0] ?? { nombre_completo: "Colaborador" };
  }
  return rel;
}

export default function GestionSolicitudesEquipo() {
  const [solicitudes, setSolicitudes] = useState<SolicitudEquipoItem[]>([]);
  const [diagnostico, setDiagnostico] = useState<DiagnosticoJefatura | null>(
    null
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedbackExito, setFeedbackExito] = useState<string | null>(null);
  const [procesando, setProcesando] = useState<{
    id: string;
    accion: "aprobar" | "rechazar";
  } | null>(null);

  const cargarSolicitudesEquipo = useCallback(
    async (mostrarSkeleton = true) => {
      if (mostrarSkeleton) {
        setIsLoading(true);
      }
      setErrorMsg(null);

      try {
        // Vía principal: Server Action con `service_role` (evita bloqueos de RLS
        // y busca subordinados por `jefe_directo_id` UUID y `jefe_directo` UUID/Nombre)
        const serverRes = await obtenerSolicitudesEquipoAction();

        if (serverRes.ok) {
          setSolicitudes(serverRes.solicitudes);
          setDiagnostico(serverRes.diagnostico);
          return;
        }

        // Respaldo en cliente si el Server Action no estuvo disponible
        const supabase = createClient();
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
          setErrorMsg(
            "No se pudo verificar la sesión actual. Inicia sesión nuevamente."
          );
          setSolicitudes([]);
          return;
        }

        const userId = user.id;

        // Paso 1: Consultar colaboradores por `jefe_directo_id` y por `jefe_directo`
        const [porIdRes, porTextoRes] = await Promise.all([
          supabase
            .from("colaboradores")
            .select("id, nombre_completo, departamento, puesto")
            .eq("jefe_directo_id", userId),
          supabase
            .from("colaboradores")
            .select("id, nombre_completo, departamento, puesto")
            .eq("jefe_directo", userId),
        ]);

        const mapaEquipo = new Map<
          string,
          {
            id: string;
            nombre_completo: string;
            departamento?: string | null;
            puesto?: string | null;
          }
        >();

        for (const item of [
          ...(porIdRes.data ?? []),
          ...(porTextoRes.data ?? []),
        ]) {
          if (item?.id) {
            mapaEquipo.set(item.id, item);
          }
        }

        // Paso 2: Extraer arreglo de IDs
        const equipoIds = Array.from(mapaEquipo.keys());

        if (equipoIds.length === 0) {
          setSolicitudes([]);
          return;
        }

        // Paso 3: Consultar `solicitudes` filtrando por el equipo directo y la matriz de tipos de Jefatura
        const { data, error } = await supabase
          .from("solicitudes")
          .select(
            "*, colaboradores!solicitudes_colaborador_id_fkey(nombre_completo, departamento, puesto)"
          )
          .in("colaborador_id", equipoIds)
          .in("tipo_solicitud", [
            "Permiso sin goce de sueldo",
            "Permiso con goce de sueldo",
            "Vacaciones",
          ])
          .order("created_at", { ascending: false });

        if (error) {
          throw new Error(error.message);
        }

        const filasMapeadas: SolicitudEquipoItem[] = (data ?? []).map(
          (fila) => {
            const raw = fila as Record<string, unknown>;
            const colabJoin = extraerColaborador(
              raw.colaboradores as
                | ColaboradorEquipoRelacion
                | ColaboradorEquipoRelacion[]
                | null
            );
            const colabCache = mapaEquipo.get(String(fila.colaborador_id));

            return {
              id: String(fila.id),
              colaborador_id: String(fila.colaborador_id),
              nombre_colaborador:
                colabJoin.nombre_completo &&
                colabJoin.nombre_completo !== "Colaborador"
                  ? colabJoin.nombre_completo
                  : colabCache?.nombre_completo || "Colaborador",
              puesto_colaborador:
                colabJoin.puesto ||
                colabJoin.departamento ||
                colabCache?.puesto ||
                colabCache?.departamento ||
                "Equipo Directo",
              tipo_solicitud:
                fila.tipo_solicitud ||
                (raw.tipo as string | undefined) ||
                "Vacaciones",
              fecha_inicio: fila.fecha_inicio,
              fecha_fin: fila.fecha_fin,
              motivo: fila.motivo ?? null,
              estatus: String(fila.estatus || "Pendiente"),
              created_at: fila.created_at,
            };
          }
        );

        setSolicitudes(filasMapeadas);
      } catch (err) {
        setErrorMsg(
          err instanceof Error
            ? `Error al consultar las solicitudes del equipo: ${err.message}`
            : "No fue posible cargar las solicitudes del equipo directo."
        );
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    cargarSolicitudesEquipo(true);
  }, [cargarSolicitudesEquipo]);

  const handleResolverSolicitud = async (
    solicitud: SolicitudEquipoItem,
    decision: "Aprobado" | "Rechazado"
  ) => {
    if (procesando) return;

    setProcesando({
      id: solicitud.id,
      accion: decision === "Aprobado" ? "aprobar" : "rechazar",
    });
    setErrorMsg(null);
    setFeedbackExito(null);

    try {
      const serverRes = await resolverSolicitudEquipoAction(
        solicitud.id,
        decision
      );

      if (!serverRes.ok) {
        throw new Error(serverRes.error);
      }

      const estatusFinal = serverRes.estatusAplicado;

      // Actualización inmediata del estado local y refresco en segundo plano
      setSolicitudes((prev) =>
        prev.map((item) =>
          item.id === solicitud.id ? { ...item, estatus: estatusFinal } : item
        )
      );

      setFeedbackExito(
        decision === "Aprobado"
          ? `Solicitud de ${solicitud.tipo_solicitud.toLowerCase()} de "${solicitud.nombre_colaborador}" aprobada correctamente.`
          : `Solicitud de ${solicitud.tipo_solicitud.toLowerCase()} de "${solicitud.nombre_colaborador}" rechazada.`
      );

      await cargarSolicitudesEquipo(false);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? `Error al resolver la solicitud: ${err.message}`
          : "Ocurrió un error al actualizar el estatus de la solicitud."
      );
    } finally {
      setProcesando(null);
    }
  };

  return (
    <section className="overflow-hidden rounded-sm bg-brand-surface shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 bg-brand-beige/20 px-6 py-5">
        <div>
          <span className="text-[9px] font-bold uppercase tracking-widest text-brand-gold">
            PANEL DE SUPERVISIÓN • JEFATURA
          </span>
          <h2 className="mt-0.5 text-base font-bold text-gray-900">
            Gestión de Solicitudes de Mi Equipo
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Revisa, aprueba o rechaza las vacaciones y permisos de tus
            colaboradores directos.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {diagnostico && (
            <span className="rounded-sm border border-brand-gold/40 bg-brand-beige/40 px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-brand-dark">
              Equipo a cargo: {diagnostico.totalEquipo}{" "}
              {diagnostico.totalEquipo === 1 ? "colaborador" : "colaboradores"}
            </span>
          )}
          <button
            type="button"
            onClick={() => cargarSolicitudesEquipo(true)}
            disabled={isLoading || Boolean(procesando)}
            className="h-8 rounded-sm border border-gray-200 bg-brand-surface px-3.5 text-[9px] font-bold uppercase tracking-widest text-brand-dark transition-colors hover:bg-brand-beige/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? "ACTUALIZANDO..." : "ACTUALIZAR TABLA"}
          </button>
        </div>
      </header>

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
          aria-live="polite"
          className="mx-6 my-4 rounded-sm border border-status-danger/30 bg-status-danger/10 px-4 py-3 text-xs font-semibold text-status-danger-dark"
        >
          {errorMsg}
        </div>
      )}

      <div className="max-h-[540px] overflow-auto">
        <table
          aria-label="Solicitudes del equipo directo"
          className="w-full min-w-[780px] border-separate border-spacing-0"
        >
          <thead className="sticky top-0 z-10 bg-brand-beige/60 backdrop-blur-sm">
            <tr>
              {COLUMNAS.map(({ label, className }) => (
                <th
                  key={label}
                  scope="col"
                  className={`border-b border-gray-200 px-6 py-3.5 text-[8px] font-bold uppercase tracking-widest text-gray-500 ${className}`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <>
                <tr>
                  <td
                    colSpan={COLUMNAS.length}
                    className="px-6 pt-6 pb-2 text-center text-xs font-semibold text-gray-500"
                  >
                    Cargando solicitudes de tu equipo directo...
                  </td>
                </tr>
                {[1, 2, 3].map((fila) => (
                  <tr key={fila} aria-hidden="true" className="animate-pulse">
                    <td className="px-6 py-4">
                      <div className="h-3 w-36 rounded bg-gray-200" />
                      <div className="mt-2 h-2 w-24 rounded bg-gray-100" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-3 w-24 rounded bg-gray-200" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-3 w-36 rounded bg-gray-200" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-3 w-44 rounded bg-gray-200" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-4 w-20 rounded bg-gray-200" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="ml-auto h-6 w-32 rounded bg-gray-200" />
                    </td>
                  </tr>
                ))}
              </>
            )}

            {!isLoading && solicitudes.length === 0 && (
              <tr>
                <td
                  colSpan={COLUMNAS.length}
                  className="px-6 py-10 text-center text-xs text-gray-500"
                >
                  {diagnostico && diagnostico.totalEquipo === 0 ? (
                    <div className="mx-auto max-w-xl space-y-1">
                      <p className="font-semibold text-gray-700">
                        Aún no tienes colaboradores vinculados como subordinados
                        directos.
                      </p>
                      <p className="text-[11px] text-gray-400">
                        Jefe actual: <strong>{diagnostico.nombreJefe}</strong> (
                        <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[10px]">
                          {diagnostico.userId}
                        </code>
                        ). Verifica en el expediente del colaborador que el
                        campo <strong>Jefe Directo</strong> apunte a este
                        usuario.
                      </p>
                    </div>
                  ) : diagnostico && diagnostico.totalEquipo > 0 ? (
                    <div className="mx-auto max-w-xl space-y-1">
                      <p className="font-semibold text-gray-700">
                        Tu equipo directo ({diagnostico.nombresEquipo.join(", ")})
                        aún no tiene solicitudes registradas.
                      </p>
                    </div>
                  ) : (
                    "No hay solicitudes registradas por parte de tu equipo directo."
                  )}
                </td>
              </tr>
            )}

            {!isLoading &&
              solicitudes.map((solicitud) => {
                const badge = obtenerConfigEstatus(solicitud.estatus);
                const pendiente = esEstatusPendiente(solicitud.estatus);
                const estaProcesandoFila = procesando?.id === solicitud.id;
                const aprobandoEsta =
                  estaProcesandoFila && procesando?.accion === "aprobar";
                const rechazandoEsta =
                  estaProcesandoFila && procesando?.accion === "rechazar";

                return (
                  <tr
                    key={solicitud.id}
                    className="group transition-colors hover:bg-gray-50/70"
                  >
                    {/* 1. Nombre del Colaborador (Sticky row header) */}
                    <th
                      scope="row"
                      className="sticky left-0 z-[1] bg-brand-surface px-6 py-4 text-left font-normal group-hover:bg-gray-50/90"
                    >
                      <p className="text-xs font-bold text-gray-900">
                        {solicitud.nombre_colaborador}
                      </p>
                      <p className="mt-0.5 text-[9px] uppercase tracking-widest text-gray-400">
                        {solicitud.puesto_colaborador}
                      </p>
                    </th>

                    {/* 2. Tipo de Solicitud */}
                    <td className="px-6 py-4">
                      <span className="rounded-sm border border-brand-gold/40 bg-brand-beige/40 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-brand-dark">
                        {solicitud.tipo_solicitud}
                      </span>
                    </td>

                    {/* 3. Fechas (Inicio y Fin) */}
                    <td className="whitespace-nowrap px-6 py-4 font-mono text-xs text-gray-700">
                      {solicitud.fecha_inicio} al {solicitud.fecha_fin}
                    </td>

                    {/* 4. Motivo */}
                    <td className="max-w-xs px-6 py-4 text-xs text-gray-600">
                      {solicitud.motivo || "Sin motivo especificado"}
                    </td>

                    {/* 5. Estatus Actual */}
                    <td className="whitespace-nowrap px-6 py-4">
                      <span
                        className={`inline-block rounded-sm border px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </td>

                    {/* 6. Acciones de Resolución */}
                    <td className="whitespace-nowrap px-6 py-4 text-right">
                      {pendiente ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={Boolean(procesando)}
                            onClick={() =>
                              handleResolverSolicitud(solicitud, "Aprobado")
                            }
                            className="rounded-sm bg-brand-dark px-3.5 py-1.5 text-[8px] font-bold uppercase tracking-widest text-brand-gold transition-colors hover:bg-brand-dark/90 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {aprobandoEsta ? "APROBANDO..." : "APROBAR"}
                          </button>

                          <button
                            type="button"
                            disabled={Boolean(procesando)}
                            onClick={() =>
                              handleResolverSolicitud(solicitud, "Rechazado")
                            }
                            className="rounded-sm border border-status-danger/30 bg-status-danger/10 px-3.5 py-1.5 text-[8px] font-bold uppercase tracking-widest text-status-danger-dark transition-colors hover:bg-status-danger/20 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {rechazandoEsta ? "RECHAZANDO..." : "RECHAZAR"}
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
  );
}
