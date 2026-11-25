import { describe, expect, it } from "vitest";
import {
  cancelarSolicitudSchema,
  comentarioMuroSchema,
  crearColaboradorMinimoSchema,
  crearReporteErrorSchema,
  loginSchema,
  validarConZod,
} from "@/lib/security/schemas";

describe("Esquemas Zod de Seguridad en Server Actions (schemas.ts)", () => {
  it("normaliza correo en minúsculas y rechaza credenciales inválidas en loginSchema", () => {
    const ok = validarConZod(loginSchema, {
      email: "  Colaborador@AIF.com.mx ",
      password: "PasswordSegura123!",
    });
    expect(ok).toEqual({
      ok: true,
      data: {
        email: "colaborador@aif.com.mx",
        password: "PasswordSegura123!",
      },
    });

    const invalido = validarConZod(loginSchema, {
      email: "no-es-correo",
      password: "123",
    });
    expect(invalido.ok).toBe(false);
  });

  it("exige motivo mínimo de 3 caracteres en cancelarSolicitudSchema", () => {
    const corto = validarConZod(cancelarSolicitudSchema, {
      solicitudId: "uuid-123",
      motivoCancelacion: "ab",
    });
    expect(corto.ok).toBe(false);

    const valido = validarConZod(cancelarSolicitudSchema, {
      solicitudId: "uuid-123",
      motivoCancelacion: "Cambio de fecha de viaje",
    });
    expect(valido.ok).toBe(true);
  });

  it("limita comentarios del muro a 1,000 caracteres y recorta espacios", () => {
    const vacio = validarConZod(comentarioMuroSchema, {
      publicacionId: "pub-1",
      contenido: "   ",
    });
    expect(vacio.ok).toBe(false);

    const excedido = validarConZod(comentarioMuroSchema, {
      publicacionId: "pub-1",
      contenido: "a".repeat(1001),
    });
    expect(excedido.ok).toBe(false);
  });

  it("asigna valores seguros por defecto en crearReporteErrorSchema y valida empresa en crearColaboradorMinimoSchema", () => {
    const reporte = validarConZod(crearReporteErrorSchema, {
      titulo: "Error en botón de exportar",
      descripcion: "Al presionar el botón con filtro vacío muestra alerta.",
    });
    expect(reporte.ok).toBe(true);
    if (reporte.ok) {
      expect(reporte.data.modulo).toBe("General");
      expect(reporte.data.severidad).toBe("Media");
    }

    const empresaInvalida = validarConZod(crearColaboradorMinimoSchema, {
      correo_corporativo: "nuevo@aif.com.mx",
      nombre_completo: "Juan Pérez",
      empresa: "OTRA",
    });
    expect(empresaInvalida).toEqual({
      ok: false,
      error: "La empresa debe ser AIF o ROYAL.",
    });
  });
});
