-- =============================================================================
-- AIF-Connect: Fase 1 Modernización — Rate Limiting Distribuido (Serverless)
-- Proyecto: AIF-Connect-prod
-- Fecha: 2026-11-24
-- Propósito:
--   Reemplazar el almacenamiento efímero en RAM por una tabla + función RPC
--   atómica en PostgreSQL (`public.verificar_rate_limit_atomico`) para que
--   los límites de intentos (login, alta RH, comentarios muro, reportes error)
--   se compartan entre todas las instancias serverless de Vercel.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.seguridad_rate_limits (
  clave text PRIMARY KEY,
  conteo integer NOT NULL DEFAULT 1 CHECK (conteo >= 0),
  expira_en timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seguridad_rate_limits_expira_en
  ON public.seguridad_rate_limits (expira_en);

-- RLS habilitado sin políticas para `anon` ni `authenticated`:
-- acceso exclusivo desde el servidor mediante `service_role`.
ALTER TABLE public.seguridad_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.verificar_rate_limit_atomico(
  p_clave text,
  p_max_intentos integer,
  p_ventana_ms bigint
)
RETURNS TABLE (
  permitido boolean,
  restantes integer,
  reintentar_en_segundos integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ahora timestamptz := clock_timestamp();
  v_ventana interval := make_interval(secs => GREATEST(p_ventana_ms, 1000)::double precision / 1000.0);
  v_conteo integer;
  v_expira_en timestamptz;
BEGIN
  -- Limpieza oportunista ligera (~2% de invocaciones) para evitar crecimiento indefinido
  IF random() < 0.02 THEN
    DELETE FROM public.seguridad_rate_limits
    WHERE expira_en <= v_ahora;
  END IF;

  INSERT INTO public.seguridad_rate_limits AS srl (clave, conteo, expira_en, updated_at)
  VALUES (p_clave, 1, v_ahora + v_ventana, v_ahora)
  ON CONFLICT (clave) DO UPDATE
    SET conteo = CASE
          WHEN srl.expira_en <= v_ahora THEN 1
          ELSE LEAST(srl.conteo + 1, p_max_intentos + 1)
        END,
        expira_en = CASE
          WHEN srl.expira_en <= v_ahora THEN v_ahora + v_ventana
          ELSE srl.expira_en
        END,
        updated_at = v_ahora
  RETURNING srl.conteo, srl.expira_en
  INTO v_conteo, v_expira_en;

  permitido := v_conteo <= p_max_intentos;
  restantes := GREATEST(0, p_max_intentos - v_conteo);
  reintentar_en_segundos := GREATEST(
    1,
    CEIL(EXTRACT(EPOCH FROM (v_expira_en - v_ahora)))::integer
  );

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.verificar_rate_limit_atomico(text, integer, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verificar_rate_limit_atomico(text, integer, bigint) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verificar_rate_limit_atomico(text, integer, bigint) TO service_role;

COMMIT;
