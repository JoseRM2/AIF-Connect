"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, MouseEvent as ReactMouseEvent } from "react";
import dynamic from "next/dynamic";
import { SUGERENCIAS_UBICACION } from "@/lib/mock/zonas";
import type { GeoPoint } from "@/types/asistencia";
import type {
  ColaboradorAsignado,
  EmpresaZona,
  TipoZona,
  Zona,
} from "@/types/zonas";

// IMPORTANTE: Leaflet requiere `window`; se importa dinámicamente con ssr: false
const MapaGeocerca = dynamic(
  () => import("@/components/zonas/MapaGeocerca"),
  {
    ssr: false,
    loading: () => (
      <div className="h-72 w-full animate-pulse rounded-sm border border-gray-200 bg-gray-100" />
    ),
  }
);

interface ZoneFormModalProps {
  colaboradores: ColaboradorAsignado[];
  /** Si se proporciona, el modal opera en modo edición sobre esta zona. */
  zonaEditar?: Zona | null;
  /** Se invoca con la zona lista para persistir en Supabase (`colaboradores.zonas_geocerca`). */
  onGuardar: (zona: Zona) => Promise<void> | void;
  /** Se invoca cuando el diálogo se cierra por cualquier vía. */
  onCerrar: () => void;
}

const RADIO_DEFAULT = 100;
const PUNTO_INICIAL: GeoPoint = { lat: 23.6345, lng: -102.5528 };

function obtenerPuntoSeguro(zona: Zona | null | undefined): GeoPoint {
  if (!zona) return PUNTO_INICIAL;
  const raw = zona as unknown as Record<string, unknown>;
  const latNum = Number.parseFloat(String(zona.lat ?? raw.latitud ?? ""));
  const lngNum = Number.parseFloat(String(zona.lng ?? raw.longitud ?? ""));
  const esValido =
    !Number.isNaN(latNum) &&
    !Number.isNaN(lngNum) &&
    Number.isFinite(latNum) &&
    Number.isFinite(lngNum) &&
    latNum !== 0 &&
    lngNum !== 0;

  return esValido
    ? { lat: latNum, lng: lngNum }
    : PUNTO_INICIAL;
}

function obtenerRadioSeguro(zona: Zona | null | undefined): number {
  if (!zona) return RADIO_DEFAULT;
  const raw = zona as unknown as Record<string, unknown>;
  const radioNum = Number.parseFloat(
    String(zona.radio_m ?? raw.radio_metros ?? "")
  );
  return !Number.isNaN(radioNum) && Number.isFinite(radioNum) && radioNum > 0
    ? Math.round(radioNum)
    : RADIO_DEFAULT;
}

const TIPOS: { value: TipoZona; label: string }[] = [
  { value: "home_office", label: "Home Office / Punto de Trabajo (Colaborador)" },
  { value: "oficina", label: "Sede Corporativa (Oficina)" },
];

const EMPRESAS: EmpresaZona[] = ["AIF", "ROYAL"];

const LABEL =
  "mb-1.5 block text-[9px] font-bold uppercase tracking-widest text-gray-500";
const FIELD =
  "w-full rounded-sm border border-gray-200 bg-brand-beige/50 px-3 text-xs text-gray-800 focus:border-brand-dark focus:outline-none";

