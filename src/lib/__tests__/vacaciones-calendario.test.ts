import { describe, expect, it } from "vitest";
import {
  calcularDiasEfectivosSinFeriados,
  obtenerFeriadosLftPorAnio,
} from "@/lib/calendario";
import {
  calcularAniosAntiguedadCumplidos,
  calcularDiasVacacionesPorAniosLft,
  esSolicitudCancelada,
  esSolicitudMedioDia,
  formatearMotivoConMedioDia,
} from "@/lib/solicitudes";

describe("Vacaciones Dignas LFT y Calendario Corporativo", () => {
  it("calcula la tabla progresiva del Art. 76 de la LFT (Vacaciones Dignas)", () => {
    expect(calcularDiasVacacionesPorAniosLft(0)).toBe(0);
    expect(calcularDiasVacacionesPorAniosLft(1)).toBe(12);
    expect(calcularDiasVacacionesPorAniosLft(2)).toBe(14);
    expect(calcularDiasVacacionesPorAniosLft(3)).toBe(16);
    expect(calcularDiasVacacionesPorAniosLft(4)).toBe(18);
    expect(calcularDiasVacacionesPorAniosLft(5)).toBe(20);
    expect(calcularDiasVacacionesPorAniosLft(6)).toBe(22);
    expect(calcularDiasVacacionesPorAniosLft(10)).toBe(22);
    expect(calcularDiasVacacionesPorAniosLft(11)).toBe(24);
  });

  it("calcula años cumplidos respetando aniversario exacto", () => {
    expect(
      calcularAniosAntiguedadCumplidos("2023-11-25", new Date(2026, 10, 24))
    ).toBe(2);
    expect(
      calcularAniosAntiguedadCumplidos("2023-11-24", new Date(2026, 10, 24))
    ).toBe(3);
  });

  it("incluye el feriado sexenal del 1 de octubre solo cuando corresponde (2024, 2030)", () => {
    const feriados2026 = obtenerFeriadosLftPorAnio(2026);
    const feriados2030 = obtenerFeriadosLftPorAnio(2030);

    expect(feriados2026.some((f) => f.fecha === "2026-10-01")).toBe(false);
    expect(feriados2030.some((f) => f.fecha === "2030-10-01")).toBe(true);
  });

  it("descuenta fines de semana y días feriados oficiales (ej. tercer lunes de noviembre 2026-11-16)", () => {
    // Semana del lunes 16 al viernes 20 de noviembre de 2026 (16 nov es feriado LFT)
    const resultado = calcularDiasEfectivosSinFeriados(
      "2026-11-14", // sábado
      "2026-11-20", // viernes
      [],
      "AIF"
    );

    expect(resultado.diasNaturales).toBe(7);
    expect(resultado.diasFinDeSemana).toBe(2);
    expect(resultado.feriadosEnRango).toHaveLength(1);
    expect(resultado.feriadosEnRango[0]?.fecha).toBe("2026-11-16");
    expect(resultado.diasEfectivos).toBe(4);
  });

  it("soporta solicitudes de medio día (0.5) y detección de cancelaciones", () => {
    const motivo = formatearMotivoConMedioDia("Cita médica", true, "Matutino");
    expect(esSolicitudMedioDia(motivo)).toBe(true);

    const medioDia = calcularDiasEfectivosSinFeriados(
      "2026-11-24",
      "2026-11-24",
      [],
      "AIF",
      motivo
    );
    expect(medioDia.diasEfectivos).toBe(0.5);
    expect(esSolicitudCancelada("Cancelado", null)).toBe(true);
  });
});
