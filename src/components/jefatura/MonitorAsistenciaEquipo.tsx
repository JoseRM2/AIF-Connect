"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  obtenerAsistenciasEquipoAction,
  type AsistenciaEquipoServerItem,
} from "@/app/actions/jefatura";
import {
  AlertTriangleIcon,
  SearchIcon,
} from "@/components/ui/icons";
import { evaluarIndicadoresVisualesAsistencia } from "@/lib/asistencia";

interface CoordenadasGps {
  lat: number;
  lng: number;
}

function extraerCoordenadas(ubicacion: unknown): CoordenadasGps | null {
  if (!ubicacion || typeof ubicacion !== "object") return null;
  const obj = ubicacion as Record<string, unknown>;
  const lat =
    typeof obj.lat === "number"
      ? obj.lat
      : typeof obj.latitud === "number"
      ? obj.latitud
      : null;
  const lng =
    typeof obj.lng === "number"
      ? obj.lng
      : typeof obj.longitud === "number"
      ? obj.longitud
      : null;
  if (lat === null || lng === null || Number.isNaN(lat) || Number.isNaN(lng)) {
    return null;
  }
  return { lat, lng };
}

function formatearHora(hora: string | null | undefined): string {
  if (!hora) return "-";
  const limpia = hora.trim();
  if (limpia.length >= 5) return limpia.slice(0, 5);
  return limpia;
}

function obtenerChipEstatus(estatus: string | null | undefined): {
  label: string;
  className: string;
} {
  const est = (estatus ?? "").trim().toLowerCase();
  if (est.includes("retardo")) {
    return {
      label: estatus || "Retardo",
      className:
        "border-status-warning/40 bg-status-warning/10 text-status-warning-dark",
    };
  }
  if (est.includes("falta")) {
    return {
      label: estatus || "Falta",
      className:
        "border-status-danger/40 bg-status-danger/10 text-status-danger-dark",
    };
  }
  if (est.includes("justificad")) {
    return {
      label: estatus || "Justificado",
      className:
        "border-status-info/40 bg-status-info/10 text-status-info-dark",
    };
  }
  return {
    label: estatus || "A Tiempo",
    className:
      "border-status-success/40 bg-status-success/10 text-status-success-dark",
  };
}

