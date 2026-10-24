"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import CoverageSimulator from "@/components/zonas/CoverageSimulator";
import ZoneCatalog from "@/components/zonas/ZoneCatalog";
import ZoneFormModal from "@/components/zonas/ZoneFormModal";
import ZoneMapPanel from "@/components/zonas/ZoneMapPanel";
import ZoneMetrics from "@/components/zonas/ZoneMetrics";
import { PUNTOS_PRUEBA } from "@/lib/mock/zonas";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/types/supabase";
import type {
  ColaboradorAsignado,
  EmpresaZona,
  EstatusZona,
  TipoZona,
  Zona,
} from "@/types/zonas";

interface ZoneManagerProps {
  /** Bloque de títulos del encabezado. */
  encabezado?: ReactNode;
  /** Zonas iniciales de respaldo. */
  zonasIniciales?: Zona[];
  /** Colaboradores iniciales de respaldo. */
  colaboradores?: ColaboradorAsignado[];
}

interface ColaboradorDbRow {
  id: string;
  nombre_completo: string;
  puesto: string | null;
  empresa?: string | null;
  estatus?: string | null;
  zonas_geocerca: Json;
}

interface RawZonaJson {
  id?: string;
  nombre?: string;
  titulo?: string;
  direccion?: string;
  lat?: number | string;
  latitud?: number | string;
  lng?: number | string;
  lon?: number | string;
  longitud?: number | string;
  radio_m?: number | string;
  radio_metros?: number | string;
  radius?: number | string;
  tipo?: string;
  estatus?: string;
  empresa?: string;
  notas?: string | null;
}

