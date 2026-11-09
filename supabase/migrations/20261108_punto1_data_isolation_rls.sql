-- =============================================================================
-- AIF-Connect: Punto 1 — Data Isolation (Row Level Security)
-- Proyecto: AIF-Connect-prod (hmlexqfidjytzgwbkwsp)
-- Fecha: 2026-11-08
-- Compatible con los tipos ENUM nativos de public:
--   - public.estatus_colaborador ('Activo', 'Inactivo', 'Baja')
--   - public.empresa_tipo        ('AIF', 'ROYAL')
--   - public.rol_sistema         ('Colaborador', 'Jefatura', 'Recursos Humanos')
--   - public.turno_tipo          ('Completo', 'Medio_Turno')
--   - public.estatus_asistencia  ('A Tiempo', 'Retardo', 'Falta', 'Justificado')
--   - public.tipo_solicitud      ('Permiso sin goce de sueldo', 'Permiso con goce de sueldo', 'Vacaciones', 'Vacaciones Pagadas', 'Incapacidad')
--   - public.estatus_solicitud   ('Pendiente_Jefe', 'Aprobado_Jefe', 'Pendiente_RH', 'Rechazado', 'Completado')
--   - public.estatus_ticket      ('Abierto', 'En_Revision', 'Resuelto', 'Rechazado')
--   - public.tipo_interaccion    ('Like', 'Comentario', 'Acuse_Recibo', 'Celebrar', 'Interesante', 'Apoyo')
--   - public.estatus_moderacion  ('Pendiente', 'Aprobado', 'Rechazado')
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. FUNCIONES AUXILIARES SECURITY DEFINER (Evitan recursión infinita en RLS)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.es_usuario_rh()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.colaboradores c
    WHERE (
      c.id = auth.uid()
      OR LOWER(c.correo_corporativo) = LOWER(COALESCE(auth.jwt() ->> 'email', ''))
    )
    AND c.rol_sistema = 'Recursos Humanos'::public.rol_sistema
    AND COALESCE(c.estatus, 'Activo'::public.estatus_colaborador) = 'Activo'::public.estatus_colaborador
  );
$$;

