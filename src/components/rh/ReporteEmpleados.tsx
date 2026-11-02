"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { obtenerReporteVacacionesAction } from "@/app/actions/reportes";
import VisorDocumentoExpedienteModal from "@/components/rh/VisorDocumentoExpedienteModal";
import { DownloadIcon } from "@/components/ui/icons";
import { obtenerUrlPublicaExpediente } from "@/lib/storage/expedientes";
import { createClient } from "@/lib/supabase/client";
import type { Empleado } from "@/types/rh";

export type TipoReporteRH = "Empleados" | "Asistencia" | "Vacaciones";
export type FiltroEmpresaReporte = "Todas" | "AIF" | "ROYAL";

type FilaReporte = Record<string, string | number>;

/** Columnas que muestra la vista previa por tipo (null = todas las del reporte). */
const COLUMNAS_PREVIEW: Record<TipoReporteRH, string[] | null> = {
  Empleados: [
    "No. Empleado",
    "Nombre Completo",
    "Correo Corporativo",
    "Empresa",
    "Departamento",
    "Puesto",
    "Rol del Sistema",
    "Estatus",
    "Fecha de Ingreso",
  ],
  Asistencia: null,
  Vacaciones: null,
};
const LIMITE_FILAS_PREVIEW = 200;

const MESES_CORTOS = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
] as const;

const LABEL =
  "mb-1 block text-[8px] font-bold uppercase tracking-wider text-gray-800";
const CONTROL =
  "h-9 w-full rounded-sm border border-gray-300 bg-brand-surface px-3 text-xs font-medium text-gray-900 transition-colors focus:border-brand-dark focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500";

function obtenerRangoMesActual(): { inicio: string; fin: string } {
  const hoy = new Date();
  const anio = hoy.getFullYear();
  const mes = String(hoy.getMonth() + 1).padStart(2, "0");
  const ultimoDia = new Date(anio, hoy.getMonth() + 1, 0).getDate();
  return {
    inicio: `${anio}-${mes}-01`,
    fin: `${anio}-${mes}-${String(ultimoDia).padStart(2, "0")}`,
  };
}

function construirNombreArchivo(
  tipoReporte: TipoReporteRH,
  empresa: FiltroEmpresaReporte,
  fechaBase?: string
): string {
  const fechaRef = fechaBase ? new Date(`${fechaBase}T00:00:00`) : new Date();
  const fechaValida = Number.isNaN(fechaRef.getTime()) ? new Date() : fechaRef;
  const mesCorto = MESES_CORTOS[fechaValida.getMonth()] ?? "Oct";
  const anio = fechaValida.getFullYear();
  return `Reporte_${tipoReporte}_${empresa}_${mesCorto}${anio}.xlsx`;
}

function formatearHoraLegible(valor: string | null | undefined): string {
  if (!valor) return "Sin registro";
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(valor.trim())) {
    return valor.trim().slice(0, 5);
  }
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return String(valor);
  return fecha.toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatearFechaLegible(valor: string | null | undefined): string {
  if (!valor) return "N/A";
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor.trim())) return valor.trim();
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return String(valor);
  return fecha.toISOString().slice(0, 10);
}

