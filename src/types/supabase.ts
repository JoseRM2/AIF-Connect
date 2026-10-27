export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      colaboradores: {
        Row: {
          id: string;
          nombre_completo: string;
          nombre?: string;
          correo_corporativo?: string | null;
          correo?: string | null;
          puesto: string | null;
          area?: string | null;
          departamento?: string | null;
          empresa?: string | null;
          rol_sistema: string | null;
          es_jefatura?: boolean | null;
          rol?: "rh" | "colaborador";
          estatus: "Activo" | "Inactivo" | "activo" | "inactivo" | string;
          saldo_vacaciones: number | null;
          zonas_geocerca: Json;
          created_at: string;
          no_empleado?: string | null;
          anydesk?: string | null;
          tel_oficina?: string | null;
          ext_oficina?: string | null;
          codigo_posicion?: string | null;
          posicion?: string | null;
          posicion_autorizador?: string | null;
          jefe_directo?: string | null;
          jefe_directo_id?: string | null;
          oficina?: string | null;
          reclutador?: string | null;
          fecha_ingreso?: string | null;
          fecha_baja?: string | null;
          dia_cumpleanos?: number | null;
          mes_cumpleanos?: string | null;
          sexo?: string | null;
          rfc?: string | null;
          curp?: string | null;
          nss?: string | null;
          id2?: string | null;
          nivel_educativo?: string | null;
          telefono_personal?: string | null;
          correo_personal?: string | null;
          domicilio_completo?: string | null;
          sueldo?: number | null;
          bono?: number | null;
          total_compensacion?: number | null;
          salario_diario?: number | null;
          banco?: string | null;
          clabe?: string | null;
          nomina?: string | null;
          dias_pago?: string | null;
          infonavit?: string | null;
          aseguradora?: string | null;
          contacto_emergencia_nombre?: string | null;
          contacto_emergencia_numero?: string | null;
          beneficiario?: string | null;
          parentesco_beneficiario?: string | null;
          comprobante_estudios_url?: string | null;
          carta_recomendacion_url?: string | null;
        };
        Insert: {
          id?: string;
          nombre_completo: string;
          nombre?: string;
          correo_corporativo?: string | null;
          correo?: string | null;
          puesto?: string | null;
          area?: string | null;
          departamento?: string | null;
          empresa?: string | null;
          rol_sistema?: string | null;
          es_jefatura?: boolean | null;
          rol?: "rh" | "colaborador";
          estatus?: "Activo" | "Inactivo" | "activo" | "inactivo" | string;
          saldo_vacaciones?: number | null;
          zonas_geocerca?: Json;
          created_at?: string;
          no_empleado?: string | null;
          anydesk?: string | null;
          tel_oficina?: string | null;
          ext_oficina?: string | null;
          codigo_posicion?: string | null;
          posicion?: string | null;
          posicion_autorizador?: string | null;
          jefe_directo?: string | null;
          jefe_directo_id?: string | null;
          oficina?: string | null;
          reclutador?: string | null;
          fecha_ingreso?: string | null;
          fecha_baja?: string | null;
          dia_cumpleanos?: number | null;
          mes_cumpleanos?: string | null;
          sexo?: string | null;
          rfc?: string | null;
          curp?: string | null;
          nss?: string | null;
          id2?: string | null;
          nivel_educativo?: string | null;
          telefono_personal?: string | null;
          correo_personal?: string | null;
          domicilio_completo?: string | null;
          sueldo?: number | null;
          bono?: number | null;
          total_compensacion?: number | null;
          salario_diario?: number | null;
          banco?: string | null;
          clabe?: string | null;
          nomina?: string | null;
          dias_pago?: string | null;
          infonavit?: string | null;
          aseguradora?: string | null;
          contacto_emergencia_nombre?: string | null;
          contacto_emergencia_numero?: string | null;
          beneficiario?: string | null;
          parentesco_beneficiario?: string | null;
          comprobante_estudios_url?: string | null;
          carta_recomendacion_url?: string | null;
        };
        Update: {
          id?: string;
          nombre_completo?: string;
          nombre?: string;
          correo_corporativo?: string | null;
          correo?: string | null;
          puesto?: string | null;
          area?: string | null;
          departamento?: string | null;
          empresa?: string | null;
          rol_sistema?: string | null;
          es_jefatura?: boolean | null;
          rol?: "rh" | "colaborador";
          estatus?: "Activo" | "Inactivo" | "activo" | "inactivo" | string;
          saldo_vacaciones?: number | null;
          zonas_geocerca?: Json;
          created_at?: string;
          no_empleado?: string | null;
          anydesk?: string | null;
          tel_oficina?: string | null;
          ext_oficina?: string | null;
          codigo_posicion?: string | null;
          posicion?: string | null;
          posicion_autorizador?: string | null;
          jefe_directo?: string | null;
          jefe_directo_id?: string | null;
          oficina?: string | null;
          reclutador?: string | null;
          fecha_ingreso?: string | null;
          fecha_baja?: string | null;
          dia_cumpleanos?: number | null;
          mes_cumpleanos?: string | null;
          sexo?: string | null;
          rfc?: string | null;
          curp?: string | null;
          nss?: string | null;
          id2?: string | null;
          nivel_educativo?: string | null;
          telefono_personal?: string | null;
          correo_personal?: string | null;
          domicilio_completo?: string | null;
          sueldo?: number | null;
          bono?: number | null;
          total_compensacion?: number | null;
          salario_diario?: number | null;
          banco?: string | null;
          clabe?: string | null;
          nomina?: string | null;
          dias_pago?: string | null;
          infonavit?: string | null;
          aseguradora?: string | null;
          contacto_emergencia_nombre?: string | null;
          contacto_emergencia_numero?: string | null;
          beneficiario?: string | null;
          parentesco_beneficiario?: string | null;
          comprobante_estudios_url?: string | null;
          carta_recomendacion_url?: string | null;
        };
        Relationships: [];
      };
      asistencias: {
        Row: {
          id: string;
          colaborador_id: string;
          fecha: string;
          hora_entrada: string | null;
          hora_salida: string | null;
          ubicacion_entrada: Json | null;
          ubicacion_salida: Json | null;
          estatus: string;
          ticket_id?: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          colaborador_id: string;
          fecha: string;
          hora_entrada?: string | null;
          hora_salida?: string | null;
          ubicacion_entrada?: Json | null;
          ubicacion_salida?: Json | null;
          estatus?: string;
          ticket_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          colaborador_id?: string;
          fecha?: string;
          hora_entrada?: string | null;
          hora_salida?: string | null;
          ubicacion_entrada?: Json | null;
          ubicacion_salida?: Json | null;
          estatus?: string;
          ticket_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "asistencias_colaborador_id_fkey";
            columns: ["colaborador_id"];
            isOneToOne: false;
            referencedRelation: "colaboradores";
            referencedColumns: ["id"];
          }
        ];
      };
      tickets_asistencia: {
        Row: {
          id: string;
          colaborador_id: string;
          fecha_incidencia: string;
          motivo_omision: string;
          estatus: "Abierto" | "En_Revision" | "Resuelto" | "Rechazado";
          comentarios_rh: string | null;
          resuelto_por: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          colaborador_id: string;
          fecha_incidencia: string;
          motivo_omision: string;
          estatus?: "Abierto" | "En_Revision" | "Resuelto" | "Rechazado";
          comentarios_rh?: string | null;
          resuelto_por?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          colaborador_id?: string;
          fecha_incidencia?: string;
          motivo_omision?: string;
          estatus?: "Abierto" | "En_Revision" | "Resuelto" | "Rechazado";
          comentarios_rh?: string | null;
          resuelto_por?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tickets_asistencia_colaborador_id_fkey";
            columns: ["colaborador_id"];
            isOneToOne: false;
            referencedRelation: "colaboradores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tickets_asistencia_resuelto_por_fkey";
            columns: ["resuelto_por"];
            isOneToOne: false;
            referencedRelation: "colaboradores";
            referencedColumns: ["id"];
          }
        ];
      };
      solicitudes: {
        Row: {
          id: string;
          colaborador_id: string;
          tipo_solicitud: string;
          tipo?: string;
          fecha_inicio: string;
          fecha_fin: string;
          dias?: number | null;
          motivo: string | null;
          estatus:
            | "Pendiente_Jefe"
            | "Aprobado_Jefe"
            | "Pendiente_RH"
            | "Rechazado"
            | "Completado"
            | "Pendiente"
            | "Aprobado";
          created_at: string;
        };
        Insert: {
          id?: string;
          colaborador_id: string;
          tipo_solicitud: string;
          tipo?: string;
          fecha_inicio: string;
          fecha_fin: string;
          dias?: number | null;
          motivo?: string | null;
          estatus?:
            | "Pendiente_Jefe"
            | "Aprobado_Jefe"
            | "Pendiente_RH"
            | "Rechazado"
            | "Completado"
            | "Pendiente"
            | "Aprobado";
          created_at?: string;
        };
        Update: {
          id?: string;
          colaborador_id?: string;
          tipo_solicitud?: string;
          tipo?: string;
          fecha_inicio?: string;
          fecha_fin?: string;
          dias?: number | null;
          motivo?: string | null;
          estatus?:
            | "Pendiente_Jefe"
            | "Aprobado_Jefe"
            | "Pendiente_RH"
            | "Rechazado"
            | "Completado"
            | "Pendiente"
            | "Aprobado";
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "solicitudes_colaborador_id_fkey";
            columns: ["colaborador_id"];
            isOneToOne: false;
            referencedRelation: "colaboradores";
            referencedColumns: ["id"];
          }
        ];
      };
      muro_publicaciones: {
        Row: {
          id: string;
          autor_id?: string | null;
          titulo: string;
          contenido: string;
          categoria?: string | null;
          archivo_url?: string | null;
          imagen_url?: string | null;
          requiere_acuse: boolean;
          fecha_publicacion?: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          autor_id?: string | null;
          titulo: string;
          contenido: string;
          categoria?: string | null;
          archivo_url?: string | null;
          imagen_url?: string | null;
          requiere_acuse?: boolean;
          fecha_publicacion?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          autor_id?: string | null;
          titulo?: string;
          contenido?: string;
          categoria?: string | null;
          archivo_url?: string | null;
          imagen_url?: string | null;
          requiere_acuse?: boolean;
          fecha_publicacion?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "muro_publicaciones_autor_id_fkey";
            columns: ["autor_id"];
            isOneToOne: false;
            referencedRelation: "colaboradores";
            referencedColumns: ["id"];
          }
        ];
      };
      muro_interacciones: {
        Row: {
          id: string;
          publicacion_id: string;
          colaborador_id: string;
          tipo_interaccion:
            | "Like"
            | "Celebrar"
            | "Interesante"
            | "Apoyo"
            | "Comentario"
            | "Acuse_Recibo";
          contenido_comentario: string | null;
          estatus_moderacion: "Pendiente" | "Aprobado" | "Rechazado";
          created_at: string;
        };
        Insert: {
          id?: string;
          publicacion_id: string;
          colaborador_id: string;
          tipo_interaccion:
            | "Like"
            | "Celebrar"
            | "Interesante"
            | "Apoyo"
            | "Comentario"
            | "Acuse_Recibo";
          contenido_comentario?: string | null;
          estatus_moderacion?: "Pendiente" | "Aprobado" | "Rechazado";
          created_at?: string;
        };
        Update: {
          id?: string;
          publicacion_id?: string;
          colaborador_id?: string;
          tipo_interaccion?:
            | "Like"
            | "Celebrar"
            | "Interesante"
            | "Apoyo"
            | "Comentario"
            | "Acuse_Recibo";
          contenido_comentario?: string | null;
          estatus_moderacion?: "Pendiente" | "Aprobado" | "Rechazado";
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "muro_interacciones_colaborador_id_fkey";
            columns: ["colaborador_id"];
            isOneToOne: false;
            referencedRelation: "colaboradores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "muro_interacciones_publicacion_id_fkey";
            columns: ["publicacion_id"];
            isOneToOne: false;
            referencedRelation: "muro_publicaciones";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      estatus_solicitud:
        | "Pendiente_Jefe"
        | "Aprobado_Jefe"
        | "Pendiente_RH"
        | "Rechazado"
        | "Completado";
      estatus_ticket: "Abierto" | "En_Revision" | "Resuelto" | "Rechazado";
      tipo_interaccion_muro:
        | "Like"
        | "Celebrar"
        | "Interesante"
        | "Apoyo"
        | "Comentario"
        | "Acuse_Recibo";
      estatus_moderacion_muro: "Pendiente" | "Aprobado" | "Rechazado";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
