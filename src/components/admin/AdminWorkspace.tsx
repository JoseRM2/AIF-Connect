"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  importarColaboradoresMasivoAdminAction,
  type CrearColaboradorPayload,
  type ResultadoImportacionMasivaAdmin,
} from "@/app/actions/colaboradores";
import {
  actualizarEstatusReporteErrorAction,
  eliminarReporteErrorAction,
  obtenerReportesErroresAction,
  type EstatusReporteError,
  type ReporteErrorRow,
  type SeveridadError,
} from "@/app/actions/errores";
import { MODULOS_PLATAFORMA } from "@/components/errores/ReporteErroresWorkspace";
import {
  calcularAniosAntiguedadCumplidos,
  calcularDiasVacacionesPorAniosLft,
} from "@/lib/solicitudes";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  DownloadIcon,
  FileTextIcon,
  SearchIcon,
  TrashIcon,
} from "@/components/ui/icons";

const SEVERIDADES: {
  valor: SeveridadError;
  etiqueta: string;
  badgeClass: string;
}[] = [
  {
    valor: "Baja",
    etiqueta: "Baja",
    badgeClass: "border-gray-300 bg-gray-100 text-gray-700",
  },
  {
    valor: "Media",
    etiqueta: "Media",
    badgeClass: "border-brand-gold/50 bg-brand-beige text-brand-dark",
  },
  {
    valor: "Alta",
    etiqueta: "Alta",
    badgeClass:
      "border-status-warning/50 bg-status-warning/15 text-status-warning",
  },
  {
    valor: "Critica",
    etiqueta: "Crítica",
    badgeClass:
      "border-status-danger/50 bg-status-danger/15 text-status-danger-dark",
  },
];

const ESTATUS_CATALOGO: {
  valor: EstatusReporteError;
  etiqueta: string;
  badgeClass: string;
}[] = [
  {
    valor: "Abierto",
    etiqueta: "ABIERTO",
    badgeClass:
      "border-status-danger/40 bg-status-danger/10 text-status-danger-dark",
  },
  {
    valor: "En_Revision",
    etiqueta: "EN REVISIÓN",
    badgeClass:
      "border-status-warning/40 bg-status-warning/15 text-status-warning",
  },
  {
    valor: "Resuelto",
    etiqueta: "RESUELTO",
    badgeClass:
      "border-status-success/40 bg-status-success/15 text-status-success-dark",
  },
  {
    valor: "Descartado",
    etiqueta: "DESCARTADO",
    badgeClass: "border-gray-300 bg-gray-100 text-gray-600",
  },
];

function formatearFechaHora(iso?: string | null): string {
  if (!iso) return "Reciente";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function obtenerBadgeSeveridad(sev: string) {
  return (
    SEVERIDADES.find((s) => s.valor.toLowerCase() === sev.toLowerCase()) ??
    SEVERIDADES[1]
  );
}

function obtenerBadgeEstatus(est: string) {
  return (
    ESTATUS_CATALOGO.find((e) => e.valor.toLowerCase() === est.toLowerCase()) ??
    ESTATUS_CATALOGO[0]
  );
}

// =============================================================================
// UTILIDADES DE PARSEO DE EXCEL (49 COLUMNAS DE LA PLANTILLA OFICIAL)
// =============================================================================

function normalizarClaveColumna(clave: string): string {
  return clave
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function limpiarTextoCelda(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (
    !s ||
    s.toLowerCase() === "n/a" ||
    s.toLowerCase() === "na" ||
    s.toLowerCase() === "sin dato" ||
    s === "-"
  ) {
    return null;
  }
  return s;
}

function limpiarNumeroMoneda(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number" && Number.isFinite(val)) {
    return Math.round(val * 100) / 100;
  }
  const limpio = String(val)
    .replace(/[$,\s]/g, "")
    .trim();
  if (!limpio) return null;
  const num = Number(limpio);
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : null;
}

function parsearFechaExcel(val: unknown): string | null {
  if (val === null || val === undefined || val === "") return null;

  // Serial numérico de Excel (ej. 45200)
  if (typeof val === "number" && val > 10000 && val < 90000) {
    const utcDays = Math.floor(val - 25569);
    const ms = utcDays * 86400 * 1000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  }

  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return val.toISOString().slice(0, 10);
  }

  const texto = String(val).trim();
  if (!texto || texto === "-" || texto.toLowerCase() === "n/a") return null;

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) {
    return texto.slice(0, 10);
  }

  // DD/MM/YYYY o DD-MM-YYYY
  const matchDmy = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (matchDmy) {
    const d = matchDmy[1]!.padStart(2, "0");
    const m = matchDmy[2]!.padStart(2, "0");
    const yRaw = matchDmy[3]!;
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    return `${y}-${m}-${d}`;
  }

  const parsed = new Date(texto);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

function calcularSaldoVacacionesLft(
  fechaIngresoIso: string | null,
  antiguedadCelda: unknown
): number {
  let anios = 0;

  if (fechaIngresoIso) {
    anios = calcularAniosAntiguedadCumplidos(fechaIngresoIso);
  } else {
    const numAnt = limpiarNumeroMoneda(antiguedadCelda);
    if (numAnt !== null && numAnt >= 0 && numAnt < 60) {
      anios = Math.floor(numAnt);
    }
  }

  return calcularDiasVacacionesPorAniosLft(anios);
}

function extraerCorreoCorporativoUnico(
  raw: string | null | undefined,
  correosYaUsados?: Set<string>
): string {
  if (!raw) return "";
  // Extraer todos los correos válidos cuando una celda trae varios separados por ';', ',', '/' o espacios
  const coincidencias = raw.match(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
  );
  if (!coincidencias || coincidencias.length === 0) {
    return raw.split(/[;,/\s]+/)[0]?.trim().toLowerCase() ?? "";
  }
  const limpios = coincidencias.map((c) => c.trim().toLowerCase());

  if (correosYaUsados) {
    const disponibles = limpios.filter((c) => !correosYaUsados.has(c));
    if (disponibles.length > 0) {
      const dispAif = disponibles.find((c) => c.includes("@aif."));
      return dispAif ?? disponibles[0]!;
    }
  }

  // Priorizar el dominio corporativo @aif si vienen varios correos (ej. "rrhh2@tatuus.nl; rrhh2@aif.com.mx")
  const preferidoAif = limpios.find((c) => c.includes("@aif."));
  return preferidoAif ?? limpios[0]!;
}

function separarNombreCompleto(nombreCompleto: string): {
  nombre: string;
  apellidos: string;
} {
  const limpio = nombreCompleto.trim();
  // Si viene en formato "Apellidos, Nombre" (ej. "Rodriguez Casillas, David Leonardo")
  if (limpio.includes(",")) {
    const [parteApellidos, ...restoNombre] = limpio.split(",");
    return {
      nombre: restoNombre.join(" ").trim() || limpio,
      apellidos: (parteApellidos ?? "").trim(),
    };
  }

  const partes = limpio.split(/\s+/).filter(Boolean);
  if (partes.length <= 1) {
    return { nombre: limpio, apellidos: "" };
  }
  if (partes.length === 2) {
    return { nombre: partes[0]!, apellidos: partes[1]! };
  }
  const apellidos = partes.slice(-2).join(" ");
  const nombre = partes.slice(0, -2).join(" ");
  return { nombre, apellidos };
}

