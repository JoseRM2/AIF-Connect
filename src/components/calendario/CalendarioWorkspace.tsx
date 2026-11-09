"use client";

import { useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  agregarFeriadoDinamicoAction,
  eliminarFechaConmemorativaAction,
  eliminarFeriadoDinamicoAction,
  guardarConfigCelebracionesRhAction,
  obtenerDatosCalendarioAction,
  programarPublicacionConmemorativaAction,
  type DatosCalendarioResponse,
} from "@/app/actions/calendario";
import GreetingOverlayModal from "@/components/dashboard/GreetingOverlayModal";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  TrashIcon,
} from "@/components/ui/icons";
import {
  formatearFechaIso,
  MESES_COMPLETOS,
  reemplazarVariablesPlantilla,
  type CelebracionPrivadaOverlay,
  type ConfigCelebracionesRh,
  type EventoCalendario,
  type TipoEventoCalendario,
} from "@/lib/calendario";
import { createClient } from "@/lib/supabase/client";

interface CalendarioWorkspaceProps {
  datosIniciales: DatosCalendarioResponse;
  userId: string;
}

type FiltroCalendario =
  | "todos"
  | "vacaciones"
  | "cumpleanos"
  | "aniversario"
  | "feriados"
  | "conmemorativos";

type TabGestionRh = "feriados" | "conmemorativos" | "celebraciones";

const DIAS_SEMANA = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"] as const;

const ESTILOS_EVENTO: Record<
  TipoEventoCalendario,
  {
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
    label: string;
    dotColor: string;
  }
> = {
  vacaciones: {
    badgeBg: "bg-status-success/15",
    badgeText: "text-status-success-dark",
    badgeBorder: "border-status-success/40",
    label: "Vacaciones",
    dotColor: "bg-status-success",
  },
  cumpleanos: {
    badgeBg: "bg-brand-gold/20",
    badgeText: "text-brand-dark",
    badgeBorder: "border-brand-gold/60",
    label: "Cumpleaños",
    dotColor: "bg-brand-gold",
  },
  aniversario: {
    badgeBg: "bg-status-info/15",
    badgeText: "text-status-info-dark",
    badgeBorder: "border-status-info/40",
    label: "Aniversario",
    dotColor: "bg-status-info",
  },
  feriado_lft: {
    badgeBg: "bg-brand-dark",
    badgeText: "text-brand-gold",
    badgeBorder: "border-brand-dark",
    label: "Feriado Oficial LFT",
    dotColor: "bg-brand-dark",
  },
  feriado_empresa: {
    badgeBg: "bg-status-warning/20",
    badgeText: "text-status-warning-dark",
    badgeBorder: "border-status-warning/50",
    label: "Feriado Empresa",
    dotColor: "bg-status-warning",
  },
  conmemorativo_muro: {
    badgeBg: "bg-rose-500/15",
    badgeText: "text-rose-900",
    badgeBorder: "border-rose-500/40",
    label: "Conmemorativo Muro",
    dotColor: "bg-rose-600",
  },
};

function eventoOcurreEnFecha(evento: EventoCalendario, fechaIso: string): boolean {
  const inicio = (evento.fechaInicio ?? "").slice(0, 10);
  const fin = (evento.fechaFin ?? evento.fechaInicio ?? "").slice(0, 10);
  return fechaIso >= inicio && fechaIso <= fin;
}

function eventoOcurreEnMes(
  evento: EventoCalendario,
  anio: number,
  mes1a12: number
): boolean {
  const primerDiaMes = formatearFechaIso(anio, mes1a12, 1);
  const ultimoDiaNum = new Date(Date.UTC(anio, mes1a12, 0)).getUTCDate();
  const ultimoDiaMes = formatearFechaIso(anio, mes1a12, ultimoDiaNum);

  const inicio = (evento.fechaInicio ?? "").slice(0, 10);
  const fin = (evento.fechaFin ?? evento.fechaInicio ?? "").slice(0, 10);
  return inicio <= ultimoDiaMes && fin >= primerDiaMes;
}

function formatearFechaCortaEs(fechaIso: string): string {
  const [y, m, d] = fechaIso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return fechaIso;
  const nombreMes = MESES_COMPLETOS[m - 1]?.slice(0, 3).toUpperCase() ?? "";
  return `${String(d).padStart(2, "0")} ${nombreMes} ${y}`;
}

