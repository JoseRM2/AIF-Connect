import { describe, expect, it } from "vitest";
import {
  calcularEstatusEntrada,
  calcularMinutosDescanso,
  evaluarIndicadoresVisualesAsistencia,
  horaLimite,
} from "@/lib/asistencia";

describe("Motor de Asistencia e Indicadores de Horario (asistencia.ts)", () => {
  const horarioBase = {
    entrada: "09:00",
    salida: "18:00",
    tolerancia_min: 15,
  };

  it("calcula correctamente la hora límite sumando los minutos de tolerancia", () => {
    expect(horaLimite(horarioBase)).toBe("09:15");
  });

  it("clasifica entrada a tiempo dentro de la tolerancia y retardo al excederla", () => {
    const aTiempo = calcularEstatusEntrada(
      new Date(2026, 10, 24, 9, 15, 0),
      horarioBase
    );
    expect(aTiempo.estatus).toBe("a_tiempo");
    expect(aTiempo.minutos_retardo).toBe(15);

    const retardo = calcularEstatusEntrada(
      new Date(2026, 10, 24, 9, 16, 0),
      horarioBase
    );
    expect(retardo.estatus).toBe("retardo");
    expect(retardo.minutos_retardo).toBe(16);
  });

  it("calcula duración de descanso y detecta exceso sobre 60 minutos", () => {
    expect(calcularMinutosDescanso("14:00", "14:55")).toBe(55);
    expect(calcularMinutosDescanso("14:00", "15:20")).toBe(80);

    const flags = evaluarIndicadoresVisualesAsistencia({
      hora_entrada: "09:22",
      hora_inicio_descanso: "14:00",
      hora_fin_descanso: "15:15",
      hora_salida: "18:40",
    });

    expect(flags.esRetardo).toBe(true);
    expect(flags.minutosRetardo).toBe(22);
    expect(flags.descansoExcedido).toBe(true);
    expect(flags.minutosDescanso).toBe(75);
    expect(flags.minutosExcesoDescanso).toBe(15);
    expect(flags.esSalidaTardia).toBe(true);
    expect(flags.minutosTiempoAdicional).toBe(40);
  });
});
