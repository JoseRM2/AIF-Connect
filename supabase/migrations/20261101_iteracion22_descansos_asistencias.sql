-- Iteración 22: Control de Descansos e Indicadores Visuales de Horario en Reportes
-- Misión 1: Actualización del Esquema en Supabase para la tabla `public.asistencias`

ALTER TABLE public.asistencias
  ADD COLUMN IF NOT EXISTS hora_inicio_descanso time without time zone NULL,
  ADD COLUMN IF NOT EXISTS hora_fin_descanso time without time zone NULL,
  ADD COLUMN IF NOT EXISTS ubicacion_inicio_descanso jsonb NULL,
  ADD COLUMN IF NOT EXISTS ubicacion_fin_descanso jsonb NULL;

COMMENT ON COLUMN public.asistencias.hora_inicio_descanso IS 'Hora de inicio del descanso intermedio del colaborador (formato HH:MM:SS).';
COMMENT ON COLUMN public.asistencias.hora_fin_descanso IS 'Hora de término del descanso y reincorporación a actividades (formato HH:MM:SS).';
COMMENT ON COLUMN public.asistencias.ubicacion_inicio_descanso IS 'Coordenadas GPS y validación de geocerca al iniciar el descanso.';
COMMENT ON COLUMN public.asistencias.ubicacion_fin_descanso IS 'Coordenadas GPS y validación de geocerca al finalizar el descanso.';
