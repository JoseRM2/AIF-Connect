-- =============================================================================
-- AIF-Connect: Soporte Decimal para Medios Días de Vacaciones (0.5 días)
-- Proyecto: AIF-Connect-prod (hmlexqfidjytzgwbkwsp)
-- Fecha: 2026-11-19
-- Propósito:
--   Cambiar `colaboradores.saldo_vacaciones` de integer a numeric(6,1) para
--   permitir saldos con medios días (ej. 11.5, 5.5).
-- =============================================================================

BEGIN;

ALTER TABLE public.colaboradores
  ALTER COLUMN saldo_vacaciones TYPE numeric(6,1)
  USING saldo_vacaciones::numeric(6,1);

COMMIT;
