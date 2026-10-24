"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Circle,
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { MapPinIcon, SearchIcon, SlidersIcon } from "@/components/ui/icons";

/**
 * Corrección del problema clásico de los íconos por defecto de Leaflet en React / Webpack.
 */
const DefaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;
L.Icon.Default.mergeOptions({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export interface NominatimSearchResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

export interface DatosGeocerca {
  nombre?: string;
  direccion: string;
  latitud: number;
  longitud: number;
  radio_metros: number;
}

export interface MapaGeocercaProps {
  /** Latitud actual de la geocerca (acepta number, string o null/undefined de BD). */
  latitud?: number | string | null;
  /** Longitud actual de la geocerca (acepta number, string o null/undefined de BD). */
  longitud?: number | string | null;
  /** Radio permitido en metros (por defecto 100m). */
  radioMetros?: number | string | null;
  /** Dirección inicial o controlada para el buscador Nominatim. */
  direccion?: string;
  /** Si es false, oculta los controles de edición/búsqueda (modo solo lectura). */
  editable?: boolean;
  /** Si es false, oculta el buscador de dirección integrado. */
  mostrarBuscador?: boolean;
  /** Si es false, oculta el control slider de radio integrado. */
  mostrarControlRadio?: boolean;
  /** Clase de altura para el contenedor del mapa (por defecto `h-72`). */
  heightClass?: string;
  /** Se dispara cuando cambian las coordenadas (por búsqueda Nominatim, dragend del Pin o clic). */
  onCoordenadasChange?: (latitud: number, longitud: number) => void;
  /** Se dispara cuando cambia el radio en metros. */
  onRadioChange?: (radioMetros: number) => void;
  /** Se dispara cuando cambia la dirección en el buscador. */
  onDireccionChange?: (direccion: string) => void;
}

const FALLBACK_LAT = 23.6345;
const FALLBACK_LNG = -102.5528;

const RADIO_MIN = 20;
const RADIO_MAX = 1000;
const RADIO_DEFAULT = 100;
const ZOOM_DEFAULT = 16;

/**
 * Parsea y valida estrictamente cualquier par de coordenadas a números flotantes seguros
 * para evitar errores `Invalid LatLng object: (NaN, NaN)` en Leaflet.
 */
function sanitizarCoordenadas(
  latInput: unknown,
  lngInput: unknown,
  fallbackLat = FALLBACK_LAT,
  fallbackLng = FALLBACK_LNG
): { safeLat: number; safeLng: number; isLocationValid: boolean } {
  const latNum = Number.parseFloat(String(latInput ?? ""));
  const lngNum = Number.parseFloat(String(lngInput ?? ""));
  const isLocationValid =
    !Number.isNaN(latNum) &&
    !Number.isNaN(lngNum) &&
    Number.isFinite(latNum) &&
    Number.isFinite(lngNum) &&
    latNum !== 0 &&
    lngNum !== 0 &&
    latNum >= -90 &&
    latNum <= 90 &&
    lngNum >= -180 &&
    lngNum <= 180;

  return {
    safeLat: isLocationValid ? latNum : fallbackLat,
    safeLng: isLocationValid ? lngNum : fallbackLng,
    isLocationValid,
  };
}

function sanitizarRadio(radioInput: unknown): number {
  const radioNum = Number.parseFloat(String(radioInput ?? ""));
  if (Number.isNaN(radioNum) || !Number.isFinite(radioNum) || radioNum <= 0) {
    return RADIO_DEFAULT;
  }
  return Math.min(RADIO_MAX, Math.max(RADIO_MIN, Math.round(radioNum)));
}

/**
 * Subcomponente interno de React-Leaflet para recentrar el mapa cuando cambian
 * las coordenadas desde el buscador Nominatim o desde las props externas.
 */
function ControladorVistaMapa({
  latitud,
  longitud,
  editable,
  onSelectPoint,
}: {
  latitud: number;
  longitud: number;
  editable: boolean;
  onSelectPoint: (lat: number, lng: number) => void;
}) {
  const map = useMap();

  // Asegurar que Leaflet recalcule el tamaño cuando se abre dentro de un <dialog> modal
  useEffect(() => {
    const container = map.getContainer();
    map.invalidateSize();

    if (typeof ResizeObserver === "undefined" || !container) return;
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);

  useEffect(() => {
    const latNum = Number.parseFloat(String(latitud));
    const lngNum = Number.parseFloat(String(longitud));

    // Condicional estricto antes de invocar cualquier método espacial de Leaflet
    if (
      !Number.isNaN(latNum) &&
      !Number.isNaN(lngNum) &&
      Number.isFinite(latNum) &&
      Number.isFinite(lngNum) &&
      latNum !== 0 &&
      lngNum !== 0
    ) {
      map.invalidateSize();
      const centroActual = map.getCenter();
      if (
        !Number.isNaN(centroActual.lat) &&
        !Number.isNaN(centroActual.lng)
      ) {
        const difLat = Math.abs(centroActual.lat - latNum);
        const difLng = Math.abs(centroActual.lng - lngNum);

        if (difLat > 0.00001 || difLng > 0.00001) {
          const size = map.getSize();
          const zoomActual = map.getZoom();
          const targetZoom =
            !Number.isNaN(zoomActual) && Number.isFinite(zoomActual)
              ? Math.max(zoomActual, ZOOM_DEFAULT)
              : ZOOM_DEFAULT;

          // Si el contenedor aún tiene dimensiones 0x0 (ej. transición de apertura del modal),
          // usar setView sin animación para evitar división por 0 (NaN, NaN) dentro de flyTo.
          if (size.x > 0 && size.y > 0) {
            map.flyTo([latNum, lngNum], targetZoom, {
              duration: 0.75,
            });
          } else {
            map.setView([latNum, lngNum], targetZoom, { animate: false });
          }
        }
      }
    }
  }, [latitud, longitud, map]);

  useMapEvents({
    click(e) {
      if (!editable) return;
      if (
        !Number.isNaN(e.latlng.lat) &&
        !Number.isNaN(e.latlng.lng) &&
        Number.isFinite(e.latlng.lat) &&
        Number.isFinite(e.latlng.lng)
      ) {
        onSelectPoint(e.latlng.lat, e.latlng.lng);
      }
    },
  });

  return null;
}

export default function MapaGeocerca({
  latitud: latProp = FALLBACK_LAT,
  longitud: lngProp = FALLBACK_LNG,
  radioMetros: radioProp = RADIO_DEFAULT,
  direccion: direccionProp = "",
  editable = true,
  mostrarBuscador = true,
  mostrarControlRadio = true,
  heightClass = "h-72",
  onCoordenadasChange,
  onRadioChange,
  onDireccionChange,
}: MapaGeocercaProps) {
  const uid = useId();
  const inputBusquedaId = `geocerca-busqueda-${uid}`;
  const inputRadioRangeId = `geocerca-radio-range-${uid}`;
  const inputRadioNumId = `geocerca-radio-num-${uid}`;

  // 1. Parseo estricto y Fallback inicial
  const inicialSanitizado = sanitizarCoordenadas(latProp, lngProp);

  const [latitud, setLatitud] = useState<number>(inicialSanitizado.safeLat);
  const [longitud, setLongitud] = useState<number>(inicialSanitizado.safeLng);
  const [radioMetros, setRadioMetros] = useState<number>(() =>
    sanitizarRadio(radioProp)
  );
  const [terminoBusqueda, setTerminoBusqueda] = useState<string>(
    direccionProp ?? ""
  );
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const [resultadosNominatim, setResultadosNominatim] = useState<
    NominatimSearchResult[]
  >([]);

  // Sincronizar con props externas cuando el padre cambia la zona seleccionada o entra en edición
  useEffect(() => {
    const { safeLat, safeLng, isLocationValid } = sanitizarCoordenadas(
      latProp,
      lngProp
    );
    if (isLocationValid) {
      setLatitud(safeLat);
      setLongitud(safeLng);
    }
  }, [latProp, lngProp]);

  useEffect(() => {
    setRadioMetros(sanitizarRadio(radioProp));
  }, [radioProp]);

  useEffect(() => {
    setTerminoBusqueda(direccionProp ?? "");
  }, [direccionProp]);

  // 2. Garantizar coordenadas y radio seguros antes de pasarlos a cualquier componente de Leaflet
  const latNum = Number.parseFloat(String(latitud));
  const lngNum = Number.parseFloat(String(longitud));
  const isLocationValid =
    !Number.isNaN(latNum) &&
    !Number.isNaN(lngNum) &&
    Number.isFinite(latNum) &&
    Number.isFinite(lngNum) &&
    latNum !== 0 &&
    lngNum !== 0;

  const safeLat = isLocationValid ? latNum : FALLBACK_LAT;
  const safeLng = isLocationValid ? lngNum : FALLBACK_LNG;
  const safeRadio = sanitizarRadio(radioMetros);

  const actualizarCoordenadas = (nuevaLat: unknown, nuevaLng: unknown) => {
    const validacion = sanitizarCoordenadas(
      nuevaLat,
      nuevaLng,
      safeLat,
      safeLng
    );
    if (!validacion.isLocationValid) return;

    const latRedondeada = Number(validacion.safeLat.toFixed(6));
    const lngRedondeada = Number(validacion.safeLng.toFixed(6));
    setLatitud(latRedondeada);
    setLongitud(lngRedondeada);
    onCoordenadasChange?.(latRedondeada, lngRedondeada);
  };

  const actualizarRadio = (nuevoValor: unknown) => {
    const acotado = sanitizarRadio(nuevoValor);
    setRadioMetros(acotado);
    onRadioChange?.(acotado);
  };

  const actualizarDireccion = (nuevaDir: string) => {
    setTerminoBusqueda(nuevaDir);
    onDireccionChange?.(nuevaDir);
  };

  /**
   * Busca la dirección ingresada utilizando la API pública de Nominatim (OpenStreetMap)
   * y centra el mapa en las coordenadas obtenidas.
   */
  const handleBuscarDireccion = async () => {
    const query = terminoBusqueda.trim();
    if (!query || isSearching) return;

    setIsSearching(true);
    setErrorBusqueda(null);
    setResultadosNominatim([]);

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&addressdetails=1&q=${encodeURIComponent(
        query
      )}`;
      const response = await fetch(url, {
        headers: {
          "Accept-Language": "es",
        },
      });

      if (!response.ok) {
        throw new Error(
          `El servicio de búsqueda respondió con código ${response.status}.`
        );
      }

      const data = (await response.json()) as NominatimSearchResult[];

      if (!Array.isArray(data) || data.length === 0) {
        setErrorBusqueda(
          "No se encontraron resultados para esa dirección. Intenta con calle, colonia y ciudad o ajusta el pin en el mapa."
        );
        return;
      }

      const principal = data[0];
      const nuevaLat = Number.parseFloat(principal.lat);
      const nuevaLng = Number.parseFloat(principal.lon);

      if (!Number.isNaN(nuevaLat) && !Number.isNaN(nuevaLng)) {
        actualizarCoordenadas(nuevaLat, nuevaLng);
        actualizarDireccion(principal.display_name || query);
      }

      if (data.length > 1) {
        setResultadosNominatim(data.slice(0, 4));
      }
    } catch (err) {
      setErrorBusqueda(
        err instanceof Error
          ? `No fue posible buscar la dirección: ${err.message}`
          : "Error de conexión al consultar Nominatim."
      );
    } finally {
      setIsSearching(false);
    }
  };

  const handleSeleccionarResultado = (item: NominatimSearchResult) => {
    const nuevaLat = Number.parseFloat(item.lat);
    const nuevaLng = Number.parseFloat(item.lon);
    if (!Number.isNaN(nuevaLat) && !Number.isNaN(nuevaLng)) {
      actualizarCoordenadas(nuevaLat, nuevaLng);
      actualizarDireccion(item.display_name);
    }
    setResultadosNominatim([]);
  };

  const handleKeyDownBusqueda = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleBuscarDireccion();
    }
  };

  const markerEventHandlers = useMemo(
    () => ({
      dragend(e: L.DragEndEvent) {
        const marker = e.target as L.Marker;
        const pos = marker.getLatLng();
        if (!Number.isNaN(pos.lat) && !Number.isNaN(pos.lng)) {
          actualizarCoordenadas(pos.lat, pos.lng);
        }
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onCoordenadasChange, safeLat, safeLng]
  );

  return (
    <div className="flex flex-col gap-3.5">
      {/* Buscador de direcciones con Nominatim */}
      {editable && mostrarBuscador && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor={inputBusquedaId}
              className="text-[9px] font-bold uppercase tracking-widest text-gray-500"
            >
              BUSCADOR DE DIRECCIÓN (OPENSTREETMAP NOMINATIM)
            </label>
            <span className="text-[8px] font-semibold uppercase tracking-widest text-gray-400">
              BUSCA Y AJUSTA EL PIN EN EL MAPA
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                id={inputBusquedaId}
                type="text"
                value={terminoBusqueda}
                onChange={(e) => {
                  actualizarDireccion(e.target.value);
                  if (errorBusqueda) setErrorBusqueda(null);
                }}
                onKeyDown={handleKeyDownBusqueda}
                autoCorrect="off"
                spellCheck={false}
                placeholder="Ej. Av. Insurgentes Sur 1458, Benito Juárez, CDMX"
                className="h-10 w-full rounded-sm border border-gray-200 bg-brand-beige/50 pl-9 pr-3 text-xs text-gray-800 placeholder-gray-400 focus:border-brand-dark focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={handleBuscarDireccion}
              disabled={isSearching || !terminoBusqueda.trim()}
              className="h-10 shrink-0 rounded-sm bg-brand-dark px-5 text-[10px] font-bold uppercase tracking-widest text-brand-gold transition-colors hover:bg-brand-dark/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSearching ? "BUSCANDO..." : "BUSCAR"}
            </button>
          </div>

          {errorBusqueda && (
            <p
              role="alert"
              aria-live="polite"
              className="text-[11px] font-semibold text-status-danger-dark"
            >
              {errorBusqueda}
            </p>
          )}

          {resultadosNominatim.length > 0 && (
            <div className="rounded-sm border border-gray-200 bg-brand-surface p-2 shadow-sm">
              <p className="mb-1.5 text-[8px] font-bold uppercase tracking-widest text-gray-400">
                COINCIDENCIAS ENCONTRADAS (HAZ CLIC PARA CENTRAR):
              </p>
              <ul className="divide-y divide-gray-100">
                {resultadosNominatim.map((item) => (
                  <li key={item.place_id}>
                    <button
                      type="button"
                      onClick={() => handleSeleccionarResultado(item)}
                      className="flex w-full items-start gap-2 px-2 py-1.5 text-left text-[11px] text-gray-700 transition-colors hover:bg-brand-beige/50"
                    >
                      <MapPinIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-gold" />
                      <span className="line-clamp-1">{item.display_name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Control de Radio en Metros */}
      {editable && mostrarControlRadio && (
        <div className="flex flex-col gap-2.5 rounded-md border border-gray-200 bg-brand-beige/50 p-3.5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <SlidersIcon className="h-3.5 w-3.5 text-gray-600" />
                <label
                  htmlFor={inputRadioRangeId}
                  className="text-[10px] font-black uppercase tracking-wide text-gray-900"
                >
                  RADIO DE COBERTURA PERMITIDO (RADIO_METROS)
                </label>
              </div>
              <p className="text-[10px] text-gray-500">
                El círculo en el mapa muestra en tiempo real la geocerca de
                validación GPS.
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <label htmlFor={inputRadioNumId} className="sr-only">
                Radio en metros
              </label>
              <input
                id={inputRadioNumId}
                type="number"
                min={RADIO_MIN}
                max={RADIO_MAX}
                step={5}
                value={safeRadio}
                onChange={(e) => actualizarRadio(e.target.value)}
                className="h-8 w-20 rounded-sm border border-gray-300 bg-brand-surface text-center font-mono text-xs font-bold text-gray-900 focus:border-brand-dark focus:outline-none"
              />
              <span className="text-[10px] font-bold uppercase text-gray-600">
                m
              </span>
            </div>
          </div>

          <div>
            <input
              id={inputRadioRangeId}
              type="range"
              min={RADIO_MIN}
              max={RADIO_MAX}
              step={5}
              value={safeRadio}
              aria-valuetext={`${safeRadio} metros`}
              onChange={(e) => actualizarRadio(e.target.value)}
              className="h-1.5 w-full cursor-pointer accent-brand-dark"
            />
            <div className="mt-1.5 flex justify-between text-[8px] font-semibold uppercase tracking-wide text-gray-500">
              <span>20m (Estricto)</span>
              <span>100m (Recomendado)</span>
              <span>300m (Complejo)</span>
              <span>1000m (Zona Amplia)</span>
            </div>
          </div>
        </div>
      )}

      {/* Mapa Interactivo React-Leaflet */}
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[9px] font-bold uppercase tracking-widest text-gray-500">
            {editable
              ? "ARRASTRA EL PIN O HAZ CLIC EN EL MAPA PARA AJUSTAR COORDENADAS"
              : "VISTA DE ZONA AUTORIZADA"}
          </span>
          <span
            aria-live="polite"
            className="rounded-sm bg-brand-beige px-2 py-0.5 font-mono text-[10px] font-bold text-gray-700"
          >
            Lat: {safeLat.toFixed(6)} · Lng: {safeLng.toFixed(6)} · Radio:{" "}
            {safeRadio}m
          </span>
        </div>

        <div
          className={`relative isolate z-0 ${heightClass} w-full overflow-hidden rounded-sm border border-gray-200 shadow-inner`}
        >
          <MapContainer
            center={[safeLat, safeLng]}
            zoom={ZOOM_DEFAULT}
            scrollWheelZoom={true}
            className="h-full w-full"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <ControladorVistaMapa
              latitud={safeLat}
              longitud={safeLng}
              editable={editable}
              onSelectPoint={actualizarCoordenadas}
            />

            <Circle
              center={[safeLat, safeLng]}
              radius={safeRadio}
              pathOptions={{
                color: "#1B2432",
                fillColor: "#C5A059",
                fillOpacity: 0.22,
                weight: 2,
              }}
            />

            <Marker
              position={[safeLat, safeLng]}
              draggable={editable}
              icon={DefaultIcon}
              eventHandlers={editable ? markerEventHandlers : undefined}
            />
          </MapContainer>
        </div>
      </div>
    </div>
  );
}