export default function ZoneFormModal({
  colaboradores,
  zonaEditar = null,
  onGuardar,
  onCerrar,
}: ZoneFormModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const mouseDownEnFondoRef = useRef(false);

  const [dialogListo, setDialogListo] = useState<boolean>(false);
  const [tipo, setTipo] = useState<TipoZona>(
    zonaEditar?.tipo ?? "home_office"
  );
  const [colaboradorId, setColaboradorId] = useState<string>(
    zonaEditar?.colaborador?.id ?? ""
  );
  const [empresa, setEmpresa] = useState<EmpresaZona>(
    zonaEditar?.empresa ?? "AIF"
  );
  const [titulo, setTitulo] = useState<string>(zonaEditar?.titulo ?? "");
  const [direccion, setDireccion] = useState<string>(
    zonaEditar?.direccion ?? ""
  );
  const [radioMetros, setRadioMetros] = useState<number>(() =>
    obtenerRadioSeguro(zonaEditar)
  );
  const [punto, setPunto] = useState<GeoPoint>(() =>
    obtenerPuntoSeguro(zonaEditar)
  );
  const [notas, setNotas] = useState<string>(zonaEditar?.notas ?? "");
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);

  const esHome = tipo === "home_office";

  // Apertura modal nativa (foco atrapado, fondo inerte y Esc incluidos).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    setDialogListo(true);
    dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, []);

  const cerrar = () => dialogRef.current?.close();

  const handleMouseDown = (e: ReactMouseEvent<HTMLDialogElement>) => {
    mouseDownEnFondoRef.current = e.target === e.currentTarget;
  };

  const handleClick = (e: ReactMouseEvent<HTMLDialogElement>) => {
    if ("closedBy" in HTMLDialogElement.prototype) return;
    if (e.target !== e.currentTarget || !mouseDownEnFondoRef.current) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const dentro =
      rect.top <= e.clientY &&
      e.clientY <= rect.top + rect.height &&
      rect.left <= e.clientX &&
      e.clientX <= rect.left + rect.width;
    if (!dentro) cerrar();
  };

  const handleTipoChange = (nuevo: TipoZona) => {
    setTipo(nuevo);
    if (nuevo !== "home_office") setColaboradorId("");
  };

  const handleSugerencia = (id: string) => {
    const sugerencia = SUGERENCIAS_UBICACION.find((s) => s.id === id);
    if (!sugerencia) return;
    setDireccion(sugerencia.direccion);
    setPunto(sugerencia.punto);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSaving) return;

    if (!titulo.trim()) {
      setErrorGuardar("Ingresa un nombre identificador para la zona autorizada.");
      return;
    }

    if (esHome && !colaboradorId) {
      setErrorGuardar("Selecciona el colaborador al que se asignará esta zona.");
      return;
    }

    setIsSaving(true);
    setErrorGuardar(null);

    try {
      const colaborador = colaboradorId
        ? (colaboradores.find((c) => c.id === colaboradorId) ?? null)
        : null;

      const direccionFinal =
        direccion.trim() ||
        `Coordenadas (${punto.lat.toFixed(5)}, ${punto.lng.toFixed(5)})`;

      await onGuardar({
        id: zonaEditar?.id ?? `zona-${crypto.randomUUID()}`,
        titulo: titulo.trim(),
        direccion: direccionFinal,
        lat: punto.lat,
        lng: punto.lng,
        radio_m: radioMetros,
        tipo,
        estatus: zonaEditar?.estatus ?? "activa",
        empresa,
        colaborador,
        notas: notas.trim() || null,
      });
      cerrar();
    } catch (err) {
      setErrorGuardar(
        err instanceof Error
          ? err.message
          : "No fue posible guardar la geocerca en la base de datos."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="zona-modal-titulo"
      onClose={onCerrar}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      {...{ closedby: "any" }}
      className="max-h-[92vh] w-[calc(100%-2rem)] max-w-3xl flex-col overflow-hidden rounded-md border-0 bg-brand-surface p-0 text-gray-900 shadow-2xl open:flex backdrop:bg-black/50 backdrop:backdrop-blur-sm"
    >
      {/* Header fijo */}
      <header className="flex shrink-0 items-start justify-between border-b border-gray-200 bg-brand-beige/50 px-6 py-4">
        <div className="flex flex-col gap-1">
          <p className="text-[9px] font-bold uppercase tracking-widest text-brand-gold">
            {zonaEditar
              ? "EDICIÓN DE GEOCERCA AUTORIZADA"
              : "CONFIGURACIÓN DE NUEVA GEOCERCA"}
          </p>
          <h2
            id="zona-modal-titulo"
            className="font-serif text-xl font-black text-gray-900"
          >
            {zonaEditar
              ? `Editar: ${zonaEditar.titulo}`
              : "Definir Localización Autorizada"}
          </h2>
        </div>
        <button
          type="button"
          onClick={cerrar}
          className="rounded-sm border border-gray-200 bg-brand-surface px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-gray-500 transition-colors hover:text-gray-900"
        >
          CERRAR
        </button>
      </header>

      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        {/* Cuerpo con scroll */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
          {errorGuardar && (
            <div
              role="alert"
              aria-live="polite"
              className="rounded-sm border border-status-danger/30 bg-status-danger/10 px-4 py-2.5 text-xs font-semibold text-status-danger-dark"
            >
              {errorGuardar}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="zona-tipo" className={LABEL}>
                TIPO DE UBICACIÓN
              </label>
              <select
                id="zona-tipo"
                data-autofocus
                value={tipo}
                onChange={(e) => handleTipoChange(e.target.value as TipoZona)}
                className={`${FIELD} h-9`}
              >
                {TIPOS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="zona-colaborador" className={LABEL}>
                {esHome
                  ? "COLABORADOR ASIGNADO"
                  : "ASIGNACIÓN (SEDE CORPORATIVA)"}
              </label>
              <select
                id="zona-colaborador"
                value={colaboradorId}
                onChange={(e) => setColaboradorId(e.target.value)}
                required={esHome}
                className={`${FIELD} h-9`}
              >
                <option value="" disabled={esHome}>
                  {esHome
                    ? "Selecciona un colaborador"
                    : "Todos los colaboradores de la empresa"}
                </option>
                {colaboradores.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} ({c.puesto})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="zona-empresa" className={LABEL}>
                EMPRESA
              </label>
              <select
                id="zona-empresa"
                value={empresa}
                onChange={(e) => setEmpresa(e.target.value as EmpresaZona)}
                className={`${FIELD} h-9`}
              >
                {EMPRESAS.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="zona-titulo" className={LABEL}>
              NOMBRE IDENTIFICADOR DE LA ZONA
            </label>
            <input
              id="zona-titulo"
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej. Oficina Corporativa AIF / Home Office - Jose Real"
              required
              className={`${FIELD} h-10`}
            />
          </div>

          {/* Sugerencias rápidas + Mapa Interactivo con Buscador Nominatim, Pin y Radio */}
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[8px] font-bold uppercase tracking-widest text-gray-400">
                SUGERENCIAS RÁPIDAS:
              </span>
              {SUGERENCIAS_UBICACION.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleSugerencia(id)}
                  className="cursor-pointer rounded-sm border border-gray-200 bg-gray-50 px-2 py-0.5 text-[9px] font-medium text-gray-600 transition-colors hover:bg-gray-100"
                >
                  {label}
                </button>
              ))}
            </div>

            {dialogListo ? (
              <MapaGeocerca
                latitud={punto.lat}
                longitud={punto.lng}
                radioMetros={radioMetros}
                direccion={direccion}
                editable={true}
                mostrarBuscador={true}
                mostrarControlRadio={true}
                heightClass="h-64"
                onCoordenadasChange={(lat, lng) => setPunto({ lat, lng })}
                onRadioChange={(nuevoRadio) => setRadioMetros(nuevoRadio)}
                onDireccionChange={(nuevaDir) => setDireccion(nuevaDir)}
              />
            ) : (
              <div className="h-64 w-full animate-pulse rounded-sm border border-gray-200 bg-gray-100" />
            )}
          </div>

          <div>
            <label htmlFor="zona-notas" className={LABEL}>
              NOTAS / OBSERVACIONES DE RH
            </label>
            <textarea
              id="zona-notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Ubicación geocercada autorizada para teletrabajo o asistencia presencial."
              className={`${FIELD} h-12 resize-y p-2.5 placeholder-gray-400`}
            />
          </div>
        </div>

        {/* Footer fijo */}
        <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-gray-200 bg-brand-surface px-6 py-4">
          <button
            type="button"
            onClick={cerrar}
            disabled={isSaving}
            className="rounded-sm border border-gray-300 bg-brand-surface px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            CANCELAR
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="min-w-[200px] rounded-sm bg-brand-dark px-8 py-3 text-[10px] font-bold uppercase tracking-widest text-brand-gold transition-colors hover:bg-brand-dark/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving
              ? "GUARDANDO ZONA..."
              : zonaEditar
              ? "ACTUALIZAR ZONA"
              : "GUARDAR ZONA"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