function parseNumero(valor: unknown): number | null {
  if (typeof valor === "number" && Number.isFinite(valor)) return valor;
  if (typeof valor === "string" && valor.trim() !== "") {
    const n = Number(valor);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function normalizarEmpresaZona(raw: string | null | undefined): EmpresaZona {
  return (raw ?? "AIF").trim().toUpperCase() === "ROYAL" ? "ROYAL" : "AIF";
}

function extraerArregloZonasJson(raw: unknown): RawZonaJson[] {
  if (Array.isArray(raw)) {
    return raw.filter(
      (item): item is RawZonaJson => Boolean(item && typeof item === "object")
    );
  }
  if (raw && typeof raw === "object") {
    return [raw as RawZonaJson];
  }
  return [];
}

/**
 * Convierte las filas de `colaboradores` de Supabase en el catálogo de `Zona[]`
 * para el administrador de geocercas de RH.
 */
function construirZonasDesdeColaboradores(
  filas: ColaboradorDbRow[]
): Zona[] {
  const resultado: Zona[] = [];
  const sedesVistas = new Set<string>();

  filas.forEach((colab) => {
    const empColab = normalizarEmpresaZona(colab.empresa);
    const items = extraerArregloZonasJson(colab.zonas_geocerca);

    items.forEach((item, index) => {
      const lat = parseNumero(item.lat) ?? parseNumero(item.latitud);
      const lng =
        parseNumero(item.lng) ??
        parseNumero(item.lon) ??
        parseNumero(item.longitud);
      if (lat === null || lng === null) return;

      const radio =
        parseNumero(item.radio_m) ??
        parseNumero(item.radio_metros) ??
        parseNumero(item.radius) ??
        100;

      const titulo =
        (typeof item.titulo === "string" && item.titulo.trim()) ||
        (typeof item.nombre === "string" && item.nombre.trim()) ||
        `Zona ${colab.nombre_completo} #${index + 1}`;

      const tipo: TipoZona =
        item.tipo === "oficina" ? "oficina" : "home_office";
      const estatus: EstatusZona =
        item.estatus === "inactiva" ? "inactiva" : "activa";
      const empresa: EmpresaZona = item.empresa
        ? normalizarEmpresaZona(item.empresa)
        : empColab;

      const idZona =
        (typeof item.id === "string" && item.id.trim()) ||
        `zona-${colab.id}-${index + 1}`;

      const direccion =
        (typeof item.direccion === "string" && item.direccion.trim()) ||
        `Coordenadas (${lat.toFixed(5)}, ${lng.toFixed(5)})`;

      if (tipo === "oficina") {
        const claveSede = `${idZona}|${titulo.toLowerCase()}|${lat.toFixed(4)}|${lng.toFixed(4)}`;
        if (sedesVistas.has(claveSede)) return;
        sedesVistas.add(claveSede);

        resultado.push({
          id: idZona,
          titulo,
          nombre: titulo,
          direccion,
          lat,
          lng,
          radio_m: radio > 0 ? radio : 100,
          tipo: "oficina",
          estatus,
          empresa,
          colaborador: null,
          notas: item.notas ?? null,
        });
      } else {
        resultado.push({
          id: idZona,
          titulo,
          nombre: titulo,
          direccion,
          lat,
          lng,
          radio_m: radio > 0 ? radio : 100,
          tipo: "home_office",
          estatus,
          empresa,
          colaborador: {
            id: colab.id,
            nombre: colab.nombre_completo || "Colaborador",
            puesto: colab.puesto || "Colaborador",
          },
          notas: item.notas ?? null,
        });
      }
    });
  });

  return resultado;
}

function serializarZonaParaJsonb(zona: Zona): Record<string, Json> {
  return {
    id: zona.id,
    nombre: zona.titulo,
    titulo: zona.titulo,
    direccion: zona.direccion,
    lat: zona.lat,
    lng: zona.lng,
    latitud: zona.lat,
    longitud: zona.lng,
    radio_m: zona.radio_m,
    radio_metros: zona.radio_m,
    tipo: zona.tipo,
    estatus: zona.estatus,
    empresa: zona.empresa,
    notas: zona.notas ?? null,
  };
}

export default function ZoneManager({
  encabezado,
  zonasIniciales = [],
  colaboradores: colaboradoresIniciales = [],
}: ZoneManagerProps) {
  const [filasColaboradores, setFilasColaboradores] = useState<
    ColaboradorDbRow[]
  >([]);
  const [colaboradores, setColaboradores] = useState<ColaboradorAsignado[]>(
    colaboradoresIniciales
  );
  const [zonas, setZonas] = useState<Zona[]>(() =>
    zonasIniciales.map((z) => ({ ...z, nombre: z.nombre ?? z.titulo }))
  );
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(
    zonasIniciales[0]?.id ?? null
  );
  const [modalAbierto, setModalAbierto] = useState(false);
  const [zonaEnEdicion, setZonaEnEdicion] = useState<Zona | null>(null);
  const [zonaAEliminar, setZonaAEliminar] = useState<Zona | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [feedbackMsg, setFeedbackMsg] = useState<{
    tipo: "exito" | "error";
    texto: string;
  } | null>(null);

  const cargarDatosSupabase = useCallback(async () => {
    setIsLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("colaboradores")
        .select(
          "id, nombre_completo, puesto, empresa, estatus, zonas_geocerca"
        )
        .order("nombre_completo", { ascending: true });

      if (error || !data) {
        return;
      }

      const filas = data as ColaboradorDbRow[];
      setFilasColaboradores(filas);

      const listaColabs: ColaboradorAsignado[] = filas
        .filter(
          (c) => (c.estatus ?? "Activo").trim().toLowerCase() !== "inactivo"
        )
        .map((c) => ({
          id: c.id,
          nombre: c.nombre_completo || "Colaborador",
          puesto: c.puesto || "Colaborador",
        }));

      if (listaColabs.length > 0) {
        setColaboradores(listaColabs);
      }

      const zonasExtraidas = construirZonasDesdeColaboradores(filas);
      if (zonasExtraidas.length > 0) {
        setZonas(zonasExtraidas);
        setSeleccionadaId((prev) =>
          prev && zonasExtraidas.some((z) => z.id === prev)
            ? prev
            : (zonasExtraidas[0]?.id ?? null)
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargarDatosSupabase();
  }, [cargarDatosSupabase]);

  const seleccionada = zonas.find((z) => z.id === seleccionadaId) ?? null;

  /**
   * Persiste una nueva zona o actualiza una existente en `colaboradores.zonas_geocerca` (JSONB).
   */
  const handleGuardar = async (zonaInput: Zona) => {
    const zona: Zona = {
      ...zonaInput,
      nombre: zonaInput.nombre ?? zonaInput.titulo,
    };
    setFeedbackMsg(null);
    const supabase = createClient();
    const payloadZona = serializarZonaParaJsonb(zona);

    // Determinar a qué colaboradores aplicar la geocerca
    let idsDestino: string[] = [];

    if (zona.colaborador?.id) {
      idsDestino = [zona.colaborador.id];
    } else if (zona.tipo === "oficina") {
      const colabsEmpresa = filasColaboradores.filter(
        (c) =>
          normalizarEmpresaZona(c.empresa) === zona.empresa &&
          (c.estatus ?? "Activo").trim().toLowerCase() !== "inactivo"
      );
      idsDestino =
        colabsEmpresa.length > 0
          ? colabsEmpresa.map((c) => c.id)
          : filasColaboradores.map((c) => c.id);
    }

    if (idsDestino.length > 0) {
      for (const colabId of idsDestino) {
        const { data: colabActual, error: fetchError } = await supabase
          .from("colaboradores")
          .select("zonas_geocerca")
          .eq("id", colabId)
          .maybeSingle();

        if (fetchError) {
          throw new Error(
            `Error al leer las zonas del colaborador: ${fetchError.message}`
          );
        }

        const actuales = extraerArregloZonasJson(colabActual?.zonas_geocerca);
        const yaExiste = actuales.some((item) => item.id === zona.id);

        const nuevasZonas = yaExiste
          ? actuales.map((item) =>
              item.id === zona.id ? payloadZona : (item as unknown as Json)
            )
          : [...(actuales as unknown as Json[]), payloadZona];

        const { error: updateError } = await supabase
          .from("colaboradores")
          .update({ zonas_geocerca: nuevasZonas as unknown as Json })
          .eq("id", colabId);

        if (updateError) {
          throw new Error(
            `No fue posible guardar la zona en Supabase: ${updateError.message}`
          );
        }
      }
    }

    setZonas((prev) => {
      const existe = prev.some((z) => z.id === zona.id);
      if (existe) {
        return prev.map((z) => (z.id === zona.id ? zona : z));
      }
      return [zona, ...prev];
    });
    setSeleccionadaId(zona.id);
    setZonaEnEdicion(null);
    setFeedbackMsg({
      tipo: "exito",
      texto: `Zona "${zona.titulo}" (${zona.radio_m}m) guardada correctamente en Supabase.`,
    });

    await cargarDatosSupabase();
  };

  const handleEditar = (id: string) => {
    const objetivo = zonas.find((z) => z.id === id);
    if (!objetivo) return;
    setZonaEnEdicion(objetivo);
    setModalAbierto(true);
  };

  /**
   * Abre el modal de confirmación personalizado al hacer clic en eliminar una zona.
   */
  const handleSolicitarEliminar = (id: string) => {
    const zona = zonas.find((z) => z.id === id);
    if (!zona) return;
    setZonaAEliminar({ ...zona, nombre: zona.nombre ?? zona.titulo });
  };

  /**
   * Ejecuta la eliminación en Supabase, actualiza el estado local y cierra el modal.
   */
  const confirmarEliminacion = async (id: string) => {
    if (isDeleting) return;
    const zona =
      zonaAEliminar?.id === id
        ? zonaAEliminar
        : zonas.find((z) => z.id === id);

    if (!zona) {
      setZonaAEliminar(null);
      return;
    }

    setIsDeleting(true);
    setFeedbackMsg(null);
    const supabase = createClient();

    try {
      const idsAfectados = zona.colaborador?.id
        ? [zona.colaborador.id]
        : filasColaboradores.map((c) => c.id);

      for (const colabId of idsAfectados) {
        const { data: colabActual } = await supabase
          .from("colaboradores")
          .select("zonas_geocerca")
          .eq("id", colabId)
          .maybeSingle();

        const actuales = extraerArregloZonasJson(colabActual?.zonas_geocerca);
        const filtradas = actuales.filter(
          (item) =>
            item.id !== id &&
            (item.titulo ?? item.nombre ?? "") !== zona.titulo
        );

        if (filtradas.length !== actuales.length) {
          await supabase
            .from("colaboradores")
            .update({ zonas_geocerca: filtradas as unknown as Json })
            .eq("id", colabId);
        }
      }

      const restantes = zonas.filter((z) => z.id !== id);
      setZonas(restantes);
      if (seleccionadaId === id) setSeleccionadaId(restantes[0]?.id ?? null);
      setFeedbackMsg({
        tipo: "exito",
        texto: `Zona "${zona.nombre || zona.titulo}" eliminada correctamente.`,
      });
    } catch (err) {
      setFeedbackMsg({
        tipo: "error",
        texto:
          err instanceof Error
            ? err.message
            : "Error al eliminar la zona en Supabase.",
      });
    } finally {
      setIsDeleting(false);
      setZonaAEliminar(null);
    }
  };

  return (
    <>
      <header className="mb-8 flex flex-wrap items-start justify-between gap-6">
        {encabezado ?? (
          <div className="flex flex-col gap-1.5">
            <div className="inline-flex items-center gap-2.5">
              <span className="rounded-sm bg-brand-dark px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white">
                GEOCERCAS &amp; CONTROL GPS
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                MAPA INTERACTIVO NOMINATIM &amp; VALIDACIÓN HAVERSINE
              </span>
            </div>
            <h2 className="font-serif text-2xl font-black text-gray-900">
              Zonas Autorizadas y Geocercas
            </h2>
            <p className="max-w-2xl text-xs font-medium text-gray-500">
              Busca direcciones en el mapa interactivo, ajusta el pin y el radio
              en metros para asignar zonas de asistencia a los colaboradores.
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            setZonaEnEdicion(null);
            setModalAbierto(true);
          }}
          aria-haspopup="dialog"
          className="shrink-0 rounded-md bg-brand-dark px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-brand-gold shadow-sm transition-colors hover:bg-brand-dark/90"
        >
          + NUEVA ZONA AUTORIZADA
        </button>
      </header>

      {feedbackMsg && (
        <div
          role={feedbackMsg.tipo === "error" ? "alert" : "status"}
          aria-live="polite"
          className={`mb-6 flex items-center justify-between rounded-sm border px-4 py-3 text-xs font-semibold ${
            feedbackMsg.tipo === "exito"
              ? "border-status-success/40 bg-status-success/10 text-status-success-dark"
              : "border-status-danger/40 bg-status-danger/10 text-status-danger-dark"
          }`}
        >
          <span>{feedbackMsg.texto}</span>
          <button
            type="button"
            onClick={() => setFeedbackMsg(null)}
            className="ml-4 text-[10px] font-bold uppercase tracking-widest underline"
          >
            CERRAR
          </button>
        </div>
      )}

      <ZoneMetrics zonas={zonas} />

      {isLoading && zonas.length === 0 ? (
        <div className="mb-6 rounded-md bg-brand-surface p-8 text-center text-xs font-semibold text-gray-400 shadow-sm">
          Sincronizando zonas geocercadas desde Supabase...
        </div>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <ZoneCatalog
            zonas={zonas}
            seleccionadaId={seleccionadaId}
            onSeleccionar={setSeleccionadaId}
            onEditar={handleEditar}
            onEliminar={handleSolicitarEliminar}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-6 lg:col-span-7">
          <ZoneMapPanel zona={seleccionada} />
          <CoverageSimulator zonas={zonas} puntosPrueba={PUNTOS_PRUEBA} />
        </div>
      </div>

      {modalAbierto && (
        <ZoneFormModal
          colaboradores={colaboradores}
          zonaEditar={zonaEnEdicion}
          onGuardar={handleGuardar}
          onCerrar={() => {
            setModalAbierto(false);
            setZonaEnEdicion(null);
          }}
        />
      )}

      {zonaAEliminar && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirmar-eliminacion-zona-titulo"
          className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden overscroll-contain bg-black/55 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md overflow-hidden overscroll-contain rounded-md border-t-4 border-status-danger bg-brand-surface text-gray-900 shadow-2xl">
            {/* Encabezado institucional */}
            <header className="flex items-start justify-between gap-4 border-b border-gray-200 bg-brand-beige/50 px-6 py-4">
              <div className="flex flex-col gap-1">
                <p className="text-[9px] font-bold uppercase tracking-widest text-status-danger-dark">
                  ACCIÓN DESTRUCTIVA · CONTROL DE GEOCERCAS
                </p>
                <h3
                  id="confirmar-eliminacion-zona-titulo"
                  className="font-serif text-xl font-black text-gray-900"
                >
                  Confirmar Eliminación
                </h3>
              </div>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setZonaAEliminar(null)}
                className="rounded-sm border border-gray-200 bg-brand-surface px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-gray-500 transition-colors hover:text-gray-900 disabled:opacity-50"
              >
                CERRAR
              </button>
            </header>

            {/* Cuerpo */}
            <div className="flex flex-col gap-4 px-6 py-5">
              <p className="text-xs leading-relaxed text-gray-600">
                ¿Estás seguro de eliminar la geocerca{" "}
                <span className="font-bold text-gray-900">
                  &ldquo;{zonaAEliminar.nombre || zonaAEliminar.titulo}&rdquo;
                </span>
                ? Esta acción revocará el punto de asistencia autorizado y no se
                puede deshacer.
              </p>

              <div className="flex items-center justify-between gap-3 rounded-sm border border-gray-200 bg-brand-beige/40 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-gray-900">
                    {zonaAEliminar.nombre || zonaAEliminar.titulo}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-gray-500">
                    {zonaAEliminar.direccion}
                  </p>
                </div>
                <span className="shrink-0 rounded-sm border border-gray-300 bg-brand-surface px-2 py-0.5 font-mono text-[9px] font-bold uppercase text-gray-700">
                  {zonaAEliminar.radio_m}m · {zonaAEliminar.empresa}
                </span>
              </div>
            </div>

            {/* Footer */}
            <footer className="flex items-center justify-end gap-3 border-t border-gray-200 bg-brand-surface px-6 py-4">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setZonaAEliminar(null)}
                className="rounded-sm border border-gray-300 bg-brand-surface px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                CANCELAR
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => confirmarEliminacion(zonaAEliminar.id)}
                className="rounded-sm bg-status-danger px-6 py-2.5 text-[10px] font-bold uppercase tracking-widest text-white shadow-sm transition-colors hover:bg-status-danger-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeleting ? "ELIMINANDO..." : "SÍ, ELIMINAR"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
