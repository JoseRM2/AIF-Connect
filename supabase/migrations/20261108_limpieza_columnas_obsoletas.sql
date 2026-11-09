-- =============================================================================
-- Migración: Limpieza de columnas obsoletas en `solicitudes` y `colaboradores`
-- Fecha: 2026-11-08
-- Descripción:
--   Elimina las columnas heredadas de versiones iniciales del diseño que ya no
--   son utilizadas por ningún módulo de AIF-Connect:
--   1. public.solicitudes:
--      - jefe_aprobador_id
--      - rh_aprobador_id
--      - firma_digital_jefe
--      - firma_digital_rh
--      - comentarios_resolucion
--   2. public.colaboradores:
--      - datos_personales (reemplazada por columnas individuales: rfc, curp, nss, etc.)
--      - datos_financieros (reemplazada por columnas individuales: sueldo, bono, clabe, etc.)
-- =============================================================================

BEGIN;

-- 1. Eliminar columnas obsoletas en `public.solicitudes`
ALTER TABLE public.solicitudes
  DROP COLUMN IF EXISTS jefe_aprobador_id,
  DROP COLUMN IF EXISTS rh_aprobador_id,
  DROP COLUMN IF EXISTS firma_digital_jefe,
  DROP COLUMN IF EXISTS firma_digital_rh,
  DROP COLUMN IF EXISTS comentarios_resolucion;

-- 2. Eliminar columnas JSONB obsoletas en `public.colaboradores`
ALTER TABLE public.colaboradores
  DROP COLUMN IF EXISTS datos_personales,
  DROP COLUMN IF EXISTS datos_financieros;

COMMIT;
