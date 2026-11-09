-- =============================================================================
-- AIF-Connect: Punto 5 — Índices Compuestos de Rendimiento y Bitácora de Auditoría
-- Proyecto: AIF-Connect-prod (hmlexqfidjytzgwbkwsp)
-- Fecha: 2026-11-08
-- Propósito:
--   1. Crear la tabla inmutable `public.bitacora_auditoria_seguridad` con RLS
--      de solo lectura para Recursos Humanos (escritura exclusiva desde servidor).
--   2. Crear índices compuestos B-Tree (`CREATE INDEX IF NOT EXISTS`) en las
--      columnas de filtrado, cruce (FK) y ordenamiento frecuente para prevenir
--      Sequential Scans y degradación por volumen (anti-DoS en BD).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. TABLA DE BITÁCORA DE AUDITORÍA DE SEGURIDAD (Append-Only)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bitacora_auditoria_seguridad (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento text NOT NULL,
  actor_id uuid NULL,
  actor_email text NULL,
  objetivo_id text NULL,
  ip_origen text NULL,
  detalles jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bitacora_auditoria_seguridad ENABLE ROW LEVEL SECURITY;

-- Solo Recursos Humanos puede consultar la bitácora; ningún cliente puede editar o borrar registros
DROP POLICY IF EXISTS "bitacora_auditoria_select_solo_rh" ON public.bitacora_auditoria_seguridad;
CREATE POLICY "bitacora_auditoria_select_solo_rh"
  ON public.bitacora_auditoria_seguridad
  FOR SELECT
  TO authenticated
  USING (public.es_usuario_rh());

-- -----------------------------------------------------------------------------
-- 2. ÍNDICES COMPUESTOS EN TABLA: public.colaboradores
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_colaboradores_estatus_empresa_depto
  ON public.colaboradores (estatus, empresa, departamento);

CREATE INDEX IF NOT EXISTS idx_colaboradores_jefe_directo_id
  ON public.colaboradores (jefe_directo_id);

CREATE INDEX IF NOT EXISTS idx_colaboradores_correo_lower
  ON public.colaboradores (LOWER(correo_corporativo));

CREATE INDEX IF NOT EXISTS idx_colaboradores_rol_sistema
  ON public.colaboradores (rol_sistema);

-- -----------------------------------------------------------------------------
-- 3. ÍNDICES COMPUESTOS EN TABLA: public.asistencias
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_asistencias_colab_fecha
  ON public.asistencias (colaborador_id, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_asistencias_fecha_estatus
  ON public.asistencias (fecha DESC, estatus);

-- -----------------------------------------------------------------------------
-- 4. ÍNDICES COMPUESTOS EN TABLA: public.solicitudes
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_solicitudes_colab_estatus_created
  ON public.solicitudes (colaborador_id, estatus, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_solicitudes_tipo_estatus_fechas
  ON public.solicitudes (tipo_solicitud, estatus, fecha_inicio DESC);

-- -----------------------------------------------------------------------------
-- 5. ÍNDICES COMPUESTOS EN TABLA: public.tickets_asistencia
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_tickets_asistencia_estatus_colab
  ON public.tickets_asistencia (estatus, colaborador_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 6. ÍNDICES COMPUESTOS EN TABLAS DEL MURO CORPORATIVO
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_muro_pub_fecha_audiencia
  ON public.muro_publicaciones (fecha_publicacion DESC, empresa_destino, departamento_destino);

CREATE INDEX IF NOT EXISTS idx_muro_inter_pub_tipo_mod
  ON public.muro_interacciones (publicacion_id, tipo_interaccion, estatus_moderacion);

CREATE INDEX IF NOT EXISTS idx_muro_inter_colab_pub
  ON public.muro_interacciones (colaborador_id, publicacion_id);

-- -----------------------------------------------------------------------------
-- 7. ÍNDICES COMPUESTOS EN EXPEDIENTES, CALENDARIO RH Y AUDITORÍA
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_expedientes_doc_colab_tipo
  ON public.expedientes_documentos (colaborador_id, tipo_documento);

CREATE INDEX IF NOT EXISTS idx_calendario_eventos_rh_tipo_fecha
  ON public.calendario_eventos_rh (tipo, fecha);

CREATE INDEX IF NOT EXISTS idx_bitacora_auditoria_evento_created
  ON public.bitacora_auditoria_seguridad (evento, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bitacora_auditoria_actor_created
  ON public.bitacora_auditoria_seguridad (actor_id, created_at DESC);

COMMIT;