CREATE OR REPLACE FUNCTION public.es_jefe_directo_de(target_colaborador_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.colaboradores sub
    JOIN public.colaboradores jefe
      ON (
        jefe.id = auth.uid()
        OR LOWER(jefe.correo_corporativo) = LOWER(COALESCE(auth.jwt() ->> 'email', ''))
      )
    WHERE sub.id = target_colaborador_id
      AND COALESCE(jefe.estatus, 'Activo'::public.estatus_colaborador) = 'Activo'::public.estatus_colaborador
      AND (
        sub.jefe_directo_id = jefe.id
        OR LOWER(TRIM(COALESCE(sub.jefe_directo, ''))) = LOWER(TRIM(COALESCE(jefe.nombre_completo, '')))
        OR LOWER(TRIM(COALESCE(sub.jefe_directo, ''))) = LOWER(jefe.id::text)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.es_usuario_rh() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.es_usuario_rh() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.es_jefe_directo_de(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.es_jefe_directo_de(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. POLÍTICAS RLS EN TABLA: public.colaboradores
-- -----------------------------------------------------------------------------
ALTER TABLE public.colaboradores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "colaboradores_select_aislado" ON public.colaboradores;
CREATE POLICY "colaboradores_select_aislado"
  ON public.colaboradores
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR LOWER(correo_corporativo) = LOWER(COALESCE(auth.jwt() ->> 'email', ''))
    OR public.es_usuario_rh()
    OR public.es_jefe_directo_de(id)
  );

DROP POLICY IF EXISTS "colaboradores_insert_solo_rh" ON public.colaboradores;
CREATE POLICY "colaboradores_insert_solo_rh"
  ON public.colaboradores
  FOR INSERT
  TO authenticated
  WITH CHECK (public.es_usuario_rh());

DROP POLICY IF EXISTS "colaboradores_update_solo_rh" ON public.colaboradores;
CREATE POLICY "colaboradores_update_solo_rh"
  ON public.colaboradores
  FOR UPDATE
  TO authenticated
  USING (public.es_usuario_rh())
  WITH CHECK (public.es_usuario_rh());

DROP POLICY IF EXISTS "colaboradores_delete_solo_rh" ON public.colaboradores;
CREATE POLICY "colaboradores_delete_solo_rh"
  ON public.colaboradores
  FOR DELETE
  TO authenticated
  USING (public.es_usuario_rh());

-- -----------------------------------------------------------------------------
-- 3. POLÍTICAS RLS EN TABLA: public.expedientes_documentos
-- -----------------------------------------------------------------------------
ALTER TABLE public.expedientes_documentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expedientes_doc_select_rh_o_propio" ON public.expedientes_documentos;
CREATE POLICY "expedientes_doc_select_rh_o_propio"
  ON public.expedientes_documentos
  FOR SELECT
  TO authenticated
  USING (
    colaborador_id = auth.uid()
    OR public.es_usuario_rh()
  );

DROP POLICY IF EXISTS "expedientes_doc_write_solo_rh" ON public.expedientes_documentos;
CREATE POLICY "expedientes_doc_write_solo_rh"
  ON public.expedientes_documentos
  FOR ALL
  TO authenticated
  USING (public.es_usuario_rh())
  WITH CHECK (public.es_usuario_rh());

-- -----------------------------------------------------------------------------
-- 4. POLÍTICAS RLS EN TABLA: public.asistencias
-- -----------------------------------------------------------------------------
ALTER TABLE public.asistencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "asistencias_select_aislado" ON public.asistencias;
CREATE POLICY "asistencias_select_aislado"
  ON public.asistencias
  FOR SELECT
  TO authenticated
  USING (
    colaborador_id = auth.uid()
    OR public.es_usuario_rh()
    OR public.es_jefe_directo_de(colaborador_id)
  );

DROP POLICY IF EXISTS "asistencias_insert_propio_o_rh" ON public.asistencias;
CREATE POLICY "asistencias_insert_propio_o_rh"
  ON public.asistencias
  FOR INSERT
  TO authenticated
  WITH CHECK (
    colaborador_id = auth.uid()
    OR public.es_usuario_rh()
  );

DROP POLICY IF EXISTS "asistencias_update_propio_o_rh" ON public.asistencias;
CREATE POLICY "asistencias_update_propio_o_rh"
  ON public.asistencias
  FOR UPDATE
  TO authenticated
  USING (
    colaborador_id = auth.uid()
    OR public.es_usuario_rh()
  )
  WITH CHECK (
    colaborador_id = auth.uid()
    OR public.es_usuario_rh()
  );

-- -----------------------------------------------------------------------------
-- 5. POLÍTICAS RLS EN TABLA: public.tickets_asistencia
-- -----------------------------------------------------------------------------
ALTER TABLE public.tickets_asistencia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tickets_asistencia_select_aislado" ON public.tickets_asistencia;
CREATE POLICY "tickets_asistencia_select_aislado"
  ON public.tickets_asistencia
  FOR SELECT
  TO authenticated
  USING (
    colaborador_id = auth.uid()
    OR public.es_usuario_rh()
    OR public.es_jefe_directo_de(colaborador_id)
  );

DROP POLICY IF EXISTS "tickets_asistencia_insert_propio_o_rh" ON public.tickets_asistencia;
CREATE POLICY "tickets_asistencia_insert_propio_o_rh"
  ON public.tickets_asistencia
  FOR INSERT
  TO authenticated
  WITH CHECK (
    colaborador_id = auth.uid()
    OR public.es_usuario_rh()
  );

DROP POLICY IF EXISTS "tickets_asistencia_update_solo_rh" ON public.tickets_asistencia;
CREATE POLICY "tickets_asistencia_update_solo_rh"
  ON public.tickets_asistencia
  FOR UPDATE
  TO authenticated
  USING (public.es_usuario_rh())
  WITH CHECK (public.es_usuario_rh());

-- -----------------------------------------------------------------------------
-- 6. POLÍTICAS RLS EN TABLA: public.solicitudes
-- -----------------------------------------------------------------------------
ALTER TABLE public.solicitudes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "solicitudes_select_aislado" ON public.solicitudes;
CREATE POLICY "solicitudes_select_aislado"
  ON public.solicitudes
  FOR SELECT
  TO authenticated
  USING (
    colaborador_id = auth.uid()
    OR public.es_usuario_rh()
    OR public.es_jefe_directo_de(colaborador_id)
  );

DROP POLICY IF EXISTS "solicitudes_insert_propio_o_rh" ON public.solicitudes;
CREATE POLICY "solicitudes_insert_propio_o_rh"
  ON public.solicitudes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    colaborador_id = auth.uid()
    OR public.es_usuario_rh()
  );

DROP POLICY IF EXISTS "solicitudes_update_rh_o_jefe" ON public.solicitudes;
CREATE POLICY "solicitudes_update_rh_o_jefe"
  ON public.solicitudes
  FOR UPDATE
  TO authenticated
  USING (
    public.es_usuario_rh()
    OR public.es_jefe_directo_de(colaborador_id)
  )
  WITH CHECK (
    public.es_usuario_rh()
    OR public.es_jefe_directo_de(colaborador_id)
  );

-- -----------------------------------------------------------------------------
-- 7. POLÍTICAS RLS EN TABLAS DEL MURO Y CALENDARIO RH
-- -----------------------------------------------------------------------------
ALTER TABLE public.muro_publicaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "muro_pub_select_authenticated" ON public.muro_publicaciones;
CREATE POLICY "muro_pub_select_authenticated"
  ON public.muro_publicaciones
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "muro_pub_write_solo_rh" ON public.muro_publicaciones;
CREATE POLICY "muro_pub_write_solo_rh"
  ON public.muro_publicaciones
  FOR ALL
  TO authenticated
  USING (public.es_usuario_rh())
  WITH CHECK (public.es_usuario_rh());

ALTER TABLE public.muro_interacciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "muro_inter_select_autenticados" ON public.muro_interacciones;
CREATE POLICY "muro_inter_select_autenticados"
  ON public.muro_interacciones
  FOR SELECT
  TO authenticated
  USING (
    tipo_interaccion <> 'Comentario'::public.tipo_interaccion
    OR estatus_moderacion = 'Aprobado'::public.estatus_moderacion
    OR colaborador_id = auth.uid()
    OR public.es_usuario_rh()
  );

DROP POLICY IF EXISTS "muro_inter_insert_propio" ON public.muro_interacciones;
CREATE POLICY "muro_inter_insert_propio"
  ON public.muro_interacciones
  FOR INSERT
  TO authenticated
  WITH CHECK (
    colaborador_id = auth.uid()
    OR public.es_usuario_rh()
  );

DROP POLICY IF EXISTS "muro_inter_update_propio_o_rh" ON public.muro_interacciones;
CREATE POLICY "muro_inter_update_propio_o_rh"
  ON public.muro_interacciones
  FOR UPDATE
  TO authenticated
  USING (
    colaborador_id = auth.uid()
    OR public.es_usuario_rh()
  )
  WITH CHECK (
    colaborador_id = auth.uid()
    OR public.es_usuario_rh()
  );

DROP POLICY IF EXISTS "muro_inter_delete_propio_o_rh" ON public.muro_interacciones;
CREATE POLICY "muro_inter_delete_propio_o_rh"
  ON public.muro_interacciones
  FOR DELETE
  TO authenticated
  USING (
    colaborador_id = auth.uid()
    OR public.es_usuario_rh()
  );

ALTER TABLE public.calendario_eventos_rh ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "calendario_rh_select_authenticated" ON public.calendario_eventos_rh;
CREATE POLICY "calendario_rh_select_authenticated"
  ON public.calendario_eventos_rh
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "calendario_rh_write_solo_rh" ON public.calendario_eventos_rh;
CREATE POLICY "calendario_rh_write_solo_rh"
  ON public.calendario_eventos_rh
  FOR ALL
  TO authenticated
  USING (public.es_usuario_rh())
  WITH CHECK (public.es_usuario_rh());

COMMIT;
