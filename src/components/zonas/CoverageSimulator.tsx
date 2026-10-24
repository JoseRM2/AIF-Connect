"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { NavigationIcon } from "@/components/ui/icons";
import { evaluarUbicacion } from "@/lib/geo";
import type { EvaluacionZona } from "@/lib/geo";
import { colaboradoresDeZonas, zonaAGeocerca } from "@/lib/zonas";
import type { PuntoPrueba } from "@/lib/mock/zonas";
import type { Zona } from "@/types/zonas";

interface CoverageSimulatorProps {
  zonas: Zona[];
  puntosPrueba: PuntoPrueba[];
}

type Resultado =
  | { tipo: "error"; mensaje: string }
  | { tipo: "evaluacion"; evaluacion: EvaluacionZona };

const LABEL =
  "mb-1 block text-[9px] font-bold uppercase tracking-widest text-gray-400";
const FIELD =
  "h-10 w-full rounded border border-gray-200 bg-brand-beige/50 px-3 text-xs text-gray-800 focus:border-gray-400 focus:outline-none";

const CHIP_VARIANTES: Record<PuntoPrueba["variante"], string> = {
  home: "bg-stone-200 text-stone-800",
  sede: "bg-stone-100 text-stone-700",
  fuera: "border border-status-danger/30 bg-status-danger/10 text-status-danger-dark",
};

function parsearCoordenada(valor: string, min: number, max: number) {
  const numero = Number(valor.trim());
  return valor.trim() !== "" && Number.isFinite(numero) && numero >= min && numero <= max
    ? numero
    : null;
}

export default function CoverageSimulator({
  zonas,
  puntosPrueba,
}: CoverageSimulatorProps) {
  const colaboradores = colaboradoresDeZonas(zonas);
  const [colaboradorId, setColaboradorId] = useState(colaboradores[0]?.id ?? "");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const aplicarPunto = ({ punto }: PuntoPrueba) => {
    setLat(String(punto.lat));
    setLng(String(punto.lng));
    setResultado(null);
  };

  /**
   * Evalúa el punto contra las zonas activas aplicables al colaborador:
   * todas las sedes y sus propios home offices.
   */
  const handleVerificar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const latitud = parsearCoordenada(lat, -90, 90);
    const longitud = parsearCoordenada(lng, -180, 180);

    if (latitud === null || longitud === null) {
      setResultado({
        tipo: "error",
        mensaje:
          "Ingresa una latitud (-90 a 90) y una longitud (-180 a 180) válidas.",
      });
      return;
    }

    const aplicables = zonas
      .filter(
        (z) =>
          z.estatus === "activa" &&
          (z.tipo === "oficina" || z.colaborador?.id === colaboradorId),
      )
      .map(zonaAGeocerca);

    if (aplicables.length === 0) {
      setResultado({
        tipo: "error",
        mensaje: "No hay zonas activas aplicables para este colaborador.",
      });
      return;
    }

    setResultado({
      tipo: "evaluacion",
      evaluacion: evaluarUbicacion({ lat: latitud, lng: longitud }, aplicables),
    });
  };

  return (
    <form
      onSubmit={handleVerificar}
      className="flex flex-col gap-4 rounded-md bg-brand-surface p-6 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <NavigationIcon className="h-4 w-4 text-gray-800" />
          <h2 className="text-sm font-bold text-gray-900">
            Simulador de Verificación de Cobertura
          </h2>
        </div>
        <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">
          HERRAMIENTA DE DIAGNÓSTICO RH
        </span>
      </div>

      <p className="text-xs text-gray-500">
        Prueba hipotéticas coordenadas para comprobar si el sistema clasificaría
        como Dentro de Rango o Alerta Fuera de Rango.
      </p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
        <div className="md:col-span-4">
          <label htmlFor="sim-colaborador" className={LABEL}>
            COLABORADOR A EVALUAR
          </label>
          <select
            id="sim-colaborador"
            value={colaboradorId}
            onChange={(e) => {
              setColaboradorId(e.target.value);
              setResultado(null);
            }}
            className={FIELD}
          >
            {colaboradores.length === 0 && (
              <option value="">Sin colaboradores</option>
            )}
            {colaboradores.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-4">
          <label htmlFor="sim-lat" className={LABEL}>
            LATITUD SIMULADA
          </label>
          <input
            id="sim-lat"
            type="text"
            inputMode="decimal"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            placeholder="19.3621"
            className={`${FIELD} font-mono`}
          />
        </div>
        <div className="md:col-span-4">
          <label htmlFor="sim-lng" className={LABEL}>
            LONGITUD SIMULADA
          </label>
          <input
            id="sim-lng"
            type="text"
            inputMode="decimal"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            placeholder="-99.1804"
            className={`${FIELD} font-mono`}
          />
        </div>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">
          UBICACIONES DE PRUEBA:
        </span>
        {puntosPrueba.map((prueba) => (
          <button
            key={prueba.id}
            type="button"
            onClick={() => aplicarPunto(prueba)}
            className={`cursor-pointer rounded px-2.5 py-1 text-[10px] font-semibold transition-opacity hover:opacity-80 ${CHIP_VARIANTES[prueba.variante]}`}
          >
            {prueba.label}
          </button>
        ))}
      </div>

      <button
        type="submit"
        className="mt-2 h-11 w-full rounded-md bg-brand-dark text-xs font-bold uppercase tracking-widest text-white transition-colors hover:bg-brand-dark/90"
      >
        EJECUTAR VERIFICACIÓN DE COBERTURA
      </button>

      {resultado && <ResultadoBlock resultado={resultado} />}
    </form>
  );
}

function ResultadoBlock({ resultado }: { resultado: Resultado }) {
  if (resultado.tipo === "error") {
    return (
      <p role="alert" className="text-xs text-status-danger-dark">
        {resultado.mensaje}
      </p>
    );
  }

  const { zona, distancia_m, dentro } = resultado.evaluacion;
  const distancia = Math.round(distancia_m ?? 0);

  return (
    <div
      role="status"
      className={`rounded-md border p-3.5 ${
        dentro
          ? "border-status-success/40 bg-status-success/10"
          : "border-status-danger/40 bg-status-danger/10"
      }`}
    >
      <p
        className={`text-[10px] font-extrabold uppercase tracking-widest ${
          dentro ? "text-status-success-dark" : "text-status-danger-dark"
        }`}
      >
        {dentro ? "DENTRO DE RANGO" : "ALERTA: FUERA DE RANGO"}
      </p>
      {zona && (
        <p className="mt-1 text-xs text-gray-700">
          {dentro ? "Zona coincidente" : "Zona más cercana"}:{" "}
          <strong>{zona.nombre}</strong> — a {distancia} m (radio permitido:{" "}
          {zona.radio_m} m).
        </p>
      )}
    </div>
  );
}
