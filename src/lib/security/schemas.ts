import { z } from "zod";

export type ResultadoValidacionZod<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Ejecuta `safeParse` sobre cualquier esquema Zod y devuelve el primer mensaje
 * legible en español en caso de fallo, evitando exponer trazas internas en Server Actions.
 */
export function validarConZod<T>(
  schema: z.ZodType<T>,
  input: unknown,
  mensajePorDefecto = "Los datos enviados no son válidos."
): ResultadoValidacionZod<T> {
  const resultado = schema.safeParse(input);
  if (resultado.success) {
    return { ok: true, data: resultado.data };
  }
  const primerIssue = resultado.error.issues[0];
  return {
    ok: false,
    error: primerIssue?.message || mensajePorDefecto,
  };
}

export const loginSchema = z.object({
  email: z
    .string({ error: "Ingresa un correo electrónico y contraseña válidos." })
    .trim()
    .toLowerCase()
    .min(3, "Ingresa un correo electrónico y contraseña válidos.")
    .max(254, "Ingresa un correo electrónico y contraseña válidos.")
    .email("Ingresa un correo electrónico válido."),
  password: z
    .string({ error: "Ingresa un correo electrónico y contraseña válidos." })
    .min(1, "Ingresa un correo electrónico y contraseña válidos.")
    .max(256, "Ingresa un correo electrónico y contraseña válidos."),
});

export const cancelarSolicitudSchema = z.object({
  solicitudId: z
    .string({ error: "Identificador de solicitud no válido." })
    .trim()
    .min(1, "Identificador de solicitud no válido.")
    .max(128, "Identificador de solicitud no válido."),
  motivoCancelacion: z
    .string({
      error:
        "Ingresa el motivo de cancelación (mínimo 3 caracteres) para informar a tu Jefatura y a RH.",
    })
    .trim()
    .min(
      3,
      "Ingresa el motivo de cancelación (mínimo 3 caracteres) para informar a tu Jefatura y a RH."
    )
    .max(500, "El motivo de cancelación no puede exceder 500 caracteres."),
});

export const comentarioMuroSchema = z.object({
  publicacionId: z
    .string({ error: "Identificador de publicación no válido." })
    .trim()
    .min(1, "Identificador de publicación no válido.")
    .max(128, "Identificador de publicación no válido."),
  contenido: z
    .string({ error: "El comentario no puede estar vacío." })
    .trim()
    .min(1, "El comentario no puede estar vacío.")
    .max(
      1000,
      "El comentario excede la longitud máxima permitida (1,000 caracteres)."
    ),
});

export const crearReporteErrorSchema = z.object({
  titulo: z
    .string({
      error: "Ingresa un título breve descriptivo (mínimo 4 caracteres).",
    })
    .trim()
    .min(4, "Ingresa un título breve descriptivo (mínimo 4 caracteres).")
    .max(180, "El título no puede exceder 180 caracteres."),
  descripcion: z
    .string({
      error:
        "Describe con detalle el error detectado (mínimo 10 caracteres).",
    })
    .trim()
    .min(10, "Describe con detalle el error detectado (mínimo 10 caracteres).")
    .max(3000, "La descripción no puede exceder 3,000 caracteres."),
  modulo: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : "General")),
  categoria: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : "Funcionalidad")),
  severidad: z
    .enum(["Baja", "Media", "Alta", "Critica"])
    .optional()
    .catch("Media")
    .transform((v) => v ?? "Media"),
  pasosReproducir: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v.slice(0, 2000) : null)),
  rutaOrigen: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v.slice(0, 250) : null)),
  navegadorInfo: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v.slice(0, 300) : null)),
  capturaUrl: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v.slice(0, 1000) : null)),
});

export const crearColaboradorMinimoSchema = z.object({
  correo_corporativo: z
    .string({ error: "El correo corporativo es obligatorio." })
    .trim()
    .toLowerCase()
    .min(1, "El correo corporativo es obligatorio.")
    .email("El correo corporativo no tiene un formato válido."),
  nombre_completo: z
    .string({ error: "El nombre completo es obligatorio." })
    .trim()
    .min(1, "El nombre completo es obligatorio.")
    .max(200, "El nombre completo excede la longitud máxima."),
  empresa: z.enum(["AIF", "ROYAL"], {
    error: "La empresa debe ser AIF o ROYAL.",
  }),
});