export default function CalendarioWorkspace({
  datosIniciales,
  userId,
}: CalendarioWorkspaceProps) {
  const hoy = useMemo(() => new Date(), []);
  const hoyIso = useMemo(
    () =>
      formatearFechaIso(
        hoy.getFullYear(),
        hoy.getMonth() + 1,
        hoy.getDate()
      ),
    [hoy]
  );

  const [datos, setDatos] = useState<DatosCalendarioResponse>(datosIniciales);
  const [anioActual, setAnioActual] = useState<number>(hoy.getFullYear());
  const [mesActual, setMesActual] = useState<number>(hoy.getMonth() + 1); // 1-12
  const [diaSeleccionadoIso, setDiaSeleccionadoIso] = useState<string>(hoyIso);
  const [filtroActivo, setFiltroActivo] = useState<FiltroCalendario>("todos");
  const [isRecargandoAnio, setIsRecargandoAnio] = useState(false);

  // Panel de administración RH
  const [tabRh, setTabRh] = useState<TabGestionRh>("feriados");
  const [feedbackRh, setFeedbackRh] = useState<string | null>(null);
  const [errorRh, setErrorRh] = useState<string | null>(null);
  const [isGuardandoRh, setIsGuardandoRh] = useState(false);

  // Form 1: Nuevo feriado dinámico de empresa
  const [feriadoFecha, setFeriadoFecha] = useState("");
  const [feriadoTitulo, setFeriadoTitulo] = useState("");
  const [feriadoDescripcion, setFeriadoDescripcion] = useState("");
  const [feriadoEmpresa, setFeriadoEmpresa] = useState<"Ambas" | "AIF" | "ROYAL">(
    "Ambas"
  );
  const [feriadoRecurrente, setFeriadoRecurrente] = useState(true);

  // Form 2: Nueva publicación conmemorativa del muro
  const [conmFecha, setConmFecha] = useState("");
  const [conmTitulo, setConmTitulo] = useState("");
  const [conmContenido, setConmContenido] = useState("");
  const [conmEmpresa, setConmEmpresa] = useState<"Ambas" | "AIF" | "ROYAL">(
    "Ambas"
  );
  const [conmDepartamento, setConmDepartamento] = useState("Todos");
  const [conmRequiereAcuse, setConmRequiereAcuse] = useState(false);
  const [conmArchivos, setConmArchivos] = useState<File[]>([]);
  const conmFileInputRef = useRef<HTMLInputElement | null>(null);

  // Form 3: Plantillas de Cumpleaños y Aniversarios (Enfoque 1 + Enfoque 2)
  const [celebracionesForm, setCelebracionesForm] =
    useState<ConfigCelebracionesRh>(datosIniciales.configRh.celebraciones);
  const [subiendoPlantillaTipo, setSubiendoPlantillaTipo] = useState<
    "cumpleanos" | "aniversario" | null
  >(null);
  const [vistaPreviaOverlay, setVistaPreviaOverlay] =
    useState<CelebracionPrivadaOverlay | null>(null);

  const cambiarMes = async (deltaMeses: number) => {
    let nuevoMes = mesActual + deltaMeses;
    let nuevoAnio = anioActual;

    if (nuevoMes > 12) {
      nuevoMes = 1;
      nuevoAnio += 1;
    } else if (nuevoMes < 1) {
      nuevoMes = 12;
      nuevoAnio -= 1;
    }

    const cambioAnio = nuevoAnio !== anioActual;
    setMesActual(nuevoMes);
    setAnioActual(nuevoAnio);
    setDiaSeleccionadoIso(formatearFechaIso(nuevoAnio, nuevoMes, 1));

    if (cambioAnio) {
      setIsRecargandoAnio(true);
      try {
        const nuevosDatos = await obtenerDatosCalendarioAction(nuevoAnio);
        if (nuevosDatos.ok) {
          setDatos(nuevosDatos);
        }
      } finally {
        setIsRecargandoAnio(false);
      }
    }
  };

  const irAHoy = () => {
    const y = hoy.getFullYear();
    const m = hoy.getMonth() + 1;
    setAnioActual(y);
    setMesActual(m);
    setDiaSeleccionadoIso(hoyIso);
  };

  // Filtrar eventos según la píldora seleccionada
  const eventosFiltrados = useMemo(() => {
    return datos.eventos.filter((ev) => {
      if (filtroActivo === "todos") return true;
      if (filtroActivo === "vacaciones") return ev.tipo === "vacaciones";
      if (filtroActivo === "cumpleanos") return ev.tipo === "cumpleanos";
      if (filtroActivo === "aniversario") return ev.tipo === "aniversario";
      if (filtroActivo === "feriados") {
        return ev.tipo === "feriado_lft" || ev.tipo === "feriado_empresa";
      }
      if (filtroActivo === "conmemorativos") {
        return ev.tipo === "conmemorativo_muro";
      }
      return true;
    });
  }, [datos.eventos, filtroActivo]);

  // Eventos del mes activo (para métricas y agenda lateral)
  const eventosDelMes = useMemo(() => {
    return datos.eventos
      .filter((ev) => eventoOcurreEnMes(ev, anioActual, mesActual))
      .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio));
  }, [datos.eventos, anioActual, mesActual]);

  const eventosFiltradosDelMes = useMemo(() => {
    return eventosFiltrados.filter((ev) =>
      eventoOcurreEnMes(ev, anioActual, mesActual)
    );
  }, [eventosFiltrados, anioActual, mesActual]);

  const metricasMes = useMemo(() => {
    let vacaciones = 0;
    let cumpleanos = 0;
    let aniversarios = 0;
    let feriados = 0;

    for (const ev of eventosDelMes) {
      if (ev.tipo === "vacaciones") vacaciones += 1;
      else if (ev.tipo === "cumpleanos") cumpleanos += 1;
      else if (ev.tipo === "aniversario") aniversarios += 1;
      else if (ev.tipo === "feriado_lft" || ev.tipo === "feriado_empresa") {
        feriados += 1;
      }
    }
    return { vacaciones, cumpleanos, aniversarios, feriados };
  }, [eventosDelMes]);

  // Construir celdas de la cuadrícula mensual (Lunes a Domingo)
  const celdasMes = useMemo(() => {
    const diasEnMes = new Date(Date.UTC(anioActual, mesActual, 0)).getUTCDate();
    const diaSemanaPrimeroUtc = new Date(
      Date.UTC(anioActual, mesActual - 1, 1)
    ).getUTCDay(); // 0=Dom, 1=Lun...
    // Ajustar para que Lunes sea columna 0 y Domingo columna 6
    const offsetLunes = (diaSemanaPrimeroUtc + 6) % 7;

    const celdas: Array<{
      fechaIso: string | null;
      numeroDia: number | null;
      eventos: EventoCalendario[];
      traslapeVacacionesCount: number;
    }> = [];

    for (let i = 0; i < offsetLunes; i++) {
      celdas.push({
        fechaIso: null,
        numeroDia: null,
        eventos: [],
        traslapeVacacionesCount: 0,
      });
    }

    for (let dia = 1; dia <= diasEnMes; dia++) {
      const iso = formatearFechaIso(anioActual, mesActual, dia);
      const evsDia = eventosFiltradosDelMes.filter((ev) =>
        eventoOcurreEnFecha(ev, iso)
      );
      const totalVacacionesDia = eventosDelMes.filter(
        (ev) => ev.tipo === "vacaciones" && eventoOcurreEnFecha(ev, iso)
      ).length;

      celdas.push({
        fechaIso: iso,
        numeroDia: dia,
        eventos: evsDia,
        traslapeVacacionesCount: totalVacacionesDia,
      });
    }

    return celdas;
  }, [anioActual, mesActual, eventosFiltradosDelMes, eventosDelMes]);

  // Eventos del día seleccionado
  const eventosDiaSeleccionado = useMemo(() => {
    if (!diaSeleccionadoIso) return [];
    return datos.eventos.filter((ev) =>
      eventoOcurreEnFecha(ev, diaSeleccionadoIso)
    );
  }, [datos.eventos, diaSeleccionadoIso]);

  // Días con traslape de vacaciones en el equipo (2+ personas ausentes el mismo día) para Jefaturas y RH
  const diasConTraslapeEnMes = useMemo(() => {
    if (!datos.esJefatura && !datos.esRecursosHumanos) return [];
    return celdasMes.filter(
      (c): c is NonNullable<typeof c> & { fechaIso: string; numeroDia: number } =>
        Boolean(c.fechaIso && c.traslapeVacacionesCount >= 2)
    );
  }, [celdasMes, datos.esJefatura, datos.esRecursosHumanos]);

  // Handlers de Recursos Humanos
  const recargarCalendario = async () => {
    const actualizado = await obtenerDatosCalendarioAction(anioActual);
    if (actualizado.ok) {
      setDatos(actualizado);
      setCelebracionesForm(actualizado.configRh.celebraciones);
    }
  };

  const handleAgregarFeriadoSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isGuardandoRh) return;
    setIsGuardandoRh(true);
    setErrorRh(null);
    setFeedbackRh(null);

    try {
      const res = await agregarFeriadoDinamicoAction({
        fecha: feriadoFecha,
        titulo: feriadoTitulo,
        descripcion: feriadoDescripcion,
        empresaDestino: feriadoEmpresa,
        esRecurrenteAnual: feriadoRecurrente,
      });

      if (!res.ok) {
        setErrorRh(res.error || "No se pudo agregar el día feriado.");
        return;
      }

      setFeriadoFecha("");
      setFeriadoTitulo("");
      setFeriadoDescripcion("");
      setFeedbackRh(
        `Día feriado "${feriadoTitulo.trim()}" agregado al calendario de todos los usuarios.`
      );
      await recargarCalendario();
    } finally {
      setIsGuardandoRh(false);
    }
  };

  const handleEliminarFeriado = async (id: string) => {
    if (isGuardandoRh) return;
    setIsGuardandoRh(true);
    setErrorRh(null);
    setFeedbackRh(null);
    try {
      const res = await eliminarFeriadoDinamicoAction(id);
      if (!res.ok) {
        setErrorRh(res.error || "No se pudo eliminar el día feriado.");
        return;
      }
      setFeedbackRh("Día feriado eliminado correctamente.");
      await recargarCalendario();
    } finally {
      setIsGuardandoRh(false);
    }
  };

  const handleProgramarConmemorativoSubmit = async (
    e: FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();
    if (isGuardandoRh) return;
    setIsGuardandoRh(true);
    setErrorRh(null);
    setFeedbackRh(null);

    try {
      const supabase = createClient();
      const urlsSubidas: string[] = [];

      for (let i = 0; i < conmArchivos.length; i++) {
        const archivo = conmArchivos[i];
        const ext = archivo.name.split(".").pop()?.toLowerCase() || "jpg";
        const base = archivo.name
          .replace(/\.[^/.]+$/, "")
          .replace(/[^a-zA-Z0-9_-]/g, "_")
          .slice(0, 35);
        const fileName = `conmemorativo_${Date.now()}_${i + 1}_${base}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from("comunicados")
          .upload(fileName, archivo);

        if (upErr) {
          setErrorRh(`Error al subir imagen (${archivo.name}): ${upErr.message}`);
          return;
        }

        const { data: pubUrl } = supabase.storage
          .from("comunicados")
          .getPublicUrl(fileName);
        urlsSubidas.push(pubUrl.publicUrl);
      }

      const res = await programarPublicacionConmemorativaAction({
        fecha: conmFecha,
        titulo: conmTitulo,
        contenido: conmContenido,
        imagenesUrls: urlsSubidas,
        empresaDestino: conmEmpresa,
        departamentoDestino: conmDepartamento,
        requiereAcuse: conmRequiereAcuse,
      });

      if (!res.ok) {
        setErrorRh(
          res.error || "No se pudo programar la publicación conmemorativa."
        );
        return;
      }

      setConmFecha("");
      setConmTitulo("");
      setConmContenido("");
      setConmArchivos([]);
      if (conmFileInputRef.current) {
        conmFileInputRef.current.value = "";
      }
      setFeedbackRh(
        `Publicación conmemorativa "${conmTitulo.trim()}" programada en el Calendario y en el Muro Corporativo.`
      );
      await recargarCalendario();
    } finally {
      setIsGuardandoRh(false);
    }
  };

  const handleEliminarConmemorativo = async (id: string) => {
    if (isGuardandoRh) return;
    setIsGuardandoRh(true);
    setErrorRh(null);
    setFeedbackRh(null);
    try {
      const res = await eliminarFechaConmemorativaAction(id);
      if (!res.ok) {
        setErrorRh(
          res.error || "No se pudo eliminar la publicación conmemorativa."
        );
        return;
      }
      setFeedbackRh("Fecha conmemorativa eliminada del calendario y del muro.");
      await recargarCalendario();
    } finally {
      setIsGuardandoRh(false);
    }
  };

  const handleSubirImagenPlantilla = async (
    tipo: "cumpleanos" | "aniversario",
    e: ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    setSubiendoPlantillaTipo(tipo);
    setErrorRh(null);
    setFeedbackRh(null);

    try {
      const supabase = createClient();
      const nuevasUrls: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const archivo = files[i];
        const ext = archivo.name.split(".").pop()?.toLowerCase() || "jpg";
        const base = archivo.name
          .replace(/\.[^/.]+$/, "")
          .replace(/[^a-zA-Z0-9_-]/g, "_")
          .slice(0, 35);
        const fileName = `plantilla_${tipo}_${Date.now()}_${i + 1}_${base}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from("comunicados")
          .upload(fileName, archivo);

        if (upErr) {
          setErrorRh(
            `Error al subir plantilla gráfica (${archivo.name}): ${upErr.message}`
          );
          return;
        }

        const { data: pubUrl } = supabase.storage
          .from("comunicados")
          .getPublicUrl(fileName);
        nuevasUrls.push(pubUrl.publicUrl);
      }

      setCelebracionesForm((prev) => ({
        ...prev,
        [tipo]: {
          ...prev[tipo],
          imagenesPlantilla: [...prev[tipo].imagenesPlantilla, ...nuevasUrls],
        },
      }));
      setFeedbackRh(
        `Se agregaron ${nuevasUrls.length} imagen(es) a la plantilla de ${
          tipo === "cumpleanos" ? "Cumpleaños" : "Aniversario"
        }. Recuerda presionar "Guardar Configuración de Celebraciones".`
      );
    } finally {
      setSubiendoPlantillaTipo(null);
      e.target.value = "";
    }
  };

  const handleGuardarCelebracionesSubmit = async (
    e: FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();
    if (isGuardandoRh) return;
    setIsGuardandoRh(true);
    setErrorRh(null);
    setFeedbackRh(null);

    try {
      const res = await guardarConfigCelebracionesRhAction(celebracionesForm);
      if (!res.ok) {
        setErrorRh(
          res.error || "No se pudo guardar la configuración de celebraciones."
        );
        return;
      }
      setFeedbackRh(
        "Configuración de felicitaciones de Cumpleaños y Aniversarios (Enfoque Público en Muro + Enfoque Privado GreetingOverlay) guardada exitosamente."
      );
      await recargarCalendario();
    } finally {
      setIsGuardandoRh(false);
    }
  };

  const abrirVistaPreviaGreeting = (tipo: "cumpleanos" | "aniversario") => {
    const cfg = celebracionesForm[tipo];
    const varsEjemplo = {
      nombre: "Ana Sofía Mendoza",
      primer_nombre: "Ana",
      puesto: "Especialista Fiscal",
      departamento: datos.departamentoUsuario || "Fiscal",
      empresa: datos.empresaUsuario || "AIF",
      anios_servicio: 3,
    };

    setVistaPreviaOverlay({
      idCelebracionAnual: `preview-${tipo}-${Date.now()}`,
      tipo,
      fechaCelebracion: hoyIso,
      titulo: reemplazarVariablesPlantilla(cfg.tituloPlantilla, varsEjemplo),
      mensaje: reemplazarVariablesPlantilla(cfg.mensajePlantilla, varsEjemplo),
      imagenesUrls: cfg.imagenesPlantilla,
      nombreColaborador: varsEjemplo.nombre,
      primerNombre: varsEjemplo.primer_nombre,
      departamento: varsEjemplo.departamento,
      empresa: varsEjemplo.empresa,
      aniosServicio: tipo === "aniversario" ? 3 : undefined,
    });
  };

  const descripcionAlcanceRol = useMemo(() => {
    if (datos.esRecursosHumanos) {
      return "Vista Global RH: Visualizas vacaciones autorizadas, aniversarios y cumpleaños de toda la plantilla (AIF y ROYAL), días feriados oficiales (LFT), feriados dinámicos de la empresa y publicaciones conmemorativas.";
    }
    if (datos.esJefatura) {
      return "Vista Jefatura: Visualizas las vacaciones autorizadas y aniversarios de todos tus subordinados (y los propios), los cumpleaños de tu equipo y demás jefaturas, y los días feriados oficiales y de empresa.";
    }
    return `Vista Colaborador (${datos.departamentoUsuario}): Visualizas tus vacaciones autorizadas, tu aniversario laboral, los cumpleaños de tus compañeros de área y los días feriados oficiales (LFT) y de la empresa.`;
  }, [
    datos.esRecursosHumanos,
    datos.esJefatura,
    datos.departamentoUsuario,
  ]);

  return (
    <div className="flex flex-col gap-8 px-10 py-8">
      {/* Modal de Vista Previa del Efecto Sorpresa (Enfoque 2) */}
      {vistaPreviaOverlay && (
        <GreetingOverlayModal
          userId={userId}
          celebracionesIniciales={[vistaPreviaOverlay]}
          modoVistaPrevia
          onCerrarVistaPrevia={() => setVistaPreviaOverlay(null)}
        />
      )}

      {/* Encabezado Principal */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-gray-200 pb-6">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-brand-gold">
            CULTURA ORGANIZACIONAL Y PLANEACIÓN ·{" "}
            {datos.esRecursosHumanos
              ? "RECURSOS HUMANOS"
              : datos.esJefatura
              ? "SUPERVISIÓN JEFATURA"
              : "COLABORADOR"}
          </span>
          <h1 className="mt-1 font-serif text-3xl font-black text-gray-900">
            Calendario Corporativo
          </h1>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-600">
            {descripcionAlcanceRol}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => cambiarMes(-1)}
            disabled={isRecargandoAnio}
            className="rounded-sm border border-gray-300 bg-brand-surface px-3.5 py-2 text-xs font-bold text-gray-800 transition-colors hover:bg-brand-beige/60 disabled:opacity-50"
          >
            ‹ Anterior
          </button>
          <button
            type="button"
            onClick={irAHoy}
            disabled={isRecargandoAnio}
            className="rounded-sm bg-brand-dark px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-brand-gold transition-colors hover:bg-brand-dark/90"
          >
            HOY
          </button>
          <button
            type="button"
            onClick={() => cambiarMes(1)}
            disabled={isRecargandoAnio}
            className="rounded-sm border border-gray-300 bg-brand-surface px-3.5 py-2 text-xs font-bold text-gray-800 transition-colors hover:bg-brand-beige/60 disabled:opacity-50"
          >
            Siguiente ›
          </button>
        </div>
      </header>

      {/* Tarjetas de Resumen del Mes */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-md border-l-4 border-status-success bg-brand-surface p-4 shadow-sm">
          <span className="text-[9px] font-bold uppercase tracking-widest text-gray-500">
            VACACIONES EN {MESES_COMPLETOS[mesActual - 1]?.toUpperCase()}
          </span>
          <p className="mt-1 font-serif text-3xl font-bold text-gray-900">
            {metricasMes.vacaciones}
          </p>
          <span className="text-[10px] font-medium text-status-success-dark">
            {datos.esRecursosHumanos
              ? "Periodos autorizados en plantilla"
              : datos.esJefatura
              ? "Periodos autorizados en tu equipo"
              : "Mis periodos autorizados"}
          </span>
        </div>

        <div className="rounded-md border-l-4 border-brand-gold bg-brand-surface p-4 shadow-sm">
          <span className="text-[9px] font-bold uppercase tracking-widest text-gray-500">
            CUMPLEAÑOS DEL MES
          </span>
          <p className="mt-1 font-serif text-3xl font-bold text-gray-900">
            {metricasMes.cumpleanos}
          </p>
          <span className="text-[10px] font-medium text-brand-dark">
            {datos.esRecursosHumanos
              ? "Toda la organización"
              : datos.esJefatura
              ? "Subordinados y jefaturas"
              : `Compañeros de ${datos.departamentoUsuario}`}
          </span>
        </div>

        <div className="rounded-md border-l-4 border-status-info bg-brand-surface p-4 shadow-sm">
          <span className="text-[9px] font-bold uppercase tracking-widest text-gray-500">
            ANIVERSARIOS DEL MES
          </span>
          <p className="mt-1 font-serif text-3xl font-bold text-gray-900">
            {metricasMes.aniversarios}
          </p>
          <span className="text-[10px] font-medium text-status-info-dark">
            {datos.esRecursosHumanos
              ? "Trayectoria laboral global"
              : datos.esJefatura
              ? "Equipo directo y propio"
              : "Mi aniversario en la firma"}
          </span>
        </div>

        <div className="rounded-md border-l-4 border-brand-dark bg-brand-surface p-4 shadow-sm">
          <span className="text-[9px] font-bold uppercase tracking-widest text-gray-500">
            DÍAS FERIADOS EN EL MES
          </span>
          <p className="mt-1 font-serif text-3xl font-bold text-gray-900">
            {metricasMes.feriados}
          </p>
          <span className="text-[10px] font-medium text-gray-600">
            Oficiales LFT + Institucionales
          </span>
        </div>
      </section>

      {/* Alerta de Traslape de Vacaciones en el Equipo (Mejora para Jefaturas y RH) */}
      {(datos.esJefatura || datos.esRecursosHumanos) &&
        diasConTraslapeEnMes.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border-l-4 border-status-warning bg-status-warning/10 px-5 py-3.5 shadow-sm">
            <div className="flex items-center gap-3">
              <AlertTriangleIcon className="h-5 w-5 shrink-0 text-status-warning-dark" />
              <div>
                <p className="text-xs font-bold text-gray-900">
                  Alerta de Capacidad: Hay {diasConTraslapeEnMes.length}{" "}
                  {diasConTraslapeEnMes.length === 1 ? "día" : "días"} en{" "}
                  {MESES_COMPLETOS[mesActual - 1]} con traslape de vacaciones (2 o más colaboradores ausentes simultáneamente)
                </p>
                <p className="text-[11px] text-gray-700">
                  Haz clic en los días marcados con{" "}
                  <span className="font-bold text-status-warning-dark">
                    ⚠️ Traslape
                  </span>{" "}
                  para revisar quiénes coinciden de vacaciones.
                </p>
              </div>
            </div>
          </div>
        )}

      {/* Píldoras de Filtro por Categoría */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { id: "todos", label: "Todos los eventos" },
              { id: "vacaciones", label: "Vacaciones Autorizadas" },
              { id: "cumpleanos", label: "🎂 Cumpleaños" },
              { id: "aniversario", label: "🏆 Aniversarios" },
              { id: "feriados", label: "🇲🇽 Días Feriados (LFT y Empresa)" },
              { id: "conmemorativos", label: "🎉 Conmemorativos Muro" },
            ] as Array<{ id: FiltroCalendario; label: string }>
          ).map((f) => {
            const activo = filtroActivo === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltroActivo(f.id)}
                className={`rounded-full border px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  activo
                    ? "border-brand-dark bg-brand-dark text-brand-gold shadow-sm"
                    : "border-gray-200 bg-brand-surface text-gray-700 hover:border-brand-gold"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <h2 className="font-serif text-xl font-bold text-gray-900">
          {MESES_COMPLETOS[mesActual - 1]} {anioActual}
        </h2>
      </div>

      {/* Layout Principal: Cuadrícula Mensual (8 cols) + Inspector de Día y Agenda Próxima (4 cols) */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* Cuadrícula del Calendario */}
        <section className="overflow-hidden rounded-md border border-gray-200 bg-brand-surface shadow-sm lg:col-span-8">
          <div className="grid grid-cols-7 border-b border-gray-200 bg-brand-beige/70">
            {DIAS_SEMANA.map((dia) => (
              <div
                key={dia}
                className="py-2.5 text-center text-[10px] font-extrabold uppercase tracking-widest text-gray-700"
              >
                {dia}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 divide-x divide-y divide-gray-200">
            {celdasMes.map((celda, idx) => {
              if (!celda.fechaIso || !celda.numeroDia) {
                return (
                  <div
                    key={`empty-${idx}`}
                    className="min-h-[112px] bg-gray-50/50 p-2"
                  />
                );
              }

              const esHoy = celda.fechaIso === hoyIso;
              const esSeleccionado = celda.fechaIso === diaSeleccionadoIso;
              const hayTraslape =
                (datos.esJefatura || datos.esRecursosHumanos) &&
                celda.traslapeVacacionesCount >= 2;

              return (
                <button
                  key={celda.fechaIso}
                  type="button"
                  onClick={() => setDiaSeleccionadoIso(celda.fechaIso!)}
                  className={`flex min-h-[112px] flex-col items-stretch justify-start p-2 text-left transition-colors focus:outline-none ${
                    esSeleccionado
                      ? "bg-brand-beige/60 ring-2 ring-inset ring-brand-gold"
                      : esHoy
                      ? "bg-brand-gold/10 hover:bg-brand-beige/40"
                      : "bg-brand-surface hover:bg-gray-50"
                  }`}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-1">
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                        esHoy
                          ? "bg-brand-dark text-brand-gold"
                          : "text-gray-800"
                      }`}
                    >
                      {celda.numeroDia}
                    </span>

                    {hayTraslape && (
                      <span
                        title={`${celda.traslapeVacacionesCount} colaboradores de vacaciones este día`}
                        className="rounded-sm bg-status-warning/20 px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider text-status-warning-dark"
                      >
                        ⚠️ {celda.traslapeVacacionesCount}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-1">
                    {celda.eventos.slice(0, 3).map((ev) => {
                      const est = ESTILOS_EVENTO[ev.tipo];
                      return (
                        <span
                          key={ev.id}
                          className={`truncate rounded-sm border px-1.5 py-0.5 text-[9px] font-bold ${est.badgeBg} ${est.badgeText} ${est.badgeBorder}`}
                        >
                          {ev.titulo}
                        </span>
                      );
                    })}
                    {celda.eventos.length > 3 && (
                      <span className="pl-1 text-[9px] font-extrabold text-gray-500">
                        +{celda.eventos.length - 3} más
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Panel Lateral: Detalle del Día Seleccionado + Agenda del Mes */}
        <aside className="flex flex-col gap-5 lg:col-span-4">
          {/* Detalle del Día Seleccionado */}
          <div className="rounded-md border border-gray-200 bg-brand-surface p-5 shadow-sm">
            <div className="border-b border-gray-100 pb-3">
              <span className="text-[9px] font-bold uppercase tracking-widest text-brand-gold">
                DETALLE DEL DÍA SELECCIONADO
              </span>
              <h3 className="mt-0.5 font-serif text-base font-bold text-gray-900">
                {formatearFechaCortaEs(diaSeleccionadoIso)}
              </h3>
            </div>

            {eventosDiaSeleccionado.length === 0 ? (
              <p className="py-6 text-center text-xs text-gray-400">
                No hay eventos registrados para esta fecha.
              </p>
            ) : (
              <div className="mt-3 flex flex-col gap-3">
                {eventosDiaSeleccionado.map((ev) => {
                  const est = ESTILOS_EVENTO[ev.tipo];
                  return (
                    <div
                      key={ev.id}
                      className="rounded-sm border border-gray-100 bg-brand-beige/25 p-3.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`rounded-sm border px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest ${est.badgeBg} ${est.badgeText} ${est.badgeBorder}`}
                        >
                          {est.label}
                        </span>
                        {ev.subtitulo && (
                          <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-500">
                            {ev.subtitulo}
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-xs font-bold text-gray-900">
                        {ev.titulo}
                      </p>
                      {ev.descripcion && (
                        <p className="mt-1 text-[11px] leading-relaxed text-gray-600">
                          {ev.descripcion}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Agenda Cronológica del Mes */}
          <div className="rounded-md border border-gray-200 bg-brand-surface p-5 shadow-sm">
            <div className="border-b border-gray-100 pb-3">
              <span className="text-[9px] font-bold uppercase tracking-widest text-gray-500">
                AGENDA CRONOLÓGICA
              </span>
              <h3 className="mt-0.5 font-serif text-base font-bold text-gray-900">
                Eventos de {MESES_COMPLETOS[mesActual - 1]}
              </h3>
            </div>

            {eventosDelMes.length === 0 ? (
              <p className="py-6 text-center text-xs text-gray-400">
                Sin eventos programados en este mes.
              </p>
            ) : (
              <ul className="mt-3 flex max-h-96 flex-col divide-y divide-gray-100 overflow-y-auto pr-1">
                {eventosDelMes.map((ev) => {
                  const est = ESTILOS_EVENTO[ev.tipo];
                  return (
                    <li key={`agenda-${ev.id}`} className="py-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          setDiaSeleccionadoIso(ev.fechaInicio.slice(0, 10))
                        }
                        className="flex w-full items-start justify-between gap-2 text-left hover:opacity-80"
                      >
                        <div className="flex items-start gap-2.5">
                          <span
                            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${est.dotColor}`}
                          />
                          <div>
                            <p className="text-xs font-bold text-gray-900">
                              {ev.titulo}
                            </p>
                            <p className="text-[10px] text-gray-500">
                              {ev.subtitulo || est.label}
                            </p>
                          </div>
                        </div>
                        <span className="shrink-0 font-mono text-[10px] font-bold text-gray-600">
                          {ev.fechaInicio.slice(8, 10)}{" "}
                          {MESES_COMPLETOS[mesActual - 1]?.slice(0, 3)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {/* PANEL EXCLUSIVO DE RECURSOS HUMANOS: Feriados Dinámicos, Fechas Conmemorativas y Celebraciones */}
      {datos.esRecursosHumanos && (
        <section className="mt-4 overflow-hidden rounded-md border-t-4 border-brand-dark bg-brand-surface shadow-sm">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 bg-brand-beige/40 px-6 py-4">
            <div>
              <span className="text-[9px] font-bold uppercase tracking-widest text-brand-gold">
                ADMINISTRACIÓN DE CALENDARIO Y CULTURA · EXCLUSIVO RH
              </span>
              <h2 className="mt-0.5 font-serif text-lg font-bold text-gray-900">
                Configuración de Días Feriados, Conmemoraciones y Felicitaciones
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setTabRh("feriados");
                  setFeedbackRh(null);
                  setErrorRh(null);
                }}
                className={`rounded-sm px-4 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  tabRh === "feriados"
                    ? "bg-brand-dark text-brand-gold"
                    : "border border-gray-300 bg-brand-surface text-gray-700 hover:bg-brand-beige/50"
                }`}
              >
                1. Días Feriados Dinámicos (
                {datos.configRh.feriadosDinamicos.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setTabRh("conmemorativos");
                  setFeedbackRh(null);
                  setErrorRh(null);
                }}
                className={`rounded-sm px-4 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  tabRh === "conmemorativos"
                    ? "bg-brand-dark text-brand-gold"
                    : "border border-gray-300 bg-brand-surface text-gray-700 hover:bg-brand-beige/50"
                }`}
              >
                2. Fechas Conmemorativas Muro (
                {datos.configRh.fechasConmemorativas.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setTabRh("celebraciones");
                  setFeedbackRh(null);
                  setErrorRh(null);
                }}
                className={`rounded-sm px-4 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  tabRh === "celebraciones"
                    ? "bg-brand-dark text-brand-gold"
                    : "border border-gray-300 bg-brand-surface text-gray-700 hover:bg-brand-beige/50"
                }`}
              >
                3. Cumpleaños y Aniversarios (Público + Sorpresa)
              </button>
            </div>
          </header>

          {feedbackRh && (
            <div className="mx-6 mt-4 flex items-center gap-2 rounded-sm border border-status-success/40 bg-status-success/10 px-4 py-3 text-xs font-bold text-status-success-dark">
              <CheckCircleIcon className="h-4 w-4 shrink-0" />
              <span>{feedbackRh}</span>
            </div>
          )}

          {errorRh && (
            <div className="mx-6 mt-4 rounded-sm border border-status-danger/40 bg-status-danger/10 px-4 py-3 text-xs font-bold text-status-danger-dark">
              ✕ {errorRh}
            </div>
          )}

          <div className="p-6">
            {/* TAB 1: DÍAS FERIADOS DINÁMICOS DE LA EMPRESA */}
            {tabRh === "feriados" && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <form
                  onSubmit={handleAgregarFeriadoSubmit}
                  className="flex flex-col gap-4 rounded-sm border border-gray-200 bg-brand-beige/20 p-5 lg:col-span-5"
                >
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">
                      Dar de Alta Día Feriado Dinámico
                    </h3>
                    <p className="mt-0.5 text-[11px] text-gray-600">
                      Aparecerá en el calendario de todos los usuarios y se descontará automáticamente al calcular vacaciones.
                    </p>
                  </div>

                  <div>
                    <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-gray-700">
                      NOMBRE DE LA FESTIVIDAD O FERIADO *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. Viernes Santo, Día de las Madres, Fin de Año"
                      value={feriadoTitulo}
                      onChange={(e) => setFeriadoTitulo(e.target.value)}
                      className="h-9 w-full rounded-sm border border-gray-300 bg-brand-surface px-3 text-xs text-gray-900 focus:border-brand-dark focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-gray-700">
                        FECHA *
                      </label>
                      <input
                        type="date"
                        required
                        value={feriadoFecha}
                        onChange={(e) => setFeriadoFecha(e.target.value)}
                        className="h-9 w-full rounded-sm border border-gray-300 bg-brand-surface px-3 text-xs text-gray-900 focus:border-brand-dark focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-gray-700">
                        EMPRESA *
                      </label>
                      <select
                        value={feriadoEmpresa}
                        onChange={(e) =>
                          setFeriadoEmpresa(
                            e.target.value as "Ambas" | "AIF" | "ROYAL"
                          )
                        }
                        className="h-9 w-full rounded-sm border border-gray-300 bg-brand-surface px-3 text-xs text-gray-900 focus:border-brand-dark focus:outline-none"
                      >
                        <option value="Ambas">Ambas (AIF y ROYAL)</option>
                        <option value="AIF">AIF</option>
                        <option value="ROYAL">ROYAL</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-gray-700">
                      NOTA O DESCRIPCIÓN (OPCIONAL)
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. Día inhábil otorgado por la firma"
                      value={feriadoDescripcion}
                      onChange={(e) => setFeriadoDescripcion(e.target.value)}
                      className="h-9 w-full rounded-sm border border-gray-300 bg-brand-surface px-3 text-xs text-gray-900 focus:border-brand-dark focus:outline-none"
                    />
                  </div>

                  <label className="inline-flex cursor-pointer items-center gap-2.5 text-xs font-semibold text-gray-800">
                    <input
                      type="checkbox"
                      checked={feriadoRecurrente}
                      onChange={(e) => setFeriadoRecurrente(e.target.checked)}
                      className="h-4 w-4 accent-brand-dark"
                    />
                    <span>Repetir automáticamente cada año en esta misma fecha</span>
                  </label>

                  <button
                    type="submit"
                    disabled={isGuardandoRh}
                    className="mt-1 h-10 w-full rounded-sm bg-brand-dark text-[10px] font-bold uppercase tracking-widest text-brand-gold transition-colors hover:bg-brand-dark/90 disabled:opacity-50"
                  >
                    {isGuardandoRh
                      ? "GUARDANDO..."
                      : "AGREGAR DÍA FERIADO AL CALENDARIO"}
                  </button>
                </form>

                <div className="flex flex-col gap-3 lg:col-span-7">
                  <h3 className="text-sm font-bold text-gray-900">
                    Días Feriados Dinámicos Registrados por RH
                  </h3>
                  {datos.configRh.feriadosDinamicos.length === 0 ? (
                    <div className="flex h-44 items-center justify-center rounded-sm border border-dashed border-gray-200 p-6 text-center text-xs text-gray-400">
                      Aún no hay días feriados dinámicos personalizados. Los días oficiales de la LFT ya están activos automáticamente.
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100 rounded-sm border border-gray-200">
                      {datos.configRh.feriadosDinamicos.map((f) => (
                        <div
                          key={f.id}
                          className="flex items-center justify-between gap-4 px-4 py-3"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-brand-dark">
                                {f.fecha}
                              </span>
                              <span className="rounded-sm bg-brand-beige px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-gray-700">
                                {f.empresaDestino}
                              </span>
                              {f.esRecurrenteAnual && (
                                <span className="rounded-sm bg-status-info/15 px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-status-info-dark">
                                  ANUAL
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 text-xs font-bold text-gray-900">
                              {f.titulo}
                            </p>
                            {f.descripcion && (
                              <p className="text-[11px] text-gray-500">
                                {f.descripcion}
                              </p>
                            )}
                          </div>

                          <button
                            type="button"
                            disabled={isGuardandoRh}
                            onClick={() => handleEliminarFeriado(f.id)}
                            className="inline-flex items-center gap-1 rounded-sm border border-status-danger/30 bg-status-danger/10 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-status-danger-dark hover:bg-status-danger/20"
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                            ELIMINAR
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: PUBLICACIONES CONMEMORATIVAS EN EL MURO */}
            {tabRh === "conmemorativos" && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <form
                  onSubmit={handleProgramarConmemorativoSubmit}
                  className="flex flex-col gap-4 rounded-sm border border-gray-200 bg-brand-beige/20 p-5 lg:col-span-6"
                >
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">
                      Programar Publicación Conmemorativa (Navidad, Año Nuevo, 14 de Febrero, etc.)
                    </h3>
                    <p className="mt-0.5 text-[11px] text-gray-600">
                      Se mostrará en el Calendario Corporativo y se publicará automáticamente en el Muro en la fecha elegida.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-gray-700">
                        FECHA CONMEMORATIVA *
                      </label>
                      <input
                        type="date"
                        required
                        value={conmFecha}
                        onChange={(e) => setConmFecha(e.target.value)}
                        className="h-9 w-full rounded-sm border border-gray-300 bg-brand-surface px-3 text-xs text-gray-900 focus:border-brand-dark focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-gray-700">
                        EMPRESA DESTINO *
                      </label>
                      <select
                        value={conmEmpresa}
                        onChange={(e) =>
                          setConmEmpresa(
                            e.target.value as "Ambas" | "AIF" | "ROYAL"
                          )
                        }
                        className="h-9 w-full rounded-sm border border-gray-300 bg-brand-surface px-3 text-xs text-gray-900 focus:border-brand-dark focus:outline-none"
                      >
                        <option value="Ambas">Ambas (AIF y ROYAL)</option>
                        <option value="AIF">AIF</option>
                        <option value="ROYAL">ROYAL</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-gray-700">
                      TÍTULO DE LA FECHA ESPECIAL *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. ¡Felices Fiestas Decembrinas! · Navidad AIF"
                      value={conmTitulo}
                      onChange={(e) => setConmTitulo(e.target.value)}
                      className="h-9 w-full rounded-sm border border-gray-300 bg-brand-surface px-3 text-xs text-gray-900 focus:border-brand-dark focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-gray-700">
                      MENSAJE CONMEMORATIVO PARA EL MURO *
                    </label>
                    <textarea
                      rows={3}
                      required
                      placeholder="Escribe el mensaje conmemorativo para toda la organización..."
                      value={conmContenido}
                      onChange={(e) => setConmContenido(e.target.value)}
                      className="w-full rounded-sm border border-gray-300 bg-brand-surface p-3 text-xs text-gray-900 focus:border-brand-dark focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-gray-700">
                      IMÁGENES CONMEMORATIVAS (OPCIONAL · PUEDES ELEGIR VARIAS)
                    </label>
                    <input
                      ref={conmFileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) =>
                        setConmArchivos(Array.from(e.target.files ?? []))
                      }
                      className="w-full rounded-sm border border-gray-300 bg-brand-surface px-3 py-1.5 text-xs text-gray-700 file:mr-3 file:rounded-sm file:border-0 file:bg-brand-dark file:px-3 file:py-1 file:text-[9px] file:font-bold file:uppercase file:text-brand-gold"
                    />
                    {conmArchivos.length > 0 && (
                      <p className="mt-1 text-[10px] font-semibold text-brand-dark">
                        {conmArchivos.length} imagen(es) lista(s) para subir
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-gray-800">
                      <input
                        type="checkbox"
                        checked={conmRequiereAcuse}
                        onChange={(e) => setConmRequiereAcuse(e.target.checked)}
                        className="h-4 w-4 accent-brand-dark"
                      />
                      <span>Solicitar Acuse de Recibo en el Muro</span>
                    </label>

                    <input
                      type="text"
                      value={conmDepartamento}
                      onChange={(e) => setConmDepartamento(e.target.value)}
                      placeholder="Depto (Todos)"
                      className="h-8 w-36 rounded-sm border border-gray-300 bg-brand-surface px-2.5 text-xs text-gray-800"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isGuardandoRh}
                    className="h-10 w-full rounded-sm bg-brand-dark text-[10px] font-bold uppercase tracking-widest text-brand-gold transition-colors hover:bg-brand-dark/90 disabled:opacity-50"
                  >
                    {isGuardandoRh
                      ? "PROGRAMANDO..."
                      : "PROGRAMAR FECHA CONMEMORATIVA EN MURO Y CALENDARIO"}
                  </button>
                </form>

                <div className="flex flex-col gap-3 lg:col-span-6">
                  <h3 className="text-sm font-bold text-gray-900">
                    Publicaciones Conmemorativas Programadas
                  </h3>
                  {datos.configRh.fechasConmemorativas.length === 0 ? (
                    <div className="flex h-44 items-center justify-center rounded-sm border border-dashed border-gray-200 p-6 text-center text-xs text-gray-400">
                      No hay publicaciones conmemorativas programadas aún (ej. Navidad, Año Nuevo, 14 de Febrero).
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100 rounded-sm border border-gray-200">
                      {datos.configRh.fechasConmemorativas.map((c) => (
                        <div
                          key={c.id}
                          className="flex items-start justify-between gap-4 px-4 py-3.5"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-rose-800">
                                {c.fecha}
                              </span>
                              <span className="rounded-sm bg-brand-beige px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-gray-700">
                                {c.empresaDestino}
                              </span>
                              {c.imagenesUrls.length > 0 && (
                                <span className="rounded-sm bg-brand-gold/20 px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-brand-dark">
                                  {c.imagenesUrls.length} IMAGEN(ES)
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-xs font-bold text-gray-900">
                              {c.titulo}
                            </p>
                            <p className="mt-0.5 line-clamp-2 text-[11px] text-gray-600">
                              {c.contenido}
                            </p>
                          </div>

                          <button
                            type="button"
                            disabled={isGuardandoRh}
                            onClick={() => handleEliminarConmemorativo(c.id)}
                            className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-status-danger/30 bg-status-danger/10 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-status-danger-dark hover:bg-status-danger/20"
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                            ELIMINAR
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: CUMPLEAÑOS Y ANIVERSARIOS (ENFOQUE 1 PÚBLICO + ENFOQUE 2 PRIVADO GREETING OVERLAY) */}
            {tabRh === "celebraciones" && (
              <form
                onSubmit={handleGuardarCelebracionesSubmit}
                className="flex flex-col gap-6"
              >
                <div className="rounded-sm border border-brand-gold/40 bg-brand-beige/30 px-4 py-3 text-xs text-gray-700">
                  <strong>Variables automáticas disponibles:</strong> Puedes usar{" "}
                  <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] font-bold text-brand-dark">
                    {"{nombre}"}
                  </code>
                  ,{" "}
                  <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] font-bold text-brand-dark">
                    {"{primer_nombre}"}
                  </code>
                  ,{" "}
                  <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] font-bold text-brand-dark">
                    {"{departamento}"}
                  </code>
                  ,{" "}
                  <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] font-bold text-brand-dark">
                    {"{puesto}"}
                  </code>
                  ,{" "}
                  <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] font-bold text-brand-dark">
                    {"{empresa}"}
                  </code>{" "}
                  y{" "}
                  <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] font-bold text-brand-dark">
                    {"{anios_servicio}"}
                  </code>
                  .
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  {(["cumpleanos", "aniversario"] as const).map((tipo) => {
                    const esCumple = tipo === "cumpleanos";
                    const cfg = celebracionesForm[tipo];

                    return (
                      <div
                        key={tipo}
                        className="flex flex-col gap-4 rounded-md border border-gray-200 bg-brand-beige/15 p-5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-3">
                          <div>
                            <span className="text-[9px] font-bold uppercase tracking-widest text-brand-gold">
                              {esCumple
                                ? "PLANTILLA DE CUMPLEAÑOS"
                                : "PLANTILLA DE ANIVERSARIO LABORAL"}
                            </span>
                            <h3 className="font-serif text-base font-bold text-gray-900">
                              {esCumple
                                ? "🎂 Felicitaciones de Cumpleaños"
                                : "🏆 Felicitaciones de Aniversario"}
                            </h3>
                          </div>

                          <button
                            type="button"
                            onClick={() => abrirVistaPreviaGreeting(tipo)}
                            className="rounded-sm border border-brand-dark bg-brand-surface px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-brand-dark transition-colors hover:bg-brand-dark hover:text-brand-gold"
                          >
                            ✨ PROBAR EFECTO SORPRESA
                          </button>
                        </div>

                        {/* Enfoque 1 y Enfoque 2 */}
                        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                          <label className="flex cursor-pointer items-start gap-2.5 rounded-sm border border-gray-200 bg-brand-surface p-3">
                            <input
                              type="checkbox"
                              checked={cfg.publicarEnMuro}
                              onChange={(e) =>
                                setCelebracionesForm((prev) => ({
                                  ...prev,
                                  [tipo]: {
                                    ...prev[tipo],
                                    publicarEnMuro: e.target.checked,
                                  },
                                }))
                              }
                              className="mt-0.5 h-4 w-4 accent-brand-dark"
                            />
                            <div>
                              <span className="block text-xs font-bold text-gray-900">
                                Enfoque 1: Público (Muro)
                              </span>
                              <span className="text-[10px] text-gray-500">
                                Publica automáticamente en el Muro mencionando al colaborador.
                              </span>
                            </div>
                          </label>

                          <label className="flex cursor-pointer items-start gap-2.5 rounded-sm border border-gray-200 bg-brand-surface p-3">
                            <input
                              type="checkbox"
                              checked={cfg.mostrarOverlayPrivado}
                              onChange={(e) =>
                                setCelebracionesForm((prev) => ({
                                  ...prev,
                                  [tipo]: {
                                    ...prev[tipo],
                                    mostrarOverlayPrivado: e.target.checked,
                                  },
                                }))
                              }
                              className="mt-0.5 h-4 w-4 accent-brand-dark"
                            />
                            <div>
                              <span className="block text-xs font-bold text-gray-900">
                                Enfoque 2: Privado (Sorpresa)
                              </span>
                              <span className="text-[10px] text-gray-500">
                                Confeti virtual y tarjeta personal al iniciar sesión en su día.
                              </span>
                            </div>
                          </label>
                        </div>

                        <div>
                          <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-gray-700">
                            ALCANCE EN EL MURO CORPORATIVO (ENFOQUE 1)
                          </label>
                          <select
                            value={cfg.alcanceMuro}
                            onChange={(e) =>
                              setCelebracionesForm((prev) => ({
                                ...prev,
                                [tipo]: {
                                  ...prev[tipo],
                                  alcanceMuro: e.target.value as
                                    | "General"
                                    | "Departamento",
                                },
                              }))
                            }
                            className="h-9 w-full rounded-sm border border-gray-300 bg-brand-surface px-3 text-xs text-gray-900"
                          >
                            <option value="General">
                              Muro General de su Empresa (Todos los departamentos)
                            </option>
                            <option value="Departamento">
                              Filtrado solo para su Departamento / Área
                            </option>
                          </select>
                        </div>

                        <div>
                          <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-gray-700">
                            TÍTULO DE LA FELICITACIÓN
                          </label>
                          <input
                            type="text"
                            value={cfg.tituloPlantilla}
                            onChange={(e) =>
                              setCelebracionesForm((prev) => ({
                                ...prev,
                                [tipo]: {
                                  ...prev[tipo],
                                  tituloPlantilla: e.target.value,
                                },
                              }))
                            }
                            className="h-9 w-full rounded-sm border border-gray-300 bg-brand-surface px-3 text-xs text-gray-900"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-gray-700">
                            MENSAJE DE FELICITACIÓN
                          </label>
                          <textarea
                            rows={3}
                            value={cfg.mensajePlantilla}
                            onChange={(e) =>
                              setCelebracionesForm((prev) => ({
                                ...prev,
                                [tipo]: {
                                  ...prev[tipo],
                                  mensajePlantilla: e.target.value,
                                },
                              }))
                            }
                            className="w-full rounded-sm border border-gray-300 bg-brand-surface p-3 text-xs text-gray-900"
                          />
                        </div>

                        {/* Subida de imágenes generales para la plantilla */}
                        <div>
                          <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-gray-700">
                            IMÁGENES / PLANTILLAS GRÁFICAS (SE MUESTRAN EN EL MURO Y EN EL OVERLAY DEL COLABORADOR)
                          </label>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            disabled={subiendoPlantillaTipo === tipo}
                            onChange={(e) =>
                              handleSubirImagenPlantilla(tipo, e)
                            }
                            className="w-full rounded-sm border border-gray-300 bg-brand-surface px-3 py-1.5 text-xs text-gray-700 file:mr-3 file:rounded-sm file:border-0 file:bg-brand-dark file:px-3 file:py-1 file:text-[9px] file:font-bold file:uppercase file:text-brand-gold"
                          />

                          {cfg.imagenesPlantilla.length > 0 && (
                            <div className="mt-3 grid grid-cols-3 gap-2">
                              {cfg.imagenesPlantilla.map((url, idx) => (
                                <div
                                  key={`${tipo}-img-${idx}`}
                                  className="relative aspect-[4/3] overflow-hidden rounded border border-gray-200 bg-neutral-100"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={url}
                                    alt={`Plantilla ${idx + 1}`}
                                    className="h-full w-full object-cover"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setCelebracionesForm((prev) => ({
                                        ...prev,
                                        [tipo]: {
                                          ...prev[tipo],
                                          imagenesPlantilla: prev[
                                            tipo
                                          ].imagenesPlantilla.filter(
                                            (_, i) => i !== idx
                                          ),
                                        },
                                      }))
                                    }
                                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/75 text-[10px] font-bold text-white hover:bg-status-danger"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-end border-t border-gray-100 pt-4">
                  <button
                    type="submit"
                    disabled={isGuardandoRh}
                    className="rounded-sm bg-brand-dark px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-brand-gold transition-colors hover:bg-brand-dark/90 disabled:opacity-50"
                  >
                    {isGuardandoRh
                      ? "GUARDANDO CONFIGURACIÓN..."
                      : "GUARDAR CONFIGURACIÓN DE CELEBRACIONES"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
