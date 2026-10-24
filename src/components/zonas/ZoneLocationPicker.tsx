"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { ZonaGeocerca } from "@/types/asistencia";

export interface ZoneLocationPickerProps {
  lat: number;
  lng: number;
  /** Radio de la geocerca en metros. */
  radioM: number;
  /** Lista opcional de múltiples geocercas para renderizar en el mapa. */
  zones?: ZonaGeocerca[];
  /** Si se omite, el mapa funciona en modo visualización (sin arrastrar el centro de la zona). */
  onChange?: (lat: number, lng: number) => void;
  /** Ubicación actual del colaborador (GPS) para mostrar su pin en el mapa. */
  userLocation?: { lat: number; lng: number } | null;
  /** Clase de altura de Tailwind (por defecto `h-56`). */
  heightClass?: string;
}

const ZOOM_INICIAL = 15;

const PIN_ZONA_HTML = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-8 w-8 fill-brand-dark stroke-white drop-shadow-md" stroke-width="1.5" aria-hidden="true">
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" class="fill-white stroke-none" />
  </svg>`;

const PIN_USUARIO_HTML = `
  <div class="relative flex h-6 w-6 items-center justify-center">
    <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-success opacity-60"></span>
    <span class="relative inline-flex h-4 w-4 rounded-full border-2 border-white bg-status-success shadow-md"></span>
  </div>`;

/**
 * Mapa Leaflet/OpenStreetMap reutilizable para:
 *  - Crear Nueva Zona (interactivo con `onChange`)
 *  - Mi Asistencia (renderiza todas las `zones` del colaborador + pin GPS del usuario)
 *  - Catálogo de Zonas Autorizadas (visualización reactiva al seleccionar zona)
 */
export default function ZoneLocationPicker({
  lat: latProp,
  lng: lngProp,
  radioM: radioProp,
  zones,
  onChange,
  userLocation = null,
  heightClass = "h-56",
}: ZoneLocationPickerProps) {
  const latNum = Number.parseFloat(String(latProp ?? ""));
  const lngNum = Number.parseFloat(String(lngProp ?? ""));
  const isLocationValid =
    !Number.isNaN(latNum) &&
    !Number.isNaN(lngNum) &&
    Number.isFinite(latNum) &&
    Number.isFinite(lngNum) &&
    latNum !== 0 &&
    lngNum !== 0;

  const lat = isLocationValid ? latNum : 23.6345;
  const lng = isLocationValid ? lngNum : -102.5528;
  const radioNum = Number.parseFloat(String(radioProp ?? ""));
  const radioM =
    !Number.isNaN(radioNum) && Number.isFinite(radioNum) && radioNum > 0
      ? radioNum
      : 100;

  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const marcadorZonaRef = useRef<L.Marker | null>(null);
  const marcadorUsuarioRef = useRef<L.Marker | null>(null);
  const circuloRef = useRef<L.Circle | null>(null);
  const grupoZonasRef = useRef<L.FeatureGroup | null>(null);

  const esModoMultiZona = Boolean(!onChange && zones && zones.length > 0);

  const inicialRef = useRef({
    lat,
    lng,
    radioM,
    editable: Boolean(onChange),
    multiZona: esModoMultiZona,
  });
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Montaje inicial de Leaflet
  useEffect(() => {
    const contenedor = contenedorRef.current;
    if (!contenedor) return;
    const inicial = inicialRef.current;

    const mapa = L.map(contenedor, {
      center: [inicial.lat, inicial.lng],
      zoom: ZOOM_INICIAL,
      zoomControl: false,
      scrollWheelZoom: false,
    });

    L.control.zoom({ position: "topright" }).addTo(mapa);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(mapa);

    if (!inicial.multiZona) {
      const circulo = L.circle([inicial.lat, inicial.lng], {
        radius: inicial.radioM,
        className: "zona-circulo",
      }).addTo(mapa);

      const marcadorZona = L.marker([inicial.lat, inicial.lng], {
        draggable: inicial.editable,
        icon: L.divIcon({
          html: PIN_ZONA_HTML,
          className: "",
          iconSize: [32, 32],
          iconAnchor: [16, 32],
        }),
      }).addTo(mapa);

      if (inicial.editable) {
        marcadorZona.on("drag", () => {
          const { lat: nuevaLat, lng: nuevaLng } = marcadorZona.getLatLng();
          circulo.setLatLng([nuevaLat, nuevaLng]);
          onChangeRef.current?.(nuevaLat, nuevaLng);
        });

        mapa.on("click", (e: L.LeafletMouseEvent) => {
          if (!onChangeRef.current) return;
          marcadorZona.setLatLng(e.latlng);
          circulo.setLatLng(e.latlng);
          onChangeRef.current(e.latlng.lat, e.latlng.lng);
        });
      }

      marcadorZonaRef.current = marcadorZona;
      circuloRef.current = circulo;
    }

    const observer = new ResizeObserver(() => mapa.invalidateSize());
    observer.observe(contenedor);

    mapaRef.current = mapa;

    return () => {
      observer.disconnect();
      mapa.remove();
      mapaRef.current = null;
      marcadorZonaRef.current = null;
      marcadorUsuarioRef.current = null;
      circuloRef.current = null;
      grupoZonasRef.current = null;
    };
  }, []);

  // Renderizar múltiples geocercas cuando se provee el arreglo `zones`
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !esModoMultiZona || !zones) return;

    if (grupoZonasRef.current) {
      grupoZonasRef.current.clearLayers();
      grupoZonasRef.current.remove();
    }

    const grupo = L.featureGroup();
    const zonasValidas = zones.filter((z) => {
      const zLat = Number.parseFloat(String(z.lat));
      const zLng = Number.parseFloat(String(z.lng));
      return (
        !Number.isNaN(zLat) &&
        !Number.isNaN(zLng) &&
        Number.isFinite(zLat) &&
        Number.isFinite(zLng) &&
        zLat !== 0 &&
        zLng !== 0
      );
    });

    zonasValidas.forEach((z) => {
      const zLat = Number.parseFloat(String(z.lat));
      const zLng = Number.parseFloat(String(z.lng));
      const radio = z.radio_m > 0 ? z.radio_m : 50;

      const circulo = L.circle([zLat, zLng], {
        radius: radio,
        className: "zona-circulo",
      });

      const marcador = L.marker([zLat, zLng], {
        draggable: false,
        icon: L.divIcon({
          html: PIN_ZONA_HTML,
          className: "",
          iconSize: [32, 32],
          iconAnchor: [16, 32],
        }),
      }).bindTooltip(`${z.nombre} (${radio}m)`, {
        direction: "top",
        offset: [0, -28],
      });

      grupo.addLayer(circulo);
      grupo.addLayer(marcador);
    });

    grupo.addTo(mapa);
    grupoZonasRef.current = grupo;

    if (zonasValidas.length === 1) {
      const zLat = Number.parseFloat(String(zonasValidas[0].lat));
      const zLng = Number.parseFloat(String(zonasValidas[0].lng));
      mapa.setView([zLat, zLng], ZOOM_INICIAL);
    } else if (zonasValidas.length > 1) {
      const bounds = grupo.getBounds();
      if (bounds.isValid()) {
        mapa.fitBounds(bounds, { padding: [36, 36], maxZoom: ZOOM_INICIAL });
      }
    }
  }, [esModoMultiZona, zones]);

  // Actualizar centro de la geocerca única cuando cambia la zona seleccionada
  useEffect(() => {
    if (esModoMultiZona) return;
    if (Number.isNaN(lat) || Number.isNaN(lng) || lat === 0 || lng === 0) {
      return;
    }
    const mapa = mapaRef.current;
    const marcadorZona = marcadorZonaRef.current;
    const circulo = circuloRef.current;
    if (!mapa || !marcadorZona || !circulo) return;

    const actual = marcadorZona.getLatLng();
    if (actual.lat === lat && actual.lng === lng) return;

    marcadorZona.setLatLng([lat, lng]);
    circulo.setLatLng([lat, lng]);
    const size = mapa.getSize();
    const zoomActual = mapa.getZoom();
    const targetZoom =
      !Number.isNaN(zoomActual) && Number.isFinite(zoomActual)
        ? zoomActual
        : ZOOM_INICIAL;
    mapa.setView([lat, lng], targetZoom, {
      animate: size.x > 0 && size.y > 0,
    });
  }, [esModoMultiZona, lat, lng]);

  // Actualizar radio de la geocerca única
  useEffect(() => {
    if (esModoMultiZona) return;
    if (!Number.isNaN(radioM) && radioM > 0) {
      circuloRef.current?.setRadius(radioM);
    }
  }, [esModoMultiZona, radioM]);

  // Mostrar o actualizar el marcador de ubicación actual del usuario (GPS)
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;

    if (!userLocation) {
      if (marcadorUsuarioRef.current) {
        marcadorUsuarioRef.current.remove();
        marcadorUsuarioRef.current = null;
      }
      return;
    }

    if (!marcadorUsuarioRef.current) {
      marcadorUsuarioRef.current = L.marker(
        [userLocation.lat, userLocation.lng],
        {
          icon: L.divIcon({
            html: PIN_USUARIO_HTML,
            className: "",
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          }),
        }
      )
        .bindTooltip("Tu ubicación GPS actual", {
          direction: "top",
          offset: [0, -10],
        })
        .addTo(mapa);
    } else {
      marcadorUsuarioRef.current.setLatLng([
        userLocation.lat,
        userLocation.lng,
      ]);
    }
  }, [userLocation]);

  const esInteractivo = Boolean(onChange);
  const totalZonas = zones?.length ?? 1;

  return (
    <div
      className={`relative isolate z-0 ${heightClass} w-full overflow-hidden rounded-sm border border-gray-200`}
    >
      <div ref={contenedorRef} className="h-full w-full" />
      {esInteractivo ? (
        <div className="pointer-events-none absolute left-0 top-0 z-[400] bg-brand-dark px-3 py-1.5 text-[8px] font-bold uppercase tracking-widest text-white">
          HAZ CLIC O ARRASTRA EL PIN PARA FIJAR COORDENADAS
        </div>
      ) : (
        <div className="pointer-events-none absolute left-2 top-2 z-[400] flex items-center gap-2 rounded-sm bg-brand-surface/95 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-gray-800 shadow-sm">
          <span className="inline-block h-2 w-2 rounded-full bg-brand-dark" />
          <span>
            {esModoMultiZona
              ? `${totalZonas} ${totalZonas === 1 ? "Geocerca Autorizada" : "Geocercas Autorizadas"}`
              : `Centro Geocerca (${radioM}m)`}
          </span>
          {userLocation && (
            <>
              <span className="text-gray-300">•</span>
              <span className="inline-block h-2 w-2 rounded-full bg-status-success" />
              <span className="text-status-success">Tu GPS</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
