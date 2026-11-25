import { describe, expect, it } from "vitest";
import { calcularDistancia, normalizeZones } from "@/lib/utils/geo";

describe("Geocercas y Distancia Haversine (geo.ts)", () => {
  it("calcula 0 metros cuando ambas coordenadas son idénticas", () => {
    expect(calcularDistancia(19.4326, -99.1332, 19.4326, -99.1332)).toBeCloseTo(
      0,
      3
    );
  });

  it("calcula con precisión la distancia en metros entre dos puntos cercanos (~111 m por 0.001° latitud)", () => {
    const d = calcularDistancia(19.4326, -99.1332, 19.4336, -99.1332);
    expect(d).toBeGreaterThan(108);
    expect(d).toBeLessThan(114);
  });

  it("normaliza múltiples formatos de geocerca JSONB y excluye zonas inactivas", () => {
    const zonas = normalizeZones([
      {
        id: "z1",
        titulo: "Oficina Corporativa AIF",
        tipo: "oficina",
        latitud: "20.6736",
        longitud: "-103.344",
        radio_metros: "150",
        estatus: "activa",
      },
      {
        id: "z2",
        nombre: "Zona Inactiva",
        lat: 20.68,
        lng: -103.35,
        estatus: "inactiva",
      },
      {
        nombre: "Home Office Autorizado",
        lat: 20.7,
        lon: -103.4,
      },
    ]);

    expect(zonas).toHaveLength(2);
    expect(zonas[0]).toMatchObject({
      id: "z1",
      nombre: "Oficina Corporativa AIF",
      tipo: "oficina",
      lat: 20.6736,
      lng: -103.344,
      radio_m: 150,
    });
    expect(zonas[1]).toMatchObject({
      id: "zona-3",
      nombre: "Home Office Autorizado",
      tipo: "home_office",
      radio_m: 100,
    });
  });
});