interface FilaPreviaImportacion {
  idTemporal: string;
  seleccionada: boolean;
  payload: CrearColaboradorPayload;
}

export interface AdminWorkspaceProps {
  todosLosReportesIniciales: ReporteErrorRow[];
  errorInicial?: string;
}

export default function AdminWorkspace({
  todosLosReportesIniciales,
  errorInicial,
}: AdminWorkspaceProps) {
  const [pestanaActiva, setPestanaActiva] = useState<
    "bandeja_errores" | "importar_excel"
  >("bandeja_errores");

  const [todosLosReportes, setTodosLosReportes] = useState<ReporteErrorRow[]>(
    todosLosReportesIniciales
  );
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [mensajeError, setMensajeError] = useState<string | null>(
    errorInicial ?? null
  );

  // Estado de la Bandeja Global de Errores
  const [filtroEstatus, setFiltroEstatus] = useState<string>("todos");
  const [filtroSeveridad, setFiltroSeveridad] = useState<string>("todas");
  const [filtroModulo, setFiltroModulo] = useState<string>("todos");
  const [busquedaAdmin, setBusquedaAdmin] = useState<string>("");
  const [reporteSeleccionado, setReporteSeleccionado] =
    useState<ReporteErrorRow | null>(todosLosReportesIniciales[0] ?? null);
  const [estatusEdicionAdmin, setEstatusEdicionAdmin] =
    useState<EstatusReporteError>(
      (todosLosReportesIniciales[0]?.estatus as EstatusReporteError) ??
        "Abierto"
    );
  const [notasEdicionAdmin, setNotasEdicionAdmin] = useState<string>(
    todosLosReportesIniciales[0]?.notas_admin ?? ""
  );
  const [guardandoAdmin, setGuardandoAdmin] = useState(false);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [recargando, setRecargando] = useState(false);
  const [imagenExpandidaUrl, setImagenExpandidaUrl] = useState<string | null>(
    null
  );

  // Estado de Importación Masiva Excel
  const [nombreArchivoExcel, setNombreArchivoExcel] = useState<string | null>(
    null
  );
  const [filasPrevias, setFilasPrevias] = useState<FilaPreviaImportacion[]>([]);
  const [procesandoExcel, setProcesandoExcel] = useState(false);
  const [importandoEnServidor, setImportandoEnServidor] = useState(false);
  const [resultadoImportacion, setResultadoImportacion] =
    useState<ResultadoImportacionMasivaAdmin | null>(null);
  const excelInputRef = useRef<HTMLInputElement | null>(null);

  const recargarReportes = useCallback(async () => {
    setRecargando(true);
    try {
      const res = await obtenerReportesErroresAction();
      if (res.ok) {
        setTodosLosReportes(res.todosLosReportes);
        setMensajeError(null);
      } else if (res.error) {
        setMensajeError(res.error);
      }
    } finally {
      setRecargando(false);
    }
  }, []);

  const handleSeleccionarReporteAdmin = (rep: ReporteErrorRow) => {
    setReporteSeleccionado(rep);
    setEstatusEdicionAdmin(
      (rep.estatus as EstatusReporteError) || "Abierto"
    );
    setNotasEdicionAdmin(rep.notas_admin ?? "");
  };

  const handleGuardarResolucionAdmin = async () => {
    if (!reporteSeleccionado || guardandoAdmin) return;

    setGuardandoAdmin(true);
    setMensajeError(null);
    setMensajeExito(null);

    try {
      const res = await actualizarEstatusReporteErrorAction({
        reporteId: reporteSeleccionado.id,
        estatus: estatusEdicionAdmin,
        notasAdmin: notasEdicionAdmin,
      });

      if (!res.ok || !res.reporte) {
        setMensajeError(
          res.error || "No se pudo actualizar el estatus del reporte."
        );
        return;
      }

      const actualizado = res.reporte;
      setTodosLosReportes((prev) =>
        prev.map((r) => (r.id === actualizado.id ? actualizado : r))
      );
      setReporteSeleccionado(actualizado);
      setMensajeExito(
        `Reporte actualizado a estatus "${obtenerBadgeEstatus(actualizado.estatus).etiqueta}".`
      );
    } finally {
      setGuardandoAdmin(false);
    }
  };

  const handleEliminarReporteAdmin = async (id: string) => {
    if (eliminandoId) return;
    setEliminandoId(id);
    setMensajeError(null);

    try {
      const res = await eliminarReporteErrorAction(id);
      if (!res.ok) {
        setMensajeError(res.error || "No se pudo eliminar el reporte.");
        return;
      }

      const restantes = todosLosReportes.filter((r) => r.id !== id);
      setTodosLosReportes(restantes);
      if (reporteSeleccionado?.id === id) {
        const siguiente = restantes[0] ?? null;
        setReporteSeleccionado(siguiente);
        setEstatusEdicionAdmin(
          (siguiente?.estatus as EstatusReporteError) || "Abierto"
        );
        setNotasEdicionAdmin(siguiente?.notas_admin ?? "");
      }
    } finally {
      setEliminandoId(null);
    }
  };

  // ===========================================================================
  // MANEJO DE ARCHIVO EXCEL DE USUARIOS DE PRUEBA (49 COLUMNAS)
  // ===========================================================================
  const handleSeleccionarExcel = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setMensajeError(null);
    setMensajeExito(null);
    setResultadoImportacion(null);
    setProcesandoExcel(true);
    setNombreArchivoExcel(file.name);

    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        setMensajeError("El archivo Excel no contiene hojas válidas.");
        return;
      }

      const sheet = workbook.Sheets[sheetName]!;
      const filasJson = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        sheet,
        { defval: "" }
      );

      if (filasJson.length === 0) {
        setMensajeError("La hoja de Excel está vacía.");
        return;
      }

      // 1. Pre-identificar todos los nombres que aparecen en la columna `JEFE DIRECTO`
      const nombresJefesEnExcel = new Set<string>();
      for (const rawRow of filasJson) {
        for (const [k, v] of Object.entries(rawRow)) {
          if (normalizarClaveColumna(k) === "jefedirecto") {
            const nombreJefe = limpiarTextoCelda(v);
            if (nombreJefe) {
              nombresJefesEnExcel.add(normalizarClaveColumna(nombreJefe));
            }
          }
        }
      }

      const parseadas: FilaPreviaImportacion[] = [];
      const correosUsadosEnLote = new Set<string>();

      filasJson.forEach((rawRow, idx) => {
        const mapaRow = new Map<string, unknown>();
        for (const [k, v] of Object.entries(rawRow)) {
          mapaRow.set(normalizarClaveColumna(k), v);
        }

        const obtener = (...claves: string[]): unknown => {
          for (const c of claves) {
            const norm = normalizarClaveColumna(c);
            if (mapaRow.has(norm)) {
              const val = mapaRow.get(norm);
              if (val !== "" && val !== null && val !== undefined) {
                return val;
              }
            }
          }
          return null;
        };

        const nombreCompleto =
          limpiarTextoCelda(
            obtener("PERSONAL", "NOMBRE COMPLETO", "COLABORADOR", "NOMBRE")
          ) ?? "";
        const correoRaw = extraerCorreoCorporativoUnico(
          limpiarTextoCelda(
            obtener("CORREO", "CORREO CORPORATIVO", "EMAIL")
          ),
          correosUsadosEnLote
        );
        if (correoRaw) {
          correosUsadosEnLote.add(correoRaw);
        }

        if (!nombreCompleto && !correoRaw) {
          return;
        }

        const { nombre, apellidos } = separarNombreCompleto(nombreCompleto);
        const departamento =
          limpiarTextoCelda(obtener("DEPARTAMENTO", "AREA")) ?? "General";
        const puesto =
          limpiarTextoCelda(obtener("PUESTO", "CARGO")) ?? "Colaborador";
        const codigoPosicion = limpiarTextoCelda(
          obtener("Código de la posición", "CODIGO DE LA POSICION")
        );
        const posicion = limpiarTextoCelda(obtener("Posición", "POSICION"));
        const codigoPosAutorizador = limpiarTextoCelda(
          obtener(
            "Código de la posición autorizador",
            "CODIGO DE LA POSICION AUTORIZADOR"
          )
        );
        const posAutorizador = limpiarTextoCelda(
          obtener("Posición del autorizador", "POSICION DEL AUTORIZADOR")
        );
        const posicionAutorizadorCombinada =
          posAutorizador && codigoPosAutorizador
            ? `${codigoPosAutorizador} - ${posAutorizador}`
            : posAutorizador ?? codigoPosAutorizador ?? null;

        const jefeDirecto = limpiarTextoCelda(obtener("JEFE DIRECTO"));
        const fechaIngreso =
          parsearFechaExcel(obtener("FECHA DE INGRESO")) ??
          new Date().toISOString().slice(0, 10);
        const diasAguinaldo = limpiarTextoCelda(
          obtener("DIAS DE AGUINALDO", "DIAS PAGO")
        );

        const estatusCelda = (
          limpiarTextoCelda(obtener("ESTATUS")) ?? "Activo"
        ).toLowerCase();
        const estatus: "Activo" | "Inactivo" | "Baja" = estatusCelda.includes(
          "inactiv"
        )
          ? "Inactivo"
          : estatusCelda.includes("baja")
          ? "Baja"
          : "Activo";

        const fechaBaja = parsearFechaExcel(obtener("FECHA DE BAJA"));
        const anydesk = limpiarTextoCelda(obtener("ANY DESK", "ANYDESK"));
        const telOficina = limpiarTextoCelda(
          obtener("TELEFONO", "TEL OFICINA")
        );
        const oficina = limpiarTextoCelda(obtener("OFICINA"));

        // EMPRESA: prioriza 2026 -> 2025 -> 2021 -> EMPRESA
        const empRaw = (
          limpiarTextoCelda(
            obtener(
              "EMPRESA IMSS 2026",
              "EMPRESA IMSS 2025",
              "EMPRESA IMSS 2021",
              "EMPRESA"
            )
          ) ?? "AIF"
        ).toUpperCase();
        const empresa: "AIF" | "ROYAL" = empRaw.includes("ROYAL")
          ? "ROYAL"
          : "AIF";

        const saldoVacaciones = calcularSaldoVacacionesLft(
          fechaIngreso,
          obtener("ANTIGÜEDAD", "ANTIGUEDAD")
        );

        const sueldo = limpiarNumeroMoneda(obtener("SUELDO"));
        const bono = limpiarNumeroMoneda(obtener("BONO"));
        const totalCompensacion = limpiarNumeroMoneda(
          obtener("TOTAL COMPENSACIÓN", "TOTAL COMPENSACION")
        );
        const salarioDiario = limpiarNumeroMoneda(
          obtener("SD", "SALARIO DIARIO")
        );

        const rfc = limpiarTextoCelda(obtener("RFC"))?.toUpperCase() ?? null;
        const curp = limpiarTextoCelda(obtener("CURP"))?.toUpperCase() ?? null;
        const nss = limpiarTextoCelda(obtener("NSS"));
        const id2 = limpiarTextoCelda(obtener("ID2"));
        const telefonoPersonal = limpiarTextoCelda(
          obtener("TELEFONO PERSONAL")
        );
        const correoPersonal =
          extraerCorreoCorporativoUnico(
            limpiarTextoCelda(
              obtener("CORREO ELECTRONICO PERSONAL", "CORREO PERSONAL")
            )
          ) || null;
        const domicilioCompleto = limpiarTextoCelda(
          obtener("DOMICILIO", "DOMICILIO COMPLETO")
        );
        const nivelEducativo = limpiarTextoCelda(obtener("NIVEL EDUCATIVO"));

        const compEstudiosRaw = limpiarTextoCelda(
          obtener("COMPROBANTE ESTUDIOS")
        );
        const comprobanteEstudiosUrl =
          compEstudiosRaw && /^https?:\/\//i.test(compEstudiosRaw)
            ? compEstudiosRaw
            : null;

        const cartaRecRaw = limpiarTextoCelda(
          obtener("CARTA DE RECOMENDACIÓN", "CARTA DE RECOMENDACION")
        );
        const cartaRecomendacionUrl =
          cartaRecRaw && /^https?:\/\//i.test(cartaRecRaw)
            ? cartaRecRaw
            : null;

        const banco = limpiarTextoCelda(obtener("BANCO"));
        const clabe = limpiarTextoCelda(obtener("CLABE"));
        const beneficiario = limpiarTextoCelda(obtener("BENEFICIARIO"));
        const parentescoBeneficiario = limpiarTextoCelda(
          obtener("PARENTESCO")
        );
        const sexo = limpiarTextoCelda(obtener("SEXO"));
        const nomina = limpiarTextoCelda(obtener("NOMINA"));
        const infonavit = limpiarTextoCelda(obtener("INFONAVIT"));
        const reclutador = limpiarTextoCelda(obtener("RECLUTADOR"));
        const contactoEmergenciaNumero = limpiarTextoCelda(
          obtener("NÚMERO DE EMERGENCIA", "NUMERO DE EMERGENCIA")
        );
        const contactoEmergenciaNombre = limpiarTextoCelda(
          obtener("NOMBRE DE CONTACTO DE EMERGENCIA")
        );

        const diaRaw = limpiarNumeroMoneda(obtener("DIA"));
        const diaCumpleanos =
          diaRaw !== null && diaRaw >= 1 && diaRaw <= 31
            ? Math.round(diaRaw)
            : null;
        const mesCumpleanos = limpiarTextoCelda(obtener("MES"));
        const aseguradora = limpiarTextoCelda(obtener("ASEGURADORA"));
        const noEmpleado = limpiarTextoCelda(
          obtener("NO. EMPLEADO", "NO EMPLEADO", "NUMERO DE EMPLEADO")
        );

        // Detección inteligente de Rol del Sistema ('Colaborador' | 'Jefatura' | 'Recursos Humanos')
        const depUpper = departamento.toUpperCase();
        const puestoUpper = puesto.toUpperCase();
        const esNombreDeJefe = nombresJefesEnExcel.has(
          normalizarClaveColumna(nombreCompleto)
        );
        const tienePuestoMando =
          /\b(DIRECTOR|DIRECTORA|GERENTE|SUBDIRECTOR|SOCIO|COORDINADOR|COORDINADORA|JEFE|JEFA|LIDER|LÍDER)\b/i.test(
            puestoUpper
          );

        let rolSistemaDetectado: "Colaborador" | "Jefatura" | "Recursos Humanos" =
          "Colaborador";
        if (
          depUpper.includes("RECURSOS HUMANOS") ||
          depUpper === "RH" ||
          puestoUpper.includes("RECURSOS HUMANOS")
        ) {
          rolSistemaDetectado = "Recursos Humanos";
        } else if (esNombreDeJefe || tienePuestoMando) {
          rolSistemaDetectado = "Jefatura";
        }

        parseadas.push({
          idTemporal: `excel-row-${idx}-${Date.now()}`,
          seleccionada: true,
          payload: {
            no_empleado: noEmpleado,
            nombre_completo: nombreCompleto,
            nombre,
            apellidos,
            correo_corporativo: correoRaw.toLowerCase(),
            departamento,
            puesto,
            codigo_posicion: codigoPosicion,
            posicion,
            posicion_autorizador: posicionAutorizadorCombinada,
            jefe_directo: jefeDirecto,
            jefe_directo_id: null,
            fecha_ingreso: fechaIngreso,
            dias_pago: diasAguinaldo,
            estatus,
            fecha_baja: fechaBaja,
            anydesk,
            tel_oficina: telOficina,
            oficina,
            empresa,
            rol_sistema: rolSistemaDetectado,
            es_jefatura:
              rolSistemaDetectado === "Jefatura" || esNombreDeJefe,
            saldo_vacaciones: saldoVacaciones,
            sueldo,
            bono,
            total_compensacion: totalCompensacion,
            salario_diario: salarioDiario,
            rfc,
            curp,
            nss,
            id2,
            telefono_personal: telefonoPersonal,
            correo_personal: correoPersonal,
            domicilio_completo: domicilioCompleto,
            nivel_educativo: nivelEducativo,
            comprobante_estudios_url: comprobanteEstudiosUrl,
            carta_recomendacion_url: cartaRecomendacionUrl,
            banco,
            clabe,
            beneficiario,
            parentesco_beneficiario: parentescoBeneficiario,
            sexo,
            nomina,
            infonavit,
            reclutador,
            contacto_emergencia_numero: contactoEmergenciaNumero,
            contacto_emergencia_nombre: contactoEmergenciaNombre,
            dia_cumpleanos: diaCumpleanos,
            mes_cumpleanos: mesCumpleanos,
            aseguradora,
            zonas_geocerca: [],
          },
        });
      });

      setFilasPrevias(parseadas);
      setMensajeExito(
        `Archivo "${file.name}" leído correctamente: ${parseadas.length} colaboradores detectados listos para revisar e importar.`
      );
    } catch {
      setMensajeError(
        "No fue posible procesar el archivo Excel. Verifica que sea un archivo .xlsx o .xls válido."
      );
    } finally {
      setProcesandoExcel(false);
      if (excelInputRef.current) {
        excelInputRef.current.value = "";
      }
    }
  };

  const actualizarCampoFilaPrevia = (
    idTemporal: string,
    cambios: Partial<CrearColaboradorPayload>
  ) => {
    setFilasPrevias((prev) =>
      prev.map((f) =>
        f.idTemporal === idTemporal
          ? {
              ...f,
              payload: {
                ...f.payload,
                ...cambios,
              },
            }
          : f
      )
    );
  };

  const alternarSeleccionFila = (idTemporal: string) => {
    setFilasPrevias((prev) =>
      prev.map((f) =>
        f.idTemporal === idTemporal
          ? { ...f, seleccionada: !f.seleccionada }
          : f
      )
    );
  };

  const handleEjecutarImportacionMasiva = async () => {
    const seleccionadas = filasPrevias
      .filter((f) => f.seleccionada)
      .map((f) => f.payload);

    if (seleccionadas.length === 0 || importandoEnServidor) return;

    setImportandoEnServidor(true);
    setMensajeError(null);
    setMensajeExito(null);

    try {
      const res = await importarColaboradoresMasivoAdminAction(seleccionadas);
      setResultadoImportacion(res);

      if (!res.ok) {
        setMensajeError(
          res.errorGeneral || "No fue posible completar la importación."
        );
        return;
      }

      setMensajeExito(
        `Importación completada: ${res.totalExitosos} de ${res.totalRecibidos} colaboradores registrados en Supabase Auth y Colaboradores (${res.jefeIdsEnlazados} relaciones de Jefe Directo vinculadas por UUID).`
      );
    } finally {
      setImportandoEnServidor(false);
    }
  };

  const handleDescargarCredencialesExcel = async () => {
    if (!resultadoImportacion || resultadoImportacion.resultados.length === 0) {
      return;
    }

    const XLSX = await import("xlsx");
    const filasExportar = resultadoImportacion.resultados.map((r) => ({
      "#": r.filaIndice,
      "Nombre Completo": r.nombreCompleto,
      "Correo Corporativo (Usuario)": r.correoCorporativo,
      "Contraseña Generada": !r.ok
        ? "— (No se creó por error)"
        : r.contrasenaGenerada ??
          "(Cuenta previa en Auth - conserva su contraseña)",
      "Empresa": r.empresa,
      "Rol Sistema": r.rolSistema,
      "Departamento": r.departamento,
      "Puesto": r.puesto,
      "Resultado": r.ok
        ? r.modo === "creado"
          ? "CREADO NUEVO"
          : "EXPEDIENTE ACTUALIZADO"
        : `ERROR: ${r.error ?? ""}`,
    }));

    const ws = XLSX.utils.json_to_sheet(filasExportar);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Credenciales_Prueba");
    XLSX.writeFile(
      wb,
      `Credenciales_Usuarios_AIF_Connect_${new Date()
        .toISOString()
        .slice(0, 10)}.xlsx`
    );
  };

  // KPIs para el Administrador del Sistema
  const kpisAdmin = useMemo(() => {
    let abiertos = 0;
    let enRevision = 0;
    let resueltos = 0;
    let criticos = 0;

    for (const r of todosLosReportes) {
      if (r.estatus === "Abierto") abiertos += 1;
      else if (r.estatus === "En_Revision") enRevision += 1;
      else if (r.estatus === "Resuelto") resueltos += 1;

      if (
        r.severidad === "Critica" &&
        r.estatus !== "Resuelto" &&
        r.estatus !== "Descartado"
      ) {
        criticos += 1;
      }
    }

    return {
      total: todosLosReportes.length,
      abiertos,
      enRevision,
      resueltos,
      criticos,
    };
  }, [todosLosReportes]);

  const reportesFiltradosAdmin = useMemo(() => {
    const q = busquedaAdmin.trim().toLowerCase();
    return todosLosReportes.filter((r) => {
      if (filtroEstatus !== "todos" && r.estatus !== filtroEstatus) {
        return false;
      }
      if (filtroSeveridad !== "todas" && r.severidad !== filtroSeveridad) {
        return false;
      }
      if (filtroModulo !== "todos" && r.modulo !== filtroModulo) {
        return false;
      }
      if (!q) return true;

      const texto = [
        r.titulo,
        r.descripcion,
        r.nombre_reportante,
        r.correo_reportante,
        r.modulo,
        r.categoria,
        r.ruta_origen ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return texto.includes(q);
    });
  }, [
    todosLosReportes,
    filtroEstatus,
    filtroSeveridad,
    filtroModulo,
    busquedaAdmin,
  ]);

  const totalSeleccionadasImportar = useMemo(
    () => filasPrevias.filter((f) => f.seleccionada).length,
    [filasPrevias]
  );

  return (
    <div className="flex flex-col px-8 py-8">
      {/* Encabezado exclusivo de Admin */}
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded-sm bg-brand-dark px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-brand-gold">
              ADMINISTRACIÓN TÉCNICA DEL SISTEMA
            </span>
            <span className="rounded-sm border border-brand-gold bg-brand-gold/20 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-brand-dark">
              ● ACCESO EXCLUSIVO ADMIN
            </span>
          </div>
          <h1 className="font-serif text-3xl font-black text-gray-900">
            Consola de Administración
          </h1>
          <p className="mt-1 text-xs font-medium text-gray-500">
            Gestión de reportes de errores de usuarios de prueba y carga masiva de expedientes desde Excel.
          </p>
        </div>

        {/* Selector de Pestañas de Admin */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-sm border border-gray-200 bg-brand-surface p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setPestanaActiva("bandeja_errores")}
              className={`rounded-sm px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-colors ${
                pestanaActiva === "bandeja_errores"
                  ? "bg-brand-dark text-brand-gold"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Bandeja de Errores ({todosLosReportes.length})
            </button>
            <button
              type="button"
              onClick={() => setPestanaActiva("importar_excel")}
              className={`rounded-sm px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-colors ${
                pestanaActiva === "importar_excel"
                  ? "bg-brand-dark text-brand-gold"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Importación Masiva Excel
            </button>
          </div>

          {pestanaActiva === "bandeja_errores" && (
            <button
              type="button"
              onClick={recargarReportes}
              disabled={recargando}
              className="rounded-sm border border-gray-200 bg-brand-surface px-3.5 py-2 text-[9px] font-bold uppercase tracking-widest text-gray-700 transition-colors hover:bg-brand-beige/60 disabled:opacity-50"
            >
              {recargando ? "ACTUALIZANDO..." : "ACTUALIZAR"}
            </button>
          )}
        </div>
      </header>

      {/* Alertas */}
      {mensajeExito && (
        <div
          role="status"
          className="mb-6 flex items-center justify-between gap-3 rounded-sm border border-status-success/40 bg-status-success/10 px-4 py-3 text-xs font-bold text-status-success-dark"
        >
          <span className="flex items-center gap-2">
            <CheckCircleIcon className="h-4 w-4 shrink-0" />
            {mensajeExito}
          </span>
          <button
            type="button"
            onClick={() => setMensajeExito(null)}
            className="text-[10px] uppercase tracking-widest underline"
          >
            CERRAR
          </button>
        </div>
      )}

      {mensajeError && (
        <div
          role="alert"
          className="mb-6 flex items-center justify-between gap-3 rounded-sm border border-status-danger/40 bg-status-danger/10 px-4 py-3 text-xs font-bold text-status-danger-dark"
        >
          <span className="flex items-center gap-2">
            <AlertTriangleIcon className="h-4 w-4 shrink-0" />
            {mensajeError}
          </span>
          <button
            type="button"
            onClick={() => setMensajeError(null)}
            className="text-[10px] uppercase tracking-widest underline"
          >
            CERRAR
          </button>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 1: BANDEJA GLOBAL DE REPORTES DE ERRORES
         ===================================================================== */}
      {pestanaActiva === "bandeja_errores" && (
        <section className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <div className="rounded-sm border border-gray-100 bg-brand-surface p-4 shadow-sm">
              <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">
                TOTAL REPORTES
              </span>
              <p className="mt-1 font-serif text-2xl font-black text-gray-900">
                {kpisAdmin.total}
              </p>
            </div>
            <div className="rounded-sm border border-status-danger/25 bg-brand-surface p-4 shadow-sm">
              <span className="text-[9px] font-bold uppercase tracking-widest text-status-danger-dark">
                ABIERTOS (PENDIENTES)
              </span>
              <p className="mt-1 font-serif text-2xl font-black text-status-danger-dark">
                {kpisAdmin.abiertos}
              </p>
            </div>
            <div className="rounded-sm border border-status-warning/25 bg-brand-surface p-4 shadow-sm">
              <span className="text-[9px] font-bold uppercase tracking-widest text-status-warning">
                EN REVISIÓN
              </span>
              <p className="mt-1 font-serif text-2xl font-black text-status-warning">
                {kpisAdmin.enRevision}
              </p>
            </div>
            <div className="rounded-sm border border-status-success/25 bg-brand-surface p-4 shadow-sm">
              <span className="text-[9px] font-bold uppercase tracking-widest text-status-success-dark">
                RESUELTOS
              </span>
              <p className="mt-1 font-serif text-2xl font-black text-status-success-dark">
                {kpisAdmin.resueltos}
              </p>
            </div>
            <div className="col-span-2 rounded-sm border border-brand-gold/40 bg-brand-dark p-4 text-white shadow-sm md:col-span-1">
              <span className="text-[9px] font-bold uppercase tracking-widest text-brand-gold">
                SEVERIDAD CRÍTICA
              </span>
              <p className="mt-1 font-serif text-2xl font-black text-white">
                {kpisAdmin.criticos}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 rounded-sm border border-gray-100 bg-brand-surface p-4 shadow-sm md:grid-cols-12">
            <div className="relative md:col-span-4">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={busquedaAdmin}
                onChange={(e) => setBusquedaAdmin(e.target.value)}
                placeholder="Buscar por usuario, correo, título o descripción..."
                className="h-9 w-full rounded-sm border border-gray-200 bg-brand-beige/20 pl-9 pr-3 text-xs text-gray-800 outline-none focus:border-brand-dark"
              />
            </div>

            <div className="md:col-span-3">
              <select
                value={filtroEstatus}
                onChange={(e) => setFiltroEstatus(e.target.value)}
                className="h-9 w-full rounded-sm border border-gray-200 bg-brand-beige/20 px-3 text-xs font-semibold text-gray-800 outline-none focus:border-brand-dark"
              >
                <option value="todos">Todos los estatus</option>
                <option value="Abierto">Abiertos</option>
                <option value="En_Revision">En Revisión</option>
                <option value="Resuelto">Resueltos</option>
                <option value="Descartado">Descartados</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <select
                value={filtroSeveridad}
                onChange={(e) => setFiltroSeveridad(e.target.value)}
                className="h-9 w-full rounded-sm border border-gray-200 bg-brand-beige/20 px-3 text-xs font-semibold text-gray-800 outline-none focus:border-brand-dark"
              >
                <option value="todas">Todas las severidades</option>
                <option value="Critica">Crítica</option>
                <option value="Alta">Alta</option>
                <option value="Media">Media</option>
                <option value="Baja">Baja</option>
              </select>
            </div>

            <div className="md:col-span-3">
              <select
                value={filtroModulo}
                onChange={(e) => setFiltroModulo(e.target.value)}
                className="h-9 w-full rounded-sm border border-gray-200 bg-brand-beige/20 px-3 text-xs font-semibold text-gray-800 outline-none focus:border-brand-dark"
              >
                <option value="todos">Todos los módulos</option>
                {MODULOS_PLATAFORMA.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="flex max-h-[68vh] flex-col gap-2.5 overflow-y-auto pr-1 lg:col-span-5">
              {reportesFiltradosAdmin.length === 0 ? (
                <div className="flex h-52 flex-col items-center justify-center rounded-sm border border-dashed border-gray-300 bg-brand-surface p-6 text-center">
                  <p className="text-xs font-bold text-gray-700">
                    No hay reportes de errores que coincidan con el filtro
                  </p>
                  <p className="mt-1 text-[11px] text-gray-400">
                    Los reportes enviados desde la sección &ldquo;Reporte de errores&rdquo; aparecerán aquí.
                  </p>
                </div>
              ) : (
                reportesFiltradosAdmin.map((rep) => {
                  const badgeSev = obtenerBadgeSeveridad(rep.severidad);
                  const badgeEst = obtenerBadgeEstatus(rep.estatus);
                  const seleccionado = reporteSeleccionado?.id === rep.id;

                  return (
                    <button
                      key={rep.id}
                      type="button"
                      onClick={() => handleSeleccionarReporteAdmin(rep)}
                      className={`flex flex-col gap-2 rounded-sm border p-4 text-left transition-all ${
                        seleccionado
                          ? "border-brand-dark bg-brand-surface ring-2 ring-brand-gold/50 shadow-md"
                          : "border-gray-200 bg-brand-surface hover:border-brand-dark/40"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span
                          className={`rounded-sm border px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-wider ${badgeEst.badgeClass}`}
                        >
                          {badgeEst.etiqueta}
                        </span>
                        <span
                          className={`rounded-sm border px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-wider ${badgeSev.badgeClass}`}
                        >
                          SEV: {badgeSev.etiqueta}
                        </span>
                      </div>

                      <h3 className="line-clamp-1 text-xs font-bold text-gray-900">
                        {rep.titulo}
                      </h3>

                      <p className="line-clamp-2 text-[11px] leading-relaxed text-gray-600">
                        {rep.descripcion}
                      </p>

                      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-2 text-[10px] text-gray-500">
                        <span className="font-semibold text-gray-700">
                          {rep.nombre_reportante} · {rep.modulo}
                        </span>
                        <span>{formatearFechaHora(rep.created_at)}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="lg:col-span-7">
              {!reporteSeleccionado ? (
                <div className="flex h-full min-h-[340px] flex-col items-center justify-center rounded-sm border border-gray-200 bg-brand-surface p-8 text-center shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
                    Selecciona un reporte de la lista para inspeccionarlo y gestionarlo
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-5 rounded-sm border border-gray-200 bg-brand-surface p-6 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 pb-4">
                    <div>
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-sm border px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider ${
                            obtenerBadgeEstatus(reporteSeleccionado.estatus)
                              .badgeClass
                          }`}
                        >
                          {
                            obtenerBadgeEstatus(reporteSeleccionado.estatus)
                              .etiqueta
                          }
                        </span>
                        <span
                          className={`rounded-sm border px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider ${
                            obtenerBadgeSeveridad(reporteSeleccionado.severidad)
                              .badgeClass
                          }`}
                        >
                          SEVERIDAD:{" "}
                          {
                            obtenerBadgeSeveridad(reporteSeleccionado.severidad)
                              .etiqueta
                          }
                        </span>
                        <span className="rounded-sm bg-brand-beige px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-brand-dark">
                          {reporteSeleccionado.categoria}
                        </span>
                      </div>
                      <h2 className="font-serif text-xl font-bold text-gray-900">
                        {reporteSeleccionado.titulo}
                      </h2>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        handleEliminarReporteAdmin(reporteSeleccionado.id)
                      }
                      disabled={eliminandoId === reporteSeleccionado.id}
                      className="inline-flex items-center gap-1.5 rounded-sm border border-status-danger/30 px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-widest text-status-danger transition-colors hover:bg-status-danger/10 disabled:opacity-50"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                      {eliminandoId === reporteSeleccionado.id
                        ? "ELIMINANDO..."
                        : "ELIMINAR"}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 rounded-sm bg-brand-beige/35 p-4 text-xs sm:grid-cols-2">
                    <div>
                      <span className="block text-[9px] font-bold uppercase tracking-widest text-gray-500">
                        REPORTADO POR
                      </span>
                      <p className="font-bold text-gray-900">
                        {reporteSeleccionado.nombre_reportante}
                      </p>
                      <p className="text-[11px] text-gray-600">
                        {reporteSeleccionado.correo_reportante} ·{" "}
                        {reporteSeleccionado.rol_reportante} (
                        {reporteSeleccionado.empresa_reportante})
                      </p>
                    </div>
                    <div>
                      <span className="block text-[9px] font-bold uppercase tracking-widest text-gray-500">
                        MÓDULO Y RUTA
                      </span>
                      <p className="font-bold text-gray-900">
                        {reporteSeleccionado.modulo}
                      </p>
                      <p className="font-mono text-[11px] text-gray-600">
                        {reporteSeleccionado.ruta_origen || "/dashboard"} ·{" "}
                        {formatearFechaHora(reporteSeleccionado.created_at)}
                      </p>
                    </div>
                    {reporteSeleccionado.navegador_info && (
                      <div className="sm:col-span-2">
                        <span className="block text-[9px] font-bold uppercase tracking-widest text-gray-500">
                          DISPOSITIVO / NAVEGADOR
                        </span>
                        <p className="truncate font-mono text-[10px] text-gray-600">
                          {reporteSeleccionado.navegador_info}
                        </p>
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                      DESCRIPCIÓN DEL ERROR
                    </h4>
                    <div className="whitespace-pre-wrap rounded-sm border border-gray-100 bg-brand-beige/15 p-3.5 text-xs leading-relaxed text-gray-800">
                      {reporteSeleccionado.descripcion}
                    </div>
                  </div>

                  {reporteSeleccionado.pasos_reproducir && (
                    <div>
                      <h4 className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                        PASOS PARA REPRODUCIRLO
                      </h4>
                      <div className="whitespace-pre-wrap rounded-sm border border-gray-100 bg-brand-beige/15 p-3.5 text-xs leading-relaxed text-gray-800">
                        {reporteSeleccionado.pasos_reproducir}
                      </div>
                    </div>
                  )}

                  {reporteSeleccionado.captura_url && (
                    <div>
                      <h4 className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                        EVIDENCIA / CAPTURA ADJUNTA
                      </h4>
                      <button
                        type="button"
                        onClick={() =>
                          setImagenExpandidaUrl(
                            reporteSeleccionado.captura_url!
                          )
                        }
                        className="group relative block overflow-hidden rounded-sm border border-gray-200 bg-neutral-100"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={reporteSeleccionado.captura_url}
                          alt="Captura del error reportado"
                          className="max-h-56 w-auto object-contain transition-transform group-hover:scale-[1.02]"
                        />
                        <span className="block bg-brand-dark/90 px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-brand-gold">
                          CLIC PARA AMPLIAR CAPTURA ↗
                        </span>
                      </button>
                    </div>
                  )}

                  <div className="border-t border-gray-200 pt-4">
                    <h4 className="mb-3 text-[10px] font-extrabold uppercase tracking-widest text-brand-dark">
                      GESTIÓN Y RESOLUCIÓN (EXCLUSIVO ADMINISTRADOR)
                    </h4>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
                      <div className="sm:col-span-4">
                        <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-gray-600">
                          ESTATUS DEL REPORTE
                        </label>
                        <select
                          value={estatusEdicionAdmin}
                          onChange={(e) =>
                            setEstatusEdicionAdmin(
                              e.target.value as EstatusReporteError
                            )
                          }
                          className="h-10 w-full rounded-sm border border-gray-300 bg-brand-surface px-3 text-xs font-bold text-gray-900 outline-none focus:border-brand-dark"
                        >
                          <option value="Abierto">Abierto</option>
                          <option value="En_Revision">En Revisión</option>
                          <option value="Resuelto">Resuelto</option>
                          <option value="Descartado">Descartado</option>
                        </select>
                      </div>

                      <div className="sm:col-span-8">
                        <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-gray-600">
                          NOTA TÉCNICA / COMENTARIO DE SOLUCIÓN
                        </label>
                        <textarea
                          rows={2}
                          value={notasEdicionAdmin}
                          onChange={(e) => setNotasEdicionAdmin(e.target.value)}
                          placeholder="Escribe aquí el diagnóstico técnico o la confirmación de que el ajuste fue aplicado..."
                          className="w-full rounded-sm border border-gray-300 bg-brand-surface p-2.5 text-xs text-gray-800 outline-none focus:border-brand-dark"
                        />
                      </div>
                    </div>

                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={handleGuardarResolucionAdmin}
                        disabled={guardandoAdmin}
                        className="rounded-sm bg-brand-dark px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-brand-gold transition-colors hover:bg-brand-dark/90 disabled:opacity-50"
                      >
                        {guardandoAdmin
                          ? "GUARDANDO CAMBIOS..."
                          : "GUARDAR ESTATUS Y NOTA"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* =====================================================================
          PESTAÑA 2: IMPORTACIÓN MASIVA DESDE EXCEL (49 COLUMNAS)
         ===================================================================== */}
      {pestanaActiva === "importar_excel" && (
        <section className="flex flex-col gap-6">
          {/* Paso 1: Subir archivo .xlsx */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-sm border border-gray-200 bg-brand-surface p-6 shadow-sm">
            <div>
              <span className="text-[9px] font-bold uppercase tracking-widest text-brand-gold">
                ALTA MASIVA EN SUPABASE AUTH + EXPEDIENTE COMPLETO
              </span>
              <h2 className="mt-0.5 font-serif text-xl font-bold text-gray-900">
                Importar Usuarios desde Plantilla Excel (`.xlsx`)
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-gray-500">
                Selecciona el archivo Excel con los colaboradores. El sistema mapea automáticamente las 49 columnas de la plantilla oficial, genera sus cuentas en{" "}
                <code className="rounded bg-brand-beige px-1.5 py-0.5 font-mono text-[11px] text-brand-dark">
                  auth.users
                </code>{" "}
                y vincula en doble pasada la relación de{" "}
                <code className="rounded bg-brand-beige px-1.5 py-0.5 font-mono text-[11px] text-brand-dark">
                  JEFE DIRECTO
                </code>
                .
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={excelInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleSeleccionarExcel}
                className="hidden"
                id="input-excel-admin"
              />
              <label
                htmlFor="input-excel-admin"
                className="inline-flex cursor-pointer items-center gap-2 rounded-sm bg-brand-dark px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-brand-gold transition-colors hover:bg-brand-dark/90"
              >
                <FileTextIcon className="h-4 w-4" />
                {procesandoExcel
                  ? "LEYENDO EXCEL..."
                  : nombreArchivoExcel
                  ? "CAMBIAR ARCHIVO EXCEL"
                  : "SELECCIONAR ARCHIVO EXCEL"}
              </label>
            </div>
          </div>

          {/* Paso 2: Tabla de Previsualización Editable antes de enviar a Supabase */}
          {filasPrevias.length > 0 && (
            <div className="flex flex-col gap-4 rounded-sm border border-gray-200 bg-brand-surface p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-4">
                <div>
                  <h3 className="font-serif text-base font-bold text-gray-900">
                    Vista Previa de Registros Detectados ({totalSeleccionadasImportar} de{" "}
                    {filasPrevias.length} seleccionados)
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    Verifica o ajusta la Empresa (`AIF` / `ROYAL`) y el Rol del Sistema (`Colaborador`, `Jefatura`, `Recursos Humanos`) antes de ejecutar la carga.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleEjecutarImportacionMasiva}
                  disabled={
                    importandoEnServidor || totalSeleccionadasImportar === 0
                  }
                  className="rounded-sm bg-brand-dark px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-brand-gold shadow-sm transition-colors hover:bg-brand-dark/90 disabled:opacity-50"
                >
                  {importandoEnServidor
                    ? "CREANDO CUENTAS Y EXPEDIENTES EN SUPABASE..."
                    : `IMPORTAR ${totalSeleccionadasImportar} USUARIOS A SUPABASE`}
                </button>
              </div>

              <div className="max-h-[54vh] overflow-auto">
                <table className="w-full min-w-[980px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 bg-brand-beige/40 text-[9px] font-extrabold uppercase tracking-wider text-gray-700">
                      <th className="p-2.5">INC.</th>
                      <th className="p-2.5">NO. EMP</th>
                      <th className="p-2.5">PERSONAL (NOMBRE COMPLETO)</th>
                      <th className="p-2.5">CORREO CORPORATIVO</th>
                      <th className="p-2.5">DEPARTAMENTO / PUESTO</th>
                      <th className="p-2.5">JEFE DIRECTO (EXCEL)</th>
                      <th className="p-2.5">EMPRESA</th>
                      <th className="p-2.5">ROL SISTEMA</th>
                      <th className="p-2.5">INGRESO / VAC.</th>
                      <th className="p-2.5">ESTATUS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filasPrevias.map((fila) => {
                      const p = fila.payload;
                      return (
                        <tr
                          key={fila.idTemporal}
                          className={
                            fila.seleccionada
                              ? "bg-brand-surface hover:bg-brand-beige/15"
                              : "bg-gray-50 opacity-55"
                          }
                        >
                          <td className="p-2.5">
                            <input
                              type="checkbox"
                              checked={fila.seleccionada}
                              onChange={() =>
                                alternarSeleccionFila(fila.idTemporal)
                              }
                              className="h-4 w-4 accent-brand-dark"
                            />
                          </td>
                          <td className="p-2.5 font-mono text-[11px] font-bold text-gray-700">
                            {p.no_empleado || "—"}
                          </td>
                          <td className="p-2.5">
                            <input
                              type="text"
                              value={p.nombre_completo}
                              onChange={(e) =>
                                actualizarCampoFilaPrevia(fila.idTemporal, {
                                  nombre_completo: e.target.value,
                                })
                              }
                              className="h-8 w-full min-w-[190px] rounded-sm border border-gray-200 bg-brand-beige/15 px-2 text-xs font-bold text-gray-900"
                            />
                          </td>
                          <td className="p-2.5">
                            <input
                              type="email"
                              value={p.correo_corporativo ?? ""}
                              onChange={(e) =>
                                actualizarCampoFilaPrevia(fila.idTemporal, {
                                  correo_corporativo: e.target.value,
                                })
                              }
                              className="h-8 w-full min-w-[200px] rounded-sm border border-gray-200 bg-brand-beige/15 px-2 font-mono text-[11px] text-gray-800"
                            />
                          </td>
                          <td className="p-2.5">
                            <span className="block font-bold text-gray-800">
                              {p.departamento}
                            </span>
                            <span className="block text-[10px] text-gray-500">
                              {p.puesto}
                            </span>
                          </td>
                          <td className="p-2.5 text-[11px] text-gray-700">
                            {p.jefe_directo || (
                              <span className="text-gray-400">Sin jefe</span>
                            )}
                          </td>
                          <td className="p-2.5">
                            <select
                              value={p.empresa ?? "AIF"}
                              onChange={(e) =>
                                actualizarCampoFilaPrevia(fila.idTemporal, {
                                  empresa: e.target.value,
                                })
                              }
                              className="h-8 rounded-sm border border-gray-200 bg-brand-surface px-2 text-[11px] font-bold text-gray-900"
                            >
                              <option value="AIF">AIF</option>
                              <option value="ROYAL">ROYAL</option>
                            </select>
                          </td>
                          <td className="p-2.5">
                            <select
                              value={p.rol_sistema ?? "Colaborador"}
                              onChange={(e) =>
                                actualizarCampoFilaPrevia(fila.idTemporal, {
                                  rol_sistema: e.target.value,
                                  es_jefatura: e.target.value === "Jefatura",
                                })
                              }
                              className="h-8 rounded-sm border border-gray-200 bg-brand-surface px-2 text-[11px] font-bold text-gray-900"
                            >
                              <option value="Colaborador">Colaborador</option>
                              <option value="Jefatura">Jefatura</option>
                              <option value="Recursos Humanos">
                                Recursos Humanos
                              </option>
                            </select>
                          </td>
                          <td className="p-2.5 font-mono text-[11px] text-gray-700">
                            <span className="block">{p.fecha_ingreso}</span>
                            <span className="text-[10px] font-bold text-brand-dark">
                              {p.saldo_vacaciones ?? 0} días LFT
                            </span>
                          </td>
                          <td className="p-2.5">
                            <select
                              value={p.estatus ?? "Activo"}
                              onChange={(e) =>
                                actualizarCampoFilaPrevia(fila.idTemporal, {
                                  estatus: e.target.value,
                                })
                              }
                              className="h-8 rounded-sm border border-gray-200 bg-brand-surface px-2 text-[11px] font-bold text-gray-900"
                            >
                              <option value="Activo">Activo</option>
                              <option value="Inactivo">Inactivo</option>
                              <option value="Baja">Baja</option>
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Paso 3: Resultados de la Importación + Descarga de Contraseñas */}
          {resultadoImportacion && (
            <div className="flex flex-col gap-4 rounded-sm border border-brand-gold/50 bg-brand-surface p-6 shadow-md">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-4">
                <div>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-status-success-dark">
                    PROCESO FINALIZADO · {resultadoImportacion.totalExitosos}{" "}
                    EXITOSOS · {resultadoImportacion.totalFallidos} CON ERROR
                  </span>
                  <h3 className="mt-0.5 font-serif text-lg font-bold text-gray-900">
                    Credenciales Generadas para el Grupo de Prueba
                  </h3>
                  <p className="text-xs text-gray-500">
                    Descarga el archivo Excel con los usuarios y sus contraseñas asignadas antes de salir de esta pantalla.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleDescargarCredencialesExcel}
                  className="inline-flex items-center gap-2 rounded-sm bg-brand-dark px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-brand-gold transition-colors hover:bg-brand-dark/90"
                >
                  <DownloadIcon className="h-4 w-4" />
                  DESCARGAR CREDENCIALES EN EXCEL (.XLSX)
                </button>
              </div>

              <div className="max-h-[46vh] overflow-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 bg-brand-beige/40 text-[9px] font-extrabold uppercase tracking-wider text-gray-700">
                      <th className="p-2.5">#</th>
                      <th className="p-2.5">COLABORADOR</th>
                      <th className="p-2.5">CORREO (USUARIO)</th>
                      <th className="p-2.5">CONTRASEÑA GENERADA</th>
                      <th className="p-2.5">EMPRESA / ROL</th>
                      <th className="p-2.5">RESULTADO</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {resultadoImportacion.resultados.map((r) => (
                      <tr key={`res-${r.filaIndice}-${r.correoCorporativo}`}>
                        <td className="p-2.5 font-mono text-[11px] text-gray-500">
                          {r.filaIndice}
                        </td>
                        <td className="p-2.5 font-bold text-gray-900">
                          {r.nombreCompleto}
                        </td>
                        <td className="p-2.5 font-mono text-xs text-gray-800">
                          {r.correoCorporativo}
                        </td>
                        <td className="p-2.5 font-mono text-xs font-bold text-brand-dark">
                          {!r.ok ? (
                            <span className="font-sans text-[11px] font-normal text-gray-400">
                              —
                            </span>
                          ) : (
                            r.contrasenaGenerada ?? (
                              <span className="font-sans text-[11px] font-normal text-gray-500">
                                Cuenta existente en Auth (conserva su contraseña)
                              </span>
                            )
                          )}
                        </td>
                        <td className="p-2.5 text-[11px] text-gray-700">
                          {r.empresa} · {r.rolSistema}
                        </td>
                        <td className="p-2.5">
                          {r.ok ? (
                            <span className="rounded-sm bg-status-success/15 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-status-success-dark">
                              {r.modo === "creado" ? "CREADO" : "ACTUALIZADO"}
                            </span>
                          ) : (
                            <span className="text-[11px] font-bold text-status-danger-dark">
                              {r.error}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Lightbox para ampliar captura adjunta */}
      {imagenExpandidaUrl && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setImagenExpandidaUrl(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
        >
          <button
            type="button"
            onClick={() => setImagenExpandidaUrl(null)}
            className="absolute right-6 top-6 rounded-full bg-white/15 px-3.5 py-1.5 text-xs font-bold uppercase tracking-widest text-white hover:bg-white/30"
          >
            ✕ CERRAR
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imagenExpandidaUrl}
            alt="Captura ampliada"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[86vh] max-w-[92vw] rounded-sm object-contain shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
