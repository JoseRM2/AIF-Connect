"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cancelarSolicitudAction } from "@/app/actions/solicitudes";
import { FileTextIcon, TrashIcon } from "@/components/ui/icons";
import {
  esSolicitudCancelada,
  esSolicitudMedioDia,
  extraerMotivoCancelacion,
  TIPO_SOLICITUD_LABELS,
} from "@/lib/solicitudes";
import type { EstatusSolicitud, Solicitud } from "@/types/solicitudes";

const COLUMNAS: { label: string; className: string }[] = [
  { label: "TIPO", className: "col-span-3" },
  { label: "PERÍODO", className: "col-span-3" },
  { label: "MOTIVO", className: "col-span-3" },
  { label: "ESTADO / ACCIONES", className: "col-span-3 text-right" },
];

/**
 * Determina si una solicitud se resuelve en Recursos Humanos (RH) o con el Jefe Directo.
 * - RH resuelve: "Incapacidad" y "Vacaciones pagadas".
 * - Jefe Directo resuelve: "Vacaciones", "Permiso con goce de sueldo", "Permiso sin goce de sueldo".
 */
function esResolucionPorRH(solicitud: Solicitud): boolean {
  if (
    solicitud.tipo === "incapacidad" ||
    solicitud.tipo === "vacaciones_pagadas"
  ) {
    return true;
  }
  const labelNorm = (solicitud.tipo_label ?? "").trim().toLowerCase();
  return (
    labelNorm.includes("incapacidad") || labelNorm.includes("vacaciones pagadas")
  );
}

function obtenerEstadoVisualDosFases(
  estatus: EstatusSolicitud,
  resuelveRH: boolean
): {
  label: string;
  chip: string;
  barras: [string, string];
  pasos: ["ENVIADA", "RH" | "JEFE"];
} {
  const segundoPaso: "RH" | "JEFE" = resuelveRH ? "RH" : "JEFE";
  const pasos: ["ENVIADA", "RH" | "JEFE"] = ["ENVIADA", segundoPaso];

  if (estatus === "Cancelado") {
    return {
      label: "Cancelada",
      chip: "border-gray-400 bg-gray-100 text-gray-700",
      barras: ["bg-gray-400", "bg-gray-200"],
      pasos,
    };
  }

  if (estatus === "Rechazado") {
    return {
      label: "Rechazado",
      chip: "border-status-danger bg-status-danger/10 text-status-danger-dark",
      barras: ["bg-status-danger", "bg-gray-200"],
      pasos,
    };
  }

  if (estatus === "Aprobado_Jefe" || estatus === "Completado") {
    return {
      label: resuelveRH ? "Aprobado (RH)" : "Aprobado (Jefe)",
      chip: "border-status-success bg-status-success/10 text-status-success-dark",
      barras: ["bg-status-success", "bg-status-success"],
      pasos,
    };
  }

  return {
    label: resuelveRH ? "Pendiente (RH)" : "Pendiente (Jefe)",
    chip: "border-status-warning bg-status-warning/10 text-status-warning-dark",
    barras: ["bg-status-warning", "bg-gray-200"],
    pasos,
  };
}