export default function MonitorAsistenciaEquipo() {
  const [asistencias, setAsistencias] = useState<AsistenciaEquipoServerItem[]>(
    []
  );
  const [totalEquipo, setTotalEquipo] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");

  const cargarDatos = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    const res = await obtenerAsistenciasEquipoAction();
    if (!res.ok) {
      setErrorMsg(res.error);
      setAsistencias([]);
      setTotalEquipo(0);
    } else {
      setAsistencias(res.asistencias);
      setTotalEquipo(res.totalEquipo);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void cargarDatos();
  }, [cargarDatos]);

  const asistenciasFiltradas = useMemo(() => {
    const termino = searchTerm.trim().toLowerCase();
    if (!termino) return asistencias;
    return asistencias.filter(
      (a) =>
        a.nombre_colaborador.toLowerCase().includes(termino) ||
        a.puesto_colaborador.toLowerCase().includes(termino) ||
        a.fecha.includes(termino)
    );
  }, [asistencias, searchTerm]);

  const metricas = useMemo(() => {
    let aTiempo = 0;
    let retardos = 0;
    const retardosPorColaborador = new Map<string, number>();

    for (const a of asistenciasFiltradas) {
      const est = (a.estatus || "").toLowerCase();
      if (est.includes("retardo")) {
        retardos += 1;
        const clave = a.colaborador_id || a.nombre_colaborador;
        retardosPorColaborador.set(
          clave,
          (retardosPorColaborador.get(clave) ?? 0) + 1
        );
      } else if (est.includes("tiempo") || est.includes("justificad")) {
        aTiempo += 1;
      }
    }

    let faltasPorRetardos = 0;
    for (const count of Array.from(retardosPorColaborador.values())) {
      faltasPorRetardos += Math.floor(count / 3);
    }

    return {
      total: asistenciasFiltradas.length,
      aTiempo,
      retardos,
      faltasPorRetardos,
      retardosPorColaborador,
    };
  }, [asistenciasFiltradas]);

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs del Equipo Directo */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-center justify-between rounded-sm border border-gray-100 bg-brand-surface p-5 shadow-sm">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">
              REGISTROS DE TU EQUIPO
            </p>
            <p className="mt-1 font-mono text-2xl font-black text-gray-900">
              {metricas.total}
            </p>
            <p className="mt-1.5 text-[9px] font-medium text-gray-400">
              {totalEquipo}{" "}
              {totalEquipo === 1
                ? "subordinado directo"
                : "subordinados directos"}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-sm border border-gray-100 bg-brand-surface p-5 shadow-sm">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">
              ASISTENCIAS A TIEMPO
            </p>
            <p className="mt-1 font-mono text-2xl font-black text-status-success-dark">
              {metricas.aTiempo}
            </p>
            <p className="mt-1.5 text-[9px] font-medium text-gray-400">
              Puntuales o justificadas
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-sm border border-gray-100 bg-brand-surface p-5 shadow-sm">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">
              RETARDOS REGISTRADOS
            </p>
            <p className="mt-1 font-mono text-2xl font-black text-gray-900">
              {metricas.retardos}
            </p>
            <p className="mt-1.5 text-[9px] font-bold text-status-warning">
              Tolerancia &gt; 15 min
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-sm border border-gray-100 bg-brand-surface p-5 shadow-sm">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">
              FALTAS POR RETARDOS
            </p>
            <p className="mt-1 font-mono text-2xl font-black text-status-danger-dark">
              {metricas.faltasPorRetardos}
            </p>
            <p className="mt-1.5 text-[9px] font-medium text-gray-400">
              3 retardos por colaborador = 1 falta
            </p>
          </div>
        </div>
      </div>

      {/* Tabla de Asistencia del Equipo Directo */}
      <section className="overflow-hidden rounded-sm border border-gray-100 bg-brand-surface shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="font-serif text-base font-bold text-gray-900">
              Monitor de Asistencia de tu Equipo Directo
            </h2>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
              ENTRADAS, DESCANSOS, SALIDAS Y RETARDOS DE TUS SUBORDINADOS
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar colaborador o fecha..."
                className="h-9 w-60 rounded-sm border border-gray-200 bg-brand-beige/30 pl-9 pr-3 text-xs font-medium text-gray-800 placeholder-gray-400 focus:border-brand-dark focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={cargarDatos}
              disabled={isLoading}
              className="rounded-sm border border-gray-200 bg-brand-surface px-3.5 py-2 text-[9px] font-bold uppercase tracking-widest text-gray-700 transition-colors hover:bg-brand-beige/50 disabled:opacity-50"
            >
              {isLoading ? "CARGANDO…" : "ACTUALIZAR"}
            </button>
          </div>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="mx-6 my-4 rounded-sm border border-status-danger/30 bg-status-danger/10 px-4 py-3 text-xs font-semibold text-status-danger-dark"
          >
            {errorMsg}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-100 bg-brand-beige/25 text-[9px] font-bold uppercase tracking-widest text-gray-400">
                <th className="px-6 py-3">COLABORADOR</th>
                <th className="px-6 py-3">FECHA</th>
                <th className="px-6 py-3">ENTRADA</th>
                <th className="px-6 py-3">DESCANSO</th>
                <th className="px-6 py-3">SALIDA</th>
                <th className="px-6 py-3">UBICACIÓN</th>
                <th className="px-6 py-3 text-right">ESTATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-10 text-center text-xs text-gray-400"
                  >
                    Cargando asistencias de tu equipo...
                  </td>
                </tr>
              ) : asistenciasFiltradas.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-10 text-center text-xs text-gray-400"
                  >
                    {totalEquipo === 0
                      ? "No tienes colaboradores asignados directamente a tu cargo."
                      : "No hay registros de asistencia para mostrar con el filtro actual."}
                  </td>
                </tr>
              ) : (
                asistenciasFiltradas.map((asistencia) => {
                  const chip = obtenerChipEstatus(asistencia.estatus);
                  const indicadores = evaluarIndicadoresVisualesAsistencia({
                    hora_entrada: asistencia.hora_entrada,
                    hora_inicio_descanso: asistencia.hora_inicio_descanso,
                    hora_fin_descanso: asistencia.hora_fin_descanso,
                    hora_salida: asistencia.hora_salida,
                    estatus: asistencia.estatus,
                  });
                  const claveColab =
                    asistencia.colaborador_id || asistencia.nombre_colaborador;
                  const retardosDelColab =
                    metricas.retardosPorColaborador.get(claveColab) ?? 0;
                  const faltasDelColab = Math.floor(retardosDelColab / 3);
                  const coordsEntrada = extraerCoordenadas(
                    asistencia.ubicacion_entrada
                  );

                  return (
                    <tr
                      key={asistencia.id}
                      className={`transition-colors ${
                        indicadores.descansoExcedido
                          ? "bg-status-danger/5 hover:bg-status-danger/10"
                          : "hover:bg-gray-50/50"
                      }`}
                    >
                      <td className="px-6 py-4">
                        <p className="text-xs font-bold text-gray-900">
                          {asistencia.nombre_colaborador}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {asistencia.puesto_colaborador}
                        </p>
                        {faltasDelColab > 0 && (
                          <span className="mt-1 inline-flex items-center gap-1 rounded-sm border border-status-danger/40 bg-status-danger/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-status-danger-dark">
                            {faltasDelColab}{" "}
                            {faltasDelColab === 1 ? "FALTA" : "FALTAS"} POR
                            RETARDOS ({retardosDelColab} RET.)
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-gray-700">
                        {asistencia.fecha}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-gray-600">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span>{formatearHora(asistencia.hora_entrada)}</span>
                          {indicadores.esRetardo && (
                            <span className="inline-flex items-center gap-0.5 rounded-sm border border-status-warning/40 bg-status-warning/10 px-1.5 py-0.5 font-sans text-[8px] font-bold uppercase tracking-wider text-status-warning-dark">
                              <AlertTriangleIcon className="h-2.5 w-2.5" />
                              RETARDO
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-gray-600">
                        {asistencia.hora_inicio_descanso ? (
                          <div className="flex flex-col gap-0.5">
                            <span>
                              {formatearHora(asistencia.hora_inicio_descanso)}
                              {" - "}
                              {asistencia.hora_fin_descanso
                                ? formatearHora(asistencia.hora_fin_descanso)
                                : "En curso"}
                            </span>
                            {indicadores.minutosDescanso !== null && (
                              <span
                                className={`font-sans text-[9px] font-bold ${
                                  indicadores.descansoExcedido
                                    ? "text-status-danger-dark"
                                    : "text-gray-400"
                                }`}
                              >
                                {indicadores.minutosDescanso} min
                                {indicadores.descansoExcedido
                                  ? " · EXCEDIDO (>60M)"
                                  : ""}
                              </span>
                            )}
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-gray-600">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span>{formatearHora(asistencia.hora_salida)}</span>
                          {indicadores.esSalidaTardia && (
                            <span className="inline-flex items-center gap-0.5 rounded-sm border border-brand-gold/60 bg-brand-beige/70 px-1.5 py-0.5 font-sans text-[8px] font-bold uppercase tracking-wider text-brand-dark">
                              TIEMPO ADICIONAL
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono text-[10px] text-gray-500">
                        {coordsEntrada ? (
                          <a
                            href={`https://www.google.com/maps?q=${coordsEntrada.lat},${coordsEntrada.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-sans text-[10px] font-bold text-brand-dark underline decoration-brand-gold/70 underline-offset-2 hover:text-brand-gold"
                          >
                            Ver GPS
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span
                          className={`inline-block rounded-sm border px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest ${chip.className}`}
                        >
                          {chip.label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
