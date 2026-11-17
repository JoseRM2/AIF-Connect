-- =============================================================================
-- AIF-Connect: Módulo de Reporte de Errores y Usuario Administrador del Sistema
-- Proyecto: AIF-Connect-prod (hmlexqfidjytzgwbkwsp)
-- Fecha: 2026-11-17
-- Propósito:
--   1. Agregar columna oculta `es_admin_sistema` en `public.colaboradores`
--      (invisible para Recursos Humanos) y habilitarla para `jrealmedina@gmail.com`.
--   2. Crear función SECURITY DEFINER `public.es_usuario_admin_sistema()`
--      que autoriza exclusivamente al Administrador del Sistema (no a RH).
--   3. Crear tabla `public.reportes_errores` con políticas RLS e índices.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. BANDERA OCULTA DE ADMINISTRADOR DEL SISTEMA EN public.colaboradores
-- -----------------------------------------------------------------------------
ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS es_admin_sistema boolean NOT NULL DEFAULT false;

UPDATE public.colaboradores
SET es_admin_sistema = true
WHERE LOWER(TRIM(COALESCE(correo_corporativo, ''))) = 'jrealmedina@gmail.com';

-- Función auxiliar SECURITY DEFINER para evaluar si el usuario actual es el Administrador del Sistema
CREATE OR REPLACE FUNCTION public.es_usuario_admin_sistema()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    LOWER(TRIM(COALESCE(auth.jwt() ->> 'email', ''))) = 'jrealmedina@gmail.com'
    OR EXISTS (
      SELECT 1
      FROM public.colaboradores c
      WHERE (
        c.id = auth.uid()
        OR LOWER(TRIM(COALESCE(c.correo_corporativo, ''))) = LOWER(TRIM(COALESCE(auth.jwt() ->> 'email', '')))
      )
      AND c.es_admin_sistema = true
      AND COALESCE(c.estatus, 'Activo'::public.estatus_colaborador) = 'Activo'::public.estatus_colaborador
    );
$$;

REVOKE ALL ON FUNCTION public.es_usuario_admin_sistema() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.es_usuario_admin_sistema() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. TABLA: public.reportes_errores
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reportes_errores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  nombre_reportante text NOT NULL,
  correo_reportante text NOT NULL,
  rol_reportante text NOT NULL,
  empresa_reportante text NOT NULL DEFAULT 'AIF',
  modulo text NOT NULL,
  ruta_origen text NULL,
  severidad text NOT NULL DEFAULT 'Media',
  categoria text NOT NULL DEFAULT 'Funcionalidad',
  titulo text NOT NULL,
  descripcion text NOT NULL,
  pasos_reproducir text NULL,
  captura_url text NULL,
  navegador_info text NULL,
  estatus text NOT NULL DEFAULT 'Abierto',
  notas_admin text NULL,
  resuelto_por text NULL,
  resuelto_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reportes_errores ENABLE ROW LEVEL SECURITY;

-- SELECT: Cada usuario ve únicamente sus propios reportes; el Administrador del Sistema ve TODOS
DROP POLICY IF EXISTS "reportes_errores_select_propio_o_admin" ON public.reportes_errores;
CREATE POLICY "reportes_errores_select_propio_o_admin"
  ON public.reportes_errores
  FOR SELECT
  TO authenticated
  USING (
    colaborador_id = auth.uid()
    OR public.es_usuario_admin_sistema()
  );

-- INSERT: Cualquier usuario autenticado puede registrar un reporte propio
DROP POLICY IF EXISTS "reportes_errores_insert_propio" ON public.reportes_errores;
CREATE POLICY "reportes_errores_insert_propio"
  ON public.reportes_errores
  FOR INSERT
  TO authenticated
  WITH CHECK (
    colaborador_id = auth.uid()
    OR public.es_usuario_admin_sistema()
  );

-- UPDATE: Exclusivo para el Administrador del Sistema (NO Recursos Humanos)
DROP POLICY IF EXISTS "reportes_errores_update_solo_admin" ON public.reportes_errores;
CREATE POLICY "reportes_errores_update_solo_admin"
  ON public.reportes_errores
  FOR UPDATE
  TO authenticated
  USING (public.es_usuario_admin_sistema())
  WITH CHECK (public.es_usuario_admin_sistema());

-- DELETE: Exclusivo para el Administrador del Sistema
DROP POLICY IF EXISTS "reportes_errores_delete_solo_admin" ON public.reportes_errores;
CREATE POLICY "reportes_errores_delete_solo_admin"
  ON public.reportes_errores
  FOR DELETE
  TO authenticated
  USING (public.es_usuario_admin_sistema());

-- -----------------------------------------------------------------------------
-- 3. ÍNDICES DE RENDIMIENTO EN public.reportes_errores
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_reportes_errores_estatus_created
  ON public.reportes_errores (estatus, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reportes_errores_colab_created
  ON public.reportes_errores (colaborador_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reportes_errores_severidad_modulo
  ON public.reportes_errores (severidad, modulo);

COMMIT;