function EstadoCell({
  solicitud,
  onSolicitarCancelar,
}: {
  solicitud: Solicitud;
  onSolicitarCancelar: (sol: Solicitud) => void;
}) {
  const resuelveRH = esResolucionPorRH(solicitud);
  const cancelada = esSolicitudCancelada(solicitud.estatus, solicitud.motivo);
  const estatusEfectivo: EstatusSolicitud = cancelada
    ? "Cancelado"
    : solicitud.estatus;
  const { label, chip, barras, pasos } = obtenerEstadoVisualDosFases(
    estatusEfectivo,
    resuelveRH
  );
  const puedeCancelar = !cancelada && solicitud.estatus !== "Rechazado";

  return (
    <div role="cell" className="col-span-3 flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span
          className={`rounded border px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider ${chip}`}
        >
          {label}
        </span>

        {puedeCancelar && (
          <button
            type="button"
            onClick={() => onSolicitarCancelar(solicitud)}
            className="inline-flex items-center gap-1 rounded border border-status-danger/35 bg-brand-surface px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-status-danger transition-colors hover:bg-status-danger/10"
          >
            <TrashIcon className="h-2.5 w-2.5" />
            CANCELAR
          </button>
        )}
      </div>

      <div className="w-28">
        <div className="flex items-center gap-1" aria-hidden="true">
          {barras.map((color, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full ${color}`} />
          ))}
        </div>
        <div
          className="mt-1 flex justify-between text-[7px] font-bold uppercase tracking-tight text-gray-700"
          aria-hidden="true"
        >
          {pasos.map((paso) => (
            <span key={paso}>{paso}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function RequestList({
  solicitudes,
}: {
  solicitudes: Solicitud[];
}) {
  const router = useRouter();
  const [listaLocal, setListaLocal] = useState<Solicitud[]>(solicitudes);
  const [solicitudACancelar, setSolicitudACancelar] =
    useState<Solicitud | null>(null);
  const [motivoCancelacion, setMotivoCancelacion] = useState<string>("");
  const [cancelandoId, setCancelandoId] = useState<string | null>(null);
  const [errorCancelar, setErrorCancelar] = useState<string | null>(null);

  useEffect(() => {
    setListaLocal(solicitudes);
  }, [solicitudes]);

  const handleConfirmarCancelacion = async () => {
    if (!solicitudACancelar || cancelandoId) return;
    const motivoLimpio = motivoCancelacion.trim();
    if (motivoLimpio.length < 3) {
      setErrorCancelar(
        "Por favor ingresa el motivo de cancelación (mínimo 3 caracteres)."
      );
      return;
    }

    const idTarget = solicitudACancelar.id;
    setCancelandoId(idTarget);
    setErrorCancelar(null);

    try {
      const res = await cancelarSolicitudAction(idTarget, motivoLimpio);
      if (!res.ok) {
        setErrorCancelar(res.error || "No se pudo cancelar la solicitud.");
        return;
      }

      setListaLocal((prev) =>
        prev.map((item) =>
          item.id === idTarget
            ? {
                ...item,
                estatus: "Cancelado",
                motivo: res.motivoActualizado ?? item.motivo,
              }
            : item
        )
      );
      setSolicitudACancelar(null);
      setMotivoCancelacion("");
      router.refresh();
    } finally {
      setCancelandoId(null);
    }
  };

  return (
    <>
      <section className="overflow-hidden rounded-md bg-brand-surface shadow-sm">
        {errorCancelar && (
          <div
            role="alert"
            className="mx-6 mt-4 rounded-sm border border-status-danger/30 bg-status-danger/10 px-4 py-2.5 text-xs font-semibold text-status-danger-dark"
          >
            {errorCancelar}
          </div>
        )}

        <div className="overflow-x-auto">
          <div
            role="table"
            aria-label="Historial de solicitudes"
            className="min-w-[640px]"
          >
            <div role="rowgroup">
              <div
                role="row"
                className="grid grid-cols-12 items-center border-b border-gray-100 px-6 py-3.5"
              >
                {COLUMNAS.map(({ label, className }) => (
                  <div
                    key={label}
                    role="columnheader"
                    className={`${className} text-[10px] font-bold uppercase tracking-widest text-gray-400`}
                  >
                    {label}
                  </div>
                ))}
              </div>
            </div>

            <div role="rowgroup">
              {listaLocal.length === 0 && (
                <p className="px-6 py-8 text-center text-xs text-gray-400">
                  Aún no tienes solicitudes registradas.
                </p>
              )}
              {listaLocal.map((s) => {
                const medioDia = esSolicitudMedioDia(s.motivo);
                return (
                  <div
                    key={s.id}
                    role="row"
                    className="grid grid-cols-12 items-center border-b border-gray-100 px-6 py-4 hover:bg-gray-50/50"
                  >
                    <div
                      role="cell"
                      className="col-span-3 flex items-center gap-2.5"
                    >
                      <FileTextIcon className="h-4 w-4 shrink-0 text-brand-gold" />
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-gray-900">
                          {s.tipo_label || TIPO_SOLICITUD_LABELS[s.tipo]}
                        </span>
                        {medioDia && (
                          <span className="mt-0.5 inline-block w-fit rounded-sm bg-brand-beige px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider text-brand-dark">
                            MEDIO DÍA (0.5 DÍAS)
                          </span>
                        )}
                      </div>
                    </div>
                    <div
                      role="cell"
                      className="col-span-3 font-mono text-xs text-gray-600"
                    >
                      {s.fecha_inicio === s.fecha_fin
                        ? s.fecha_inicio
                        : `${s.fecha_inicio} al ${s.fecha_fin}`}
                    </div>
                    <div
                      role="cell"
                      className="col-span-3 text-xs text-gray-600"
                    >
                      {(() => {
                        const { motivoOriginal, motivoCancelacion: motCancel } =
                          extraerMotivoCancelacion(s.motivo);
                        return (
                          <div className="flex flex-col gap-1">
                            <span>{motivoOriginal || "-"}</span>
                            {motCancel && (
                              <span className="rounded-sm border border-gray-200 bg-gray-50 px-2 py-1 text-[10px] text-gray-700">
                                <strong className="font-bold text-gray-900">
                                  Motivo de cancelación:
                                </strong>{" "}
                                {motCancel}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                    <EstadoCell
                      solicitud={s}
                      onSolicitarCancelar={(sol) => {
                        setErrorCancelar(null);
                        setMotivoCancelacion("");
                        setSolicitudACancelar(sol);
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {solicitudACancelar && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar cancelación de solicitud"
          onClick={() => !cancelandoId && setSolicitudACancelar(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-md flex-col overflow-hidden rounded-sm bg-brand-surface shadow-2xl"
          >
            <header className="border-b border-gray-100 bg-brand-dark px-6 py-4 text-white">
              <span className="text-[9px] font-bold uppercase tracking-widest text-brand-gold">
                CONFIRMAR CANCELACIÓN
              </span>
              <h3 className="mt-1 font-serif text-base font-bold text-white">
                ¿Cancelar solicitud de{" "}
                {solicitudACancelar.tipo_label ||
                  TIPO_SOLICITUD_LABELS[solicitudACancelar.tipo]}
                ?
              </h3>
            </header>

            <div className="flex flex-col gap-3 p-6 text-xs text-gray-700">
              <p>
                Estás por cancelar la siguiente solicitud:
              </p>
              <div className="rounded-sm border border-gray-200 bg-brand-beige/30 p-3">
                <p className="font-bold text-gray-900">
                  {solicitudACancelar.tipo_label ||
                    TIPO_SOLICITUD_LABELS[solicitudACancelar.tipo]}
                </p>
                <p className="mt-1 font-mono text-[11px] text-gray-600">
                  {solicitudACancelar.fecha_inicio ===
                  solicitudACancelar.fecha_fin
                    ? solicitudACancelar.fecha_inicio
                    : `${solicitudACancelar.fecha_inicio} al ${solicitudACancelar.fecha_fin}`}
                </p>
              </div>
              <div>
                <label
                  htmlFor="motivo-cancelacion-solicitud"
                  className="mb-1.5 block text-[9px] font-bold uppercase tracking-widest text-gray-600"
                >
                  MOTIVO DE CANCELACIÓN * (VISIBLE PARA JEFATURA Y RH)
                </label>
                <textarea
                  id="motivo-cancelacion-solicitud"
                  rows={3}
                  required
                  maxLength={500}
                  value={motivoCancelacion}
                  onChange={(e) => {
                    setMotivoCancelacion(e.target.value);
                    if (errorCancelar) setErrorCancelar(null);
                  }}
                  placeholder="Explica brevemente por qué cancelas esta solicitud..."
                  className="w-full resize-y rounded-sm border border-gray-300 bg-brand-surface p-2.5 text-xs text-gray-900 outline-none focus:border-brand-dark"
                />
              </div>

              {errorCancelar && (
                <p
                  role="alert"
                  className="text-[11px] font-bold text-status-danger-dark"
                >
                  {errorCancelar}
                </p>
              )}

              <p className="text-[11px] text-gray-500">
                La solicitud quedará marcada como <strong>Cancelada</strong> para tu Jefatura y RH (ya no podrá ser aprobada).
              </p>
            </div>

            <footer className="flex items-center justify-end gap-2.5 border-t border-gray-100 bg-brand-beige/20 px-6 py-3.5">
              <button
                type="button"
                disabled={Boolean(cancelandoId)}
                onClick={() => setSolicitudACancelar(null)}
                className="rounded-sm border border-gray-300 bg-brand-surface px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50"
              >
                VOLVER
              </button>
              <button
                type="button"
                disabled={Boolean(cancelandoId)}
                onClick={handleConfirmarCancelacion}
                className="rounded-sm bg-status-danger px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-status-danger/90 disabled:opacity-50"
              >
                {cancelandoId ? "CANCELANDO…" : "SÍ, CANCELAR SOLICITUD"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
