-- =============================================================================
-- AIF-Connect: Nuevo valor 'Cancelado' en el ENUM public.estatus_solicitud
-- Proyecto: AIF-Connect-prod (hmlexqfidjytzgwbkwsp)
-- Fecha: 2026-11-19
-- Propósito:
--   Permitir guardar el estatus nativo 'Cancelado' cuando un colaborador
--   cancela su solicitud con motivo de cancelación visible para Jefatura y RH.
-- =============================================================================

ALTER TYPE public.estatus_solicitud ADD VALUE IF NOT EXISTS 'Cancelado';
