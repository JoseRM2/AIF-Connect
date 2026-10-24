"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { CompassIcon } from "@/components/ui/icons";
import type { ZonaGeocerca } from "@/types/asistencia";

const ZoneLocationPicker = dynamic(
  () => import("@/components/zonas/ZoneLocationPicker"),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 w-full animate-pulse rounded-sm border border-gray-200 bg-brand-beige/60" />
    ),
  }
);

const COORDENADAS_DEFAULT = { lat: 19.4326, lng: -99.1332, radio_m: 50 };

interface MapPlaceholderProps {
  /** Lista completa de geocercas del colaborador (`colaboradores.zonas_geocerca`). */
  zonas?: ZonaGeocerca[];
  /** Geocerca individual opcional (compatibilidad). */
  zona?: ZonaGeocerca;
  /** Ubicación inicial si ya existe un marcaje hoy. */
  ubicacionInicial?: { lat: number; lng: number } | null;
}

export default function MapPlaceholder({
  zonas = [],
  zona,
  ubicacionInicial = null,
}: MapPlaceholderProps) {
  const listaZonas: ZonaGeocerca[] =
    zonas.length > 0 ? zonas : zona ? [zona] : [];
  const primeraZona = listaZonas[0] ?? null;

  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(ubicacionInicial);

  useEffect(() => {
    const handleGpsEvent = (event: Event) => {
      const custom = event as CustomEvent<{ lat: number; lng: number } | null>;
      if (custom.detail && typeof custom.detail.lat === "number") {
        setUserLocation({ lat: custom.detail.lat, lng: custom.detail.lng });
      }
    };

    window.addEventListener("aif:gps-location", handleGpsEvent);

    if (
      typeof navigator !== "undefined" &&
      navigator.permissions &&
      navigator.geolocation
    ) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((result) => {
          if (result.state === "granted") {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                setUserLocation({
                  lat: pos.coords.latitude,
                  lng: pos.coords.longitude,
                });
              },
              () => {
                // Ignorar error silencioso en precarga
              },
              { enableHighAccuracy: true, timeout: 8000 }
            );
          }
        })
        .catch(() => {
          // Ignorar si Permissions API no está disponible
        });
    }

    return () => {
      window.removeEventListener("aif:gps-location", handleGpsEvent);
    };
  }, []);

  return (
    <section className="mb-6 flex flex-col rounded-md bg-brand-surface p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CompassIcon className="h-4 w-4 text-brand-gold" />
          <h2 className="text-sm font-bold text-gray-900">
            Monitoreo Espacial de Cobertura
          </h2>
        </div>
        <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">
          {listaZonas.length > 0
            ? `${listaZonas.length} ${listaZonas.length === 1 ? "ZONA ACTIVA" : "ZONAS ACTIVAS"} · PUNTO ACTUAL VS GEOCERCA`
            : "SIN GEOCERCAS ASIGNADAS"}
        </span>
      </div>

      {listaZonas.length > 0 ? (
        <ZoneLocationPicker
          lat={primeraZona?.lat ?? COORDENADAS_DEFAULT.lat}
          lng={primeraZona?.lng ?? COORDENADAS_DEFAULT.lng}
          radioM={primeraZona?.radio_m ?? COORDENADAS_DEFAULT.radio_m}
          zones={listaZonas}
          userLocation={userLocation}
          heightClass="h-64"
        />
      ) : (
        <div className="flex h-64 w-full items-center justify-center rounded-sm border border-gray-200 bg-brand-beige/40 px-6 text-center">
          <p className="text-xs font-medium text-gray-500">
            No tienes zonas geocercadas asignadas en tu perfil para mostrar en
            el mapa.
          </p>
        </div>
      )}
    </section>
  );
}