function formatearUbicacionJson(ubicacion: unknown): string {
  if (!ubicacion || typeof ubicacion !== "object") return "N/A";
  const obj = ubicacion as Record<string, unknown>;
  const zona = obj.zona_nombre ?? obj.zona ?? "";
  const lat = obj.lat ?? obj.latitud;
  const lng = obj.lng ?? obj.longitud;
  if (zona && lat !== undefined && lng !== undefined) {
    return `${String(zona)} (${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)})`;
  }
  if (lat !== undefined && lng !== undefined) {
    return `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
  }
  return zona ? String(zona) : "Registrada";
}

function calcularDiasEntreFechas(inicio?: string | null, fin?: string | null): number {
  if (!inicio || !fin) return 1;
  const d1 = new Date(`${inicio}T00:00:00`);
  const d2 = new Date(`${fin}T00:00:00`);
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return 1;
  const diff = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return diff > 0 ? diff : 1;
}

function textoExcel(valor: unknown, porDefecto = ""): string {
  if (valor === null || valor === undefined) return porDefecto;
  const texto = String(valor).trim();
  return texto ? texto : porDefecto;
}

function numeroExcel(valor: unknown): number | string {
  if (valor === null || valor === undefined || valor === "") return "";
  const n = Number(valor);
  return Number.isFinite(n) ? n : "";
}

interface ColaboradorJoin {
  id?: string;
  nombre_completo?: string | null;
  nombre?: string | null;
  apellidos?: string | null;
  correo_corporativo?: string | null;
  correo?: string | null;
  empresa?: string | null;
  puesto?: string | null;
  departamento?: string | null;
  saldo_vacaciones?: number | null;
  comprobante_estudios_url?: string | null;
  carta_recomendacion_url?: string | null;
}

interface ColaboradorFiltroOption {
  id: string;
  nombreCompleto: string;
  departamento: string;
  empresa: string;
  comprobanteEstudiosUrl: string | null;
  cartaRecomendacionUrl: string | null;
}

function construirNombreCompletoReporte(colaborador: {
  nombre?: string | null;
  apellidos?: string | null;
  nombre_completo?: string | null;
}): string {
  const concatenado = `${colaborador.nombre ?? ""} ${colaborador.apellidos ?? ""}`.trim();
  if (concatenado) return concatenado;
  return (colaborador.nombre_completo ?? "").trim() || "Sin nombre";
}

function extraerColaboradorJoin(raw: unknown): ColaboradorJoin {
  if (!raw) return {};
  if (Array.isArray(raw)) {
    return (raw[0] as ColaboradorJoin) ?? {};
  }
  if (typeof raw === "object") {
    return raw as ColaboradorJoin;
  }
  return {};
}

export default function ReporteEmpleados({
  empleados = [],
}: {
  empleados?: Empleado[];
}) {
  const rangoInicial = obtenerRangoMesActual();

  const [tipoReporte, setTipoReporte] = useState<TipoReporteRH>("Empleados");
  const [empresa, setEmpresa] = useState<FiltroEmpresaReporte>("Todas");
  const [departamentoFiltro, setDepartamentoFiltro] = useState<string>("Todos");
  const [colaboradorId, setColaboradorId] = useState<string>("");
  const [busquedaColaborador, setBusquedaColaborador] = useState<string>("");
  const [comboboxAbierto, setComboboxAbierto] = useState<boolean>(false);
  const comboboxRef = useRef<HTMLDivElement | null>(null);

  const [catalogoColaboradores, setCatalogoColaboradores] = useState<
    ColaboradorFiltroOption[]
  >([]);
  const [visorColaboradorActivo, setVisorColaboradorActivo] =
    useState<ColaboradorFiltroOption | null>(null);

  const [fechaInicio, setFechaInicio] = useState<string>(rangoInicial.inicio);
  const [fechaFin, setFechaFin] = useState<string>(rangoInicial.fin);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isPreviewing, setIsPreviewing] = useState<boolean>(false);
  const [datosPreview, setDatosPreview] = useState<FilaReporte[] | null>(null);
  const [tipoPreview, setTipoPreview] = useState<TipoReporteRH>("Empleados");
  const [feedbackReporte, setFeedbackReporte] = useState<{
    tipo: "exito" | "alerta" | "error";
    mensaje: string;
  } | null>(null);

  const requiereRangoFechas =
    tipoReporte === "Asistencia" || tipoReporte === "Vacaciones";

  // Cargar catálogo dinámico de colaboradores y áreas/departamentos desde Supabase
  useEffect(() => {
    let activo = true;
    async function cargarCatalogoFiltros() {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("colaboradores")
          .select("*")
          .order("nombre_completo", { ascending: true });

        if (!activo || !data) return;

        const opciones: ColaboradorFiltroOption[] = data.map((c) => ({
          id: c.id,
          nombreCompleto: construirNombreCompletoReporte(c),
          departamento: (c.departamento ?? "General").trim() || "General",
          empresa: (c.empresa ?? "AIF").trim().toUpperCase(),
          comprobanteEstudiosUrl: c.comprobante_estudios_url ?? null,
          cartaRecomendacionUrl: c.carta_recomendacion_url ?? null,
        }));

        opciones.sort((a, b) =>
          a.nombreCompleto.localeCompare(b.nombreCompleto, "es")
        );
        setCatalogoColaboradores(opciones);
      } catch {
        // Fallback silencioso a la prop `empleados`
      }
    }
    cargarCatalogoFiltros();
    return () => {
      activo = false;
    };
  }, [empleados]);

  // Cerrar el Combobox de Colaborador Específico al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        comboboxRef.current &&
        !comboboxRef.current.contains(e.target as Node)
      ) {
        setComboboxAbierto(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const opcionesColaboradores = useMemo<ColaboradorFiltroOption[]>(() => {
    if (catalogoColaboradores.length > 0) return catalogoColaboradores;
    return empleados.map((e) => ({
      id: e.id,
      nombreCompleto: e.nombre,
      departamento: e.departamento || "General",
      empresa: e.empresa || "AIF",
      comprobanteEstudiosUrl: null,
      cartaRecomendacionUrl: null,
    }));
  }, [catalogoColaboradores, empleados]);

  const departamentosDisponibles = useMemo<string[]>(() => {
    const mapa = new Map<string, string>();
    for (const c of opcionesColaboradores) {
      const dep = c.departamento.trim();
      if (dep && dep.toLowerCase() !== "todos") {
        mapa.set(dep.toLowerCase(), dep);
      }
    }
    return Array.from(mapa.values()).sort((a, b) => a.localeCompare(b, "es"));
  }, [opcionesColaboradores]);

  const colaboradoresFiltradosCombobox = useMemo<
    ColaboradorFiltroOption[]
  >(() => {
    const termino = busquedaColaborador.trim().toLowerCase();
    return opcionesColaboradores.filter((c) => {
      if (empresa !== "Todas" && c.empresa !== empresa) return false;
      if (
        departamentoFiltro !== "Todos" &&
        c.departamento.toLowerCase() !== departamentoFiltro.toLowerCase()
      ) {
        return false;
      }
      if (!termino) return true;
      return c.nombreCompleto.toLowerCase().includes(termino);
    });
  }, [
    opcionesColaboradores,
    empresa,
    departamentoFiltro,
    busquedaColaborador,
  ]);

  const colaboradorSeleccionadoObj = useMemo(
    () => opcionesColaboradores.find((c) => c.id === colaboradorId) ?? null,
    [opcionesColaboradores, colaboradorId]
  );

  const mapaColaboradorPorNombre = useMemo(() => {
    const mapa = new Map<string, ColaboradorFiltroOption>();
    for (const c of opcionesColaboradores) {
      mapa.set(c.nombreCompleto.toLowerCase(), c);
    }
    return mapa;
  }, [opcionesColaboradores]);

  // Consulta a Supabase y transformación a filas legibles.
  // Compartida por la vista previa en pantalla y la exportación a Excel.
  const consultarFilas = async (): Promise<FilaReporte[]> => {
    const supabase = createClient();
    let filasExcel: FilaReporte[] = [];

    if (tipoReporte === "Empleados") {
      let query = supabase.from("colaboradores").select("*");

      if (empresa !== "Todas") {
        query = query.eq("empresa", empresa);
      }
      if (departamentoFiltro !== "Todos") {
        query = query.eq("departamento", departamentoFiltro);
      }
      if (colaboradorId) {
        query = query.eq("id", colaboradorId);
      }

      const { data, error } = await query.order("nombre_completo", {
        ascending: true,
      });

      if (error) {
        throw new Error(error.message);
      }

      const registros = data ?? [];

      if (registros.length > 0) {
        filasExcel = registros.map((item) => {
          const urlComprobantePublica =
            obtenerUrlPublicaExpediente(
              supabase,
              item.comprobante_estudios_url
            ) ?? "";
          const urlCartaPublica =
            obtenerUrlPublicaExpediente(
              supabase,
              item.carta_recomendacion_url
            ) ?? "";

          return {
            // Identificación y acceso
            "No. Empleado": textoExcel(item.no_empleado, "S/N"),
            "Nombre Completo": construirNombreCompletoReporte(item),
            "Correo Corporativo": textoExcel(
              item.correo_corporativo || item.correo
            ),
            Empresa: textoExcel(item.empresa, "AIF").toUpperCase(),
            Estatus: textoExcel(item.estatus, "Activo"),
            "Rol del Sistema": textoExcel(item.rol_sistema, "Colaborador"),
            AnyDesk: textoExcel(item.anydesk),
            "Teléfono de Oficina": textoExcel(item.tel_oficina),
            "Extensión": textoExcel(item.ext_oficina),

            // Corporativo
            Departamento: textoExcel(item.departamento, "General"),
            Puesto: textoExcel(item.puesto, "Sin puesto"),
            "Código de Posición": textoExcel(item.codigo_posicion),
            "Posición": textoExcel(item.posicion),
            "Posición Autorizador": textoExcel(item.posicion_autorizador),
            "Jefe Directo": textoExcel(item.jefe_directo),
            Oficina: textoExcel(item.oficina),
            Reclutador: textoExcel(item.reclutador),

            // Fechas y saldos
            "Fecha de Ingreso": formatearFechaLegible(
              item.fecha_ingreso ?? item.created_at
            ),
            "Fecha de Baja": item.fecha_baja
              ? formatearFechaLegible(item.fecha_baja)
              : "",
            "Motivo de Baja": textoExcel(item.motivo_baja),
            "Día de Cumpleaños": numeroExcel(item.dia_cumpleanos),
            "Mes de Cumpleaños": textoExcel(item.mes_cumpleanos),
            "Saldo de Vacaciones (Días)": Number(item.saldo_vacaciones ?? 0),

            // Personales
            Sexo: textoExcel(item.sexo),
            RFC: textoExcel(item.rfc),
            CURP: textoExcel(item.curp),
            NSS: textoExcel(item.nss),
            "ID 2": textoExcel(item.id2),
            "Nivel Educativo": textoExcel(item.nivel_educativo),
            "Teléfono Personal": textoExcel(item.telefono_personal),
            "Correo Personal": textoExcel(item.correo_personal),
            "Domicilio Completo": textoExcel(item.domicilio_completo),

            // Financieros y compensación
            Sueldo: numeroExcel(item.sueldo),
            Bono: numeroExcel(item.bono),
            "Total Compensación": numeroExcel(item.total_compensacion),
            "Salario Diario": numeroExcel(item.salario_diario),
            Banco: textoExcel(item.banco),
            CLABE: textoExcel(item.clabe),
            "Nómina": textoExcel(item.nomina),
            "Días de Pago": textoExcel(item.dias_pago),
            INFONAVIT: textoExcel(item.infonavit),
            Aseguradora: textoExcel(item.aseguradora),

            // Emergencia y beneficiarios
            "Contacto de Emergencia (Nombre)": textoExcel(
              item.contacto_emergencia_nombre
            ),
            "Contacto de Emergencia (Número)": textoExcel(
              item.contacto_emergencia_numero
            ),
            Beneficiario: textoExcel(item.beneficiario),
            "Parentesco del Beneficiario": textoExcel(
              item.parentesco_beneficiario
            ),

            // Archivos (URL pública obtenida vía supabase.storage.from('expedientes').getPublicUrl)
            "Comprobante de Estudios (URL)": urlComprobantePublica,
            "Carta de Recomendación (URL)": urlCartaPublica,
          };
        });
      } else if (empleados.length > 0) {
        // Respaldo con datos en memoria si la consulta retorna vacía
        const filtradosLocal = empleados.filter((e) => {
          if (empresa !== "Todas" && e.empresa !== empresa) return false;
          if (
            departamentoFiltro !== "Todos" &&
            (e.departamento || "General").toLowerCase() !==
              departamentoFiltro.toLowerCase()
          ) {
            return false;
          }
          if (colaboradorId && e.id !== colaboradorId) return false;
          return true;
        });
        filasExcel = filtradosLocal.map((e) => ({
          "No. Empleado": "S/N",
          "Nombre Completo": e.nombre,
          "Correo Corporativo": e.correo,
          Empresa: e.empresa,
          Departamento: e.departamento,
          Puesto: e.puesto,
          "Rol del Sistema": e.rol === "rh" ? "RH" : "Colaborador",
          Estatus: e.estatus === "activo" ? "Activo" : "Inactivo",
          "Fecha de Ingreso": "N/A",
          "Saldo de Vacaciones (Días)": 12,
        }));
      }
    } else if (tipoReporte === "Asistencia") {
      let query = supabase
        .from("asistencias")
        .select(
          "*, colaboradores!colaborador_id(id, nombre, apellidos, nombre_completo, correo_corporativo, empresa, puesto, departamento)"
        );

      if (colaboradorId) {
        query = query.eq("colaborador_id", colaboradorId);
      }
      if (fechaInicio) {
        query = query.gte("fecha", fechaInicio);
      }
      if (fechaFin) {
        query = query.lte("fecha", fechaFin);
      }

      const { data, error } = await query.order("fecha", { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      const registros = (data ?? []).filter((item) => {
        const colab = extraerColaboradorJoin(
          (item as Record<string, unknown>).colaboradores
        );
        if (
          empresa !== "Todas" &&
          (colab.empresa ?? "AIF").toUpperCase() !== empresa
        ) {
          return false;
        }
        if (
          departamentoFiltro !== "Todos" &&
          (colab.departamento ?? "General").trim().toLowerCase() !==
            departamentoFiltro.toLowerCase()
        ) {
          return false;
        }
        return true;
      });

      filasExcel = registros.map((item) => {
        const colab = extraerColaboradorJoin(
          (item as Record<string, unknown>).colaboradores
        );
        return {
          Fecha: formatearFechaLegible(item.fecha),
          "Nombre Completo": construirNombreCompletoReporte(colab),
          "Correo Corporativo":
            colab.correo_corporativo || colab.correo || "Sin correo",
          Empresa: (colab.empresa || "AIF").toUpperCase(),
          Departamento: colab.departamento || "General",
          Puesto: colab.puesto || "Sin puesto",
          "Hora de Entrada": formatearHoraLegible(item.hora_entrada),
          "Hora de Salida": formatearHoraLegible(item.hora_salida),
          "Estatus de Asistencia": item.estatus || "Puntual",
          "Ubicación de Entrada": formatearUbicacionJson(
            item.ubicacion_entrada
          ),
        };
      });
    } else if (tipoReporte === "Vacaciones") {
      // Consulta en servidor con `createAdminClient` para incluir todas las solicitudes
      // existentes de Colaboradores, Jefaturas y Recursos Humanos sin bloqueo de RLS
      const resultado = await obtenerReporteVacacionesAction({
        colaboradorId: colaboradorId || undefined,
        fechaInicio: fechaInicio || undefined,
        fechaFin: fechaFin || undefined,
      });

      if (!resultado.ok) {
        throw new Error(resultado.error);
      }

      const registros = resultado.registros.filter(({ colaborador }) => {
        const colab = (colaborador ?? {}) as Record<string, unknown>;
        if (
          empresa !== "Todas" &&
          String(colab.empresa ?? "AIF").toUpperCase() !== empresa
        ) {
          return false;
        }
        if (
          departamentoFiltro !== "Todos" &&
          String(colab.departamento ?? "General").trim().toLowerCase() !==
            departamentoFiltro.toLowerCase()
        ) {
          return false;
        }
        return true;
      });

      filasExcel = registros.map(({ solicitud: item, colaborador }) => {
        const colab = (colaborador ?? {}) as ColaboradorJoin & {
          rol_sistema?: string | null;
          es_jefatura?: boolean | null;
        };
        const rawItem = item as Record<string, unknown>;
        const diasCalculados =
          typeof rawItem.dias === "number" && rawItem.dias > 0
            ? rawItem.dias
            : calcularDiasEntreFechas(item.fecha_inicio, item.fecha_fin);

        const tipoTexto = String(
          item.tipo_solicitud || rawItem.tipo || "Vacaciones"
        );
        const esOtorgadaPorRH = tipoTexto
          .trim()
          .toLowerCase()
          .includes("pagadas");

        const rolBase = textoExcel(colab.rol_sistema, "Colaborador");
        const rolMostrar =
          rolBase === "Colaborador" && colab.es_jefatura
            ? "Jefatura"
            : rolBase;

        return {
          "Nombre Completo": construirNombreCompletoReporte(colab),
          "Correo Corporativo":
            colab.correo_corporativo || colab.correo || "Sin correo",
          Empresa: (colab.empresa || "AIF").toUpperCase(),
          Departamento: colab.departamento || "General",
          Puesto: colab.puesto || "Sin puesto",
          "Rol del Sistema": rolMostrar,
          "Tipo de Vacaciones": tipoTexto,
          "Otorgada / Autorizada por": esOtorgadaPorRH
            ? "Recursos Humanos (RH)"
            : "Jefe Directo",
          "Fecha Inicio": formatearFechaLegible(item.fecha_inicio),
          "Fecha Fin": formatearFechaLegible(item.fecha_fin),
          "Días Solicitados": diasCalculados,
          "Estatus de Solicitud": String(item.estatus || "Pendiente").replace(
            /_/g,
            " "
          ),
          "Saldo de Vacaciones (Días)": Number(colab.saldo_vacaciones ?? 0),
          "Motivo / Observaciones": item.motivo || "Sin observaciones",
        };
      });
    }
    return filasExcel;
  };

  const handleVerEnPantalla = async () => {
    if (isPreviewing || isExporting) return;

    if (
      requiereRangoFechas &&
      fechaInicio &&
      fechaFin &&
      fechaInicio > fechaFin
    ) {
      setFeedbackReporte({
        tipo: "error",
        mensaje:
          "La Fecha Inicio no puede ser posterior a la Fecha Fin. Verifica el rango seleccionado.",
      });
      return;
    }

    setIsPreviewing(true);
    setFeedbackReporte(null);

    try {
      const filas = await consultarFilas();

      if (filas.length === 0) {
        setDatosPreview(null);
        setFeedbackReporte({
          tipo: "alerta",
          mensaje: `No se encontraron registros de ${tipoReporte.toLowerCase()} para los filtros seleccionados (${
            empresa === "Todas" ? "Todas las empresas" : empresa
          }${
            requiereRangoFechas && (fechaInicio || fechaFin)
              ? `, del ${fechaInicio || "inicio"} al ${fechaFin || "actualidad"}`
              : ""
          }).`,
        });
        return;
      }

      setTipoPreview(tipoReporte);
      setDatosPreview(filas);
    } catch (err) {
      setDatosPreview(null);
      setFeedbackReporte({
        tipo: "error",
        mensaje:
          err instanceof Error
            ? `Error al consultar el reporte de ${tipoReporte}: ${err.message}`
            : "No fue posible consultar los datos. Intenta nuevamente.",
      });
    } finally {
      setIsPreviewing(false);
    }
  };

  const columnasPreview: string[] = datosPreview
    ? (COLUMNAS_PREVIEW[tipoPreview] ?? Object.keys(datosPreview[0] ?? {})).filter(
        (col) => datosPreview.length === 0 || col in datosPreview[0]
      )
    : [];
  const filasVisibles = datosPreview
    ? datosPreview.slice(0, LIMITE_FILAS_PREVIEW)
    : [];

  const handleGenerarExcel = async () => {
    if (isExporting || isPreviewing) return;

    if (
      requiereRangoFechas &&
      fechaInicio &&
      fechaFin &&
      fechaInicio > fechaFin
    ) {
      setFeedbackReporte({
        tipo: "error",
        mensaje:
          "La Fecha Inicio no puede ser posterior a la Fecha Fin. Verifica el rango seleccionado.",
      });
      return;
    }

    setIsExporting(true);
    setFeedbackReporte(null);

    try {
      const filasExcel = await consultarFilas();

      if (filasExcel.length === 0) {
        setFeedbackReporte({
          tipo: "alerta",
          mensaje: `No se encontraron registros de ${tipoReporte.toLowerCase()} para los filtros seleccionados (${
            empresa === "Todas" ? "Todas las empresas" : empresa
          }${
            requiereRangoFechas && (fechaInicio || fechaFin)
              ? `, del ${fechaInicio || "inicio"} al ${fechaFin || "actualidad"}`
              : ""
          }).`,
        });
        return;
      }

      // Construcción del libro de Excel (.xlsx) con SheetJS
      const worksheet = XLSX.utils.json_to_sheet(filasExcel);

      // Ajuste automático de ancho de columnas para lectura ejecutiva en nómina/auditoría
      const encabezados = Object.keys(filasExcel[0] ?? {});
      worksheet["!cols"] = encabezados.map((key) => {
        const maxLen = filasExcel.reduce((acc, row) => {
          const val = String(row[key] ?? "");
          return Math.max(acc, val.length);
        }, key.length);
        return { wch: Math.min(Math.max(maxLen + 4, 14), 42) };
      });

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, tipoReporte);

      const nombreArchivo = construirNombreArchivo(
        tipoReporte,
        empresa,
        requiereRangoFechas ? fechaInicio : undefined
      );

      XLSX.writeFile(workbook, nombreArchivo);

      setFeedbackReporte({
        tipo: "exito",
        mensaje: `Archivo "${nombreArchivo}" generado con éxito (${filasExcel.length} ${
          filasExcel.length === 1 ? "registro exportado" : "registros exportados"
        }).`,
      });
    } catch (err) {
      setFeedbackReporte({
        tipo: "error",
        mensaje:
          err instanceof Error
            ? `Error al generar el reporte de ${tipoReporte}: ${err.message}`
            : "No fue posible generar el archivo Excel. Intenta nuevamente.",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <section className="rounded-sm bg-brand-surface p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
        <div>
          <h2 className="text-base font-bold text-gray-900">
            Motor de Reportes y Auditoría (.XLSX)
          </h2>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
            EXPORTACIÓN DE SÁBANAS DE DATOS PARA NÓMINA, ASISTENCIA Y CONTROL DE VACACIONES
          </p>
        </div>
        <span className="rounded-sm border border-brand-gold/40 bg-brand-beige/40 px-2.5 py-1 text-[8px] font-bold uppercase tracking-widest text-brand-dark">
          SHEETJS • EXCEL CORPORATIVO
        </span>
      </div>

      <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* 1. Selector Tipo de Reporte */}
        <div>
          <label htmlFor="reporte-tipo" className={LABEL}>
            TIPO DE REPORTE
          </label>
          <select
            id="reporte-tipo"
            value={tipoReporte}
            onChange={(e) => {
              const nuevoTipo = e.target.value as TipoReporteRH;
              setTipoReporte(nuevoTipo);
              if (nuevoTipo === "Vacaciones") {
                setFechaInicio("");
                setFechaFin("");
              } else if (nuevoTipo === "Asistencia" && !fechaInicio && !fechaFin) {
                const rango = obtenerRangoMesActual();
                setFechaInicio(rango.inicio);
                setFechaFin(rango.fin);
              }
              setFeedbackReporte(null);
              setDatosPreview(null);
            }}
            className={CONTROL}
          >
            <option value="Empleados">Empleados (Directorio / Nómina)</option>
            <option value="Asistencia">Asistencia (Entradas y Salidas)</option>
            <option value="Vacaciones">
              Vacaciones (Colaboradores, Jefaturas y RH)
            </option>
          </select>
        </div>

        {/* 2. Selector Empresa */}
        <div>
          <label htmlFor="reporte-empresa" className={LABEL}>
            EMPRESA CORPORATIVA
          </label>
          <select
            id="reporte-empresa"
            value={empresa}
            onChange={(e) => {
              setEmpresa(e.target.value as FiltroEmpresaReporte);
              setFeedbackReporte(null);
              setDatosPreview(null);
            }}
            className={CONTROL}
          >
            <option value="Todas">Todas (AIF + ROYAL)</option>
            <option value="AIF">AIF</option>
            <option value="ROYAL">ROYAL</option>
          </select>
        </div>

        {/* 3. Selector Área / Departamento */}
        <div>
          <label htmlFor="reporte-departamento" className={LABEL}>
            ÁREA / DEPARTAMENTO
          </label>
          <select
            id="reporte-departamento"
            value={departamentoFiltro}
            onChange={(e) => {
              setDepartamentoFiltro(e.target.value);
              setFeedbackReporte(null);
              setDatosPreview(null);
            }}
            className={CONTROL}
          >
            <option value="Todos">Todas las áreas / departamentos</option>
            {departamentosDisponibles.map((dep) => (
              <option key={dep} value={dep}>
                {dep}
              </option>
            ))}
          </select>
        </div>

        {/* 4. Combobox con búsqueda: Colaborador Específico */}
        <div ref={comboboxRef} className="relative">
          <label htmlFor="reporte-colaborador-combobox" className={LABEL}>
            COLABORADOR ESPECÍFICO
          </label>
          <div className="flex items-center gap-1.5">
            <input
              id="reporte-colaborador-combobox"
              type="text"
              role="combobox"
              aria-expanded={comboboxAbierto}
              aria-controls="lista-colaboradores-reporte"
              aria-autocomplete="list"
              value={
                comboboxAbierto
                  ? busquedaColaborador
                  : colaboradorSeleccionadoObj
                  ? colaboradorSeleccionadoObj.nombreCompleto
                  : busquedaColaborador
              }
              onFocus={() => {
                setComboboxAbierto(true);
              }}
              onChange={(e) => {
                setBusquedaColaborador(e.target.value);
                if (colaboradorId) {
                  setColaboradorId("");
                }
                setComboboxAbierto(true);
                setFeedbackReporte(null);
                setDatosPreview(null);
              }}
              placeholder="Todos los colaboradores (Buscar por nombre...)"
              className={CONTROL}
            />
            {(colaboradorId || busquedaColaborador) && (
              <button
                type="button"
                onClick={() => {
                  setColaboradorId("");
                  setBusquedaColaborador("");
                  setComboboxAbierto(false);
                  setFeedbackReporte(null);
                  setDatosPreview(null);
                }}
                title="Limpiar filtro de colaborador"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-gray-200 bg-brand-beige/40 text-xs font-bold text-gray-600 transition-colors hover:bg-brand-beige"
              >
                ✕
              </button>
            )}
          </div>

          {comboboxAbierto && (
            <ul
              id="lista-colaboradores-reporte"
              role="listbox"
              className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-y-auto rounded-sm border border-gray-200 bg-brand-surface py-1 shadow-xl"
            >
              <li role="option" aria-selected={colaboradorId === ""}>
                <button
                  type="button"
                  onClick={() => {
                    setColaboradorId("");
                    setBusquedaColaborador("");
                    setComboboxAbierto(false);
                    setFeedbackReporte(null);
                    setDatosPreview(null);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors hover:bg-brand-beige/50 ${
                    colaboradorId === ""
                      ? "bg-brand-beige/40 font-bold text-brand-dark"
                      : "text-gray-700"
                  }`}
                >
                  <span>Todos los colaboradores</span>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">
                    TODOS
                  </span>
                </button>
              </li>

              {colaboradoresFiltradosCombobox.length === 0 ? (
                <li className="px-3 py-2.5 text-xs text-gray-400">
                  No se encontraron colaboradores con ese nombre.
                </li>
              ) : (
                colaboradoresFiltradosCombobox.map((c) => {
                  const seleccionado = colaboradorId === c.id;
                  return (
                    <li key={c.id} role="option" aria-selected={seleccionado}>
                      <button
                        type="button"
                        onClick={() => {
                          setColaboradorId(c.id);
                          setBusquedaColaborador("");
                          setComboboxAbierto(false);
                          setFeedbackReporte(null);
                          setDatosPreview(null);
                        }}
                        className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-brand-beige/50 ${
                          seleccionado
                            ? "bg-brand-beige/60 font-bold text-brand-dark"
                            : "text-gray-800"
                        }`}
                      >
                        <span className="truncate">{c.nombreCompleto}</span>
                        <span className="shrink-0 text-[9px] font-bold uppercase tracking-widest text-gray-400">
                          {c.departamento} · {c.empresa}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          )}
        </div>

        {/* 5. Fecha Inicio */}
        <div>
          <label htmlFor="reporte-fecha-inicio" className={LABEL}>
            FECHA INICIO{" "}
            {!requiereRangoFechas && (
              <span className="font-normal text-gray-300">(OPCIONAL)</span>
            )}
          </label>
          <input
            id="reporte-fecha-inicio"
            type="date"
            value={fechaInicio}
            disabled={!requiereRangoFechas}
            onChange={(e) => {
              setFechaInicio(e.target.value);
              setFeedbackReporte(null);
              setDatosPreview(null);
            }}
            className={CONTROL}
          />
        </div>

        {/* 6. Fecha Fin */}
        <div>
          <label htmlFor="reporte-fecha-fin" className={LABEL}>
            FECHA FIN{" "}
            {!requiereRangoFechas && (
              <span className="font-normal text-gray-300">(OPCIONAL)</span>
            )}
          </label>
          <input
            id="reporte-fecha-fin"
            type="date"
            value={fechaFin}
            disabled={!requiereRangoFechas}
            onChange={(e) => {
              setFechaFin(e.target.value);
              setFeedbackReporte(null);
              setDatosPreview(null);
            }}
            className={CONTROL}
          />
        </div>
      </div>

      {/* Acciones: vista previa (secundaria) y exportación (principal) */}
      <div className="mt-4 flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={handleVerEnPantalla}
          disabled={isPreviewing || isExporting}
          className="h-10 rounded-sm bg-brand-beige px-5 text-[9px] font-bold uppercase tracking-widest text-brand-dark transition-colors hover:bg-brand-beige/70 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPreviewing ? "CONSULTANDO..." : "VER EN PANTALLA"}
        </button>
        <button
          type="button"
          onClick={handleGenerarExcel}
          disabled={isExporting || isPreviewing}
          className="flex h-10 items-center justify-center gap-2 rounded-sm bg-brand-dark px-5 text-[9px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-brand-dark/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <DownloadIcon className="h-3.5 w-3.5 text-brand-gold" />
          {isExporting ? "GENERANDO EXCEL..." : "GENERAR REPORTE EXCEL"}
        </button>
      </div>

      {feedbackReporte && (
        <div
          role="status"
          aria-live="polite"
          className={`mt-4 rounded-sm border px-4 py-2.5 text-xs font-semibold ${
            feedbackReporte.tipo === "exito"
              ? "border-status-success/30 bg-status-success/10 text-status-success-dark"
              : feedbackReporte.tipo === "alerta"
              ? "border-brand-gold/40 bg-brand-beige/40 text-brand-dark"
              : "border-status-danger/30 bg-status-danger/10 text-status-danger-dark"
          }`}
        >
          {feedbackReporte.mensaje}
        </div>
      )}

      {datosPreview && (
        <div className="mt-5">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Previsualización de reporte · {tipoPreview}
            </h3>
            <p role="status" aria-live="polite" className="text-xs text-gray-500">
              {datosPreview.length > LIMITE_FILAS_PREVIEW
                ? `Mostrando ${LIMITE_FILAS_PREVIEW} de ${datosPreview.length} registros. `
                : `${datosPreview.length} ${
                    datosPreview.length === 1 ? "registro" : "registros"
                  }. `}
              El Excel incluye todos los registros
              {COLUMNAS_PREVIEW[tipoPreview] ? " y todas las columnas" : ""}.
            </p>
          </div>

          <div className="max-h-96 overflow-auto rounded-sm border border-gray-100 bg-white">
            <table
              className="w-full min-w-max border-collapse"
              aria-label={`Previsualización de reporte de ${tipoPreview}`}
            >
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="border-b border-gray-200">
                  {columnasPreview.map((col) => (
                    <th
                      key={col}
                      scope="col"
                      className="whitespace-nowrap px-3.5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500"
                    >
                      {col}
                    </th>
                  ))}
                  <th
                    scope="col"
                    className="whitespace-nowrap px-3.5 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-500"
                  >
                    Expediente Digital
                  </th>
                </tr>
              </thead>
              <tbody>
                {filasVisibles.map((fila, idx) => {
                  const nombreFila = String(
                    fila["Nombre Completo"] ?? ""
                  ).trim();
                  const colabInfo =
                    mapaColaboradorPorNombre.get(nombreFila.toLowerCase()) ??
                    null;
                  const urlCompFila = String(
                    fila["Comprobante de Estudios (URL)"] ??
                      colabInfo?.comprobanteEstudiosUrl ??
                      ""
                  ).trim();
                  const urlCartaFila = String(
                    fila["Carta de Recomendación (URL)"] ??
                      colabInfo?.cartaRecomendacionUrl ??
                      ""
                  ).trim();
                  const tieneAlgunDocumento = Boolean(
                    urlCompFila || urlCartaFila
                  );

                  return (
                    <tr
                      key={idx}
                      className="border-t border-gray-100 transition-colors hover:bg-gray-50"
                    >
                      {columnasPreview.map((col) => {
                        const valor = fila[col];
                        const texto =
                          valor === undefined || valor === null || valor === ""
                            ? "—"
                            : String(valor);
                        return (
                          <td
                            key={col}
                            className="whitespace-nowrap px-3.5 py-2 text-xs text-gray-800"
                          >
                            {texto}
                          </td>
                        );
                      })}
                      <td className="whitespace-nowrap px-3.5 py-2 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setVisorColaboradorActivo({
                              id: colabInfo?.id ?? `row-${idx}`,
                              nombreCompleto: nombreFila || "Colaborador",
                              departamento: String(
                                fila.Departamento ??
                                  colabInfo?.departamento ??
                                  "General"
                              ),
                              empresa: String(
                                fila.Empresa ?? colabInfo?.empresa ?? "AIF"
                              ),
                              comprobanteEstudiosUrl: urlCompFila || null,
                              cartaRecomendacionUrl: urlCartaFila || null,
                            })
                          }
                          className={`rounded-sm border px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest transition-colors ${
                            tieneAlgunDocumento
                              ? "border-brand-dark bg-brand-surface text-brand-dark hover:bg-brand-dark hover:text-brand-gold"
                              : "border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100"
                          }`}
                        >
                          {tieneAlgunDocumento
                            ? "Ver Documento"
                            : "Ver Expediente (Vacío)"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {visorColaboradorActivo && (
        <VisorDocumentoExpedienteModal
          nombreColaborador={visorColaboradorActivo.nombreCompleto}
          comprobanteEstudiosUrl={
            visorColaboradorActivo.comprobanteEstudiosUrl
          }
          cartaRecomendacionUrl={visorColaboradorActivo.cartaRecomendacionUrl}
          onCerrar={() => setVisorColaboradorActivo(null)}
        />
      )}
    </section>
  );
}
