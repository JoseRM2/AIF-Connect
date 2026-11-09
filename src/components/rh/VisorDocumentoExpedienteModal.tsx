"use client";

import { useEffect, useMemo, useState } from "react";
import { FileTextIcon } from "@/components/ui/icons";
import {
  CATALOGO_DOCUMENTOS_EXPEDIENTE,
  ETIQUETA_DOCUMENTO,
  obtenerMapaDocumentosExpediente,
  obtenerUrlPublicaExpediente,
  type CategoriaDocumentoExpediente,
  type TipoDocumentoExpediente,
} from "@/lib/storage/expedientes";
import { createClient } from "@/lib/supabase/client";

export interface VisorDocumentoExpedienteModalProps {
  colaboradorId?: string | null;
  nombreColaborador: string;
  documentosIniciales?: Partial<Record<TipoDocumentoExpediente, string>>;
  comprobanteEstudiosUrl?: string | null;
  cartaRecomendacionUrl?: string | null;
  documentoInicial?: TipoDocumentoExpediente;
  onCerrar: () => void;
}

const CATEGORIAS_ORDEN: readonly CategoriaDocumentoExpediente[] = [
  "Identificación y Personal",
  "Contratación y Normatividad",
  "Equipos, Responsivas y Home Office",
] as const;

function esArchivoImagen(url: string): boolean {
  const sinQuery = url.split("?")[0]?.toLowerCase() ?? "";
  return (
    sinQuery.endsWith(".jpg") ||
    sinQuery.endsWith(".jpeg") ||
    sinQuery.endsWith(".png") ||
    sinQuery.endsWith(".webp")
  );
}

export default function VisorDocumentoExpedienteModal({
  colaboradorId,
  nombreColaborador,
  documentosIniciales,
  comprobanteEstudiosUrl,
  cartaRecomendacionUrl,
  documentoInicial,
  onCerrar,
}: VisorDocumentoExpedienteModalProps) {
  const supabase = useMemo(() => createClient(), []);

  const mapaBase = useMemo(() => {
    const inicial: Partial<Record<TipoDocumentoExpediente, string>> = {};
    const comp = obtenerUrlPublicaExpediente(supabase, comprobanteEstudiosUrl);
    if (comp) inicial.comprobante_estudios = comp;
    const carta = obtenerUrlPublicaExpediente(supabase, cartaRecomendacionUrl);
    if (carta) inicial.carta_recomendacion = carta;

    if (documentosIniciales) {
      for (const [k, v] of Object.entries(documentosIniciales) as [
        TipoDocumentoExpediente,
        string | undefined,
      ][]) {
        const url = obtenerUrlPublicaExpediente(supabase, v);
        if (url) inicial[k] = url;
      }
    }
    return inicial;
  }, [
    supabase,
    comprobanteEstudiosUrl,
    cartaRecomendacionUrl,
    documentosIniciales,
  ]);

  const [mapaDocumentos, setMapaDocumentos] =
    useState<Partial<Record<TipoDocumentoExpediente, string>>>(mapaBase);
  const [cargandoCatalogo, setCargandoCatalogo] = useState<boolean>(
    Boolean(colaboradorId && !colaboradorId.startsWith("row-"))
  );

  const [tipoActivo, setTipoActivo] = useState<TipoDocumentoExpediente>(() => {
    if (documentoInicial) return documentoInicial;
    const primeroConUrl = CATALOGO_DOCUMENTOS_EXPEDIENTE.find(
      (d) => mapaBase[d.tipo]
    );
    return primeroConUrl?.tipo ?? "ine";
  });

  // Cargar todos los documentos desde `public.expedientes_documentos`
  useEffect(() => {
    let cancelado = false;

    async function cargarExpediente() {
      if (!colaboradorId || colaboradorId.startsWith("row-")) {
        setMapaDocumentos(mapaBase);
        setCargandoCatalogo(false);
        return;
      }

      setCargandoCatalogo(true);
      try {
        const obtenido = await obtenerMapaDocumentosExpediente(
          supabase,
          colaboradorId,
          {
            comprobante_estudios_url: comprobanteEstudiosUrl,
            carta_recomendacion_url: cartaRecomendacionUrl,
          }
        );
        if (cancelado) return;

        const combinado: Partial<Record<TipoDocumentoExpediente, string>> = {
          ...mapaBase,
          ...obtenido,
        };
        setMapaDocumentos(combinado);

        if (!documentoInicial) {
          setTipoActivo((actual) => {
            if (combinado[actual]) return actual;
            const primeroDisponible = CATALOGO_DOCUMENTOS_EXPEDIENTE.find(
              (d) => combinado[d.tipo]
            );
            return primeroDisponible?.tipo ?? actual;
          });
        }
      } finally {
        if (!cancelado) {
          setCargandoCatalogo(false);
        }
      }
    }

    cargarExpediente();

    return () => {
      cancelado = true;
    };
  }, [
    supabase,
    colaboradorId,
    comprobanteEstudiosUrl,
    cartaRecomendacionUrl,
    documentoInicial,
    mapaBase,
  ]);

  const [verificandoArchivo, setVerificandoArchivo] = useState<boolean>(false);
  const [archivoInexistente, setArchivoInexistente] = useState<boolean>(false);

  const urlActiva = mapaDocumentos[tipoActivo] ?? null;
  const totalAdjuntos = useMemo(
    () =>
      CATALOGO_DOCUMENTOS_EXPEDIENTE.filter((d) =>
        Boolean(mapaDocumentos[d.tipo])
      ).length,
    [mapaDocumentos]
  );

  // Cerrar con tecla Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCerrar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCerrar]);

  // Verificar que el archivo realmente exista en el bucket "expedientes" antes de renderizarlo
  useEffect(() => {
    let cancelado = false;

    async function verificarRecursoEnStorage() {
      if (!urlActiva) {
        setArchivoInexistente(true);
        setVerificandoArchivo(false);
        return;
      }

      setVerificandoArchivo(true);
      setArchivoInexistente(false);

      try {
        const res = await fetch(urlActiva, { method: "HEAD" });
        if (cancelado) return;
        if (!res.ok) {
          setArchivoInexistente(true);
        }
      } catch {
        if (!cancelado) {
          setArchivoInexistente(true);
        }
      } finally {
        if (!cancelado) {
          setVerificandoArchivo(false);
        }
      }
    }

    verificarRecursoEnStorage();

    return () => {
      cancelado = true;
    };
  }, [urlActiva]);

  const mostrarEmptyState = !urlActiva || archivoInexistente;
  const etiquetaActiva = ETIQUETA_DOCUMENTO[tipoActivo] ?? "Documento";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="visor-expediente-titulo"
      onClick={onCerrar}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-sm bg-brand-surface shadow-2xl"
      >
        {/* Encabezado */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 bg-brand-dark px-6 py-4 text-white">
          <div>
            <span className="text-[9px] font-bold uppercase tracking-widest text-brand-gold">
              VISOR DE EXPEDIENTE DIGITAL · {totalAdjuntos} DE{" "}
              {CATALOGO_DOCUMENTOS_EXPEDIENTE.length} DOCUMENTOS CARGADOS
            </span>
            <h3
              id="visor-expediente-titulo"
              className="mt-0.5 font-serif text-base font-bold text-white"
            >
              Expediente de {nombreColaborador}
            </h3>
          </div>

          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar visor de expediente"
            className="rounded-sm px-2.5 py-1 text-xs font-bold uppercase tracking-widest text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            ✕ CERRAR
          </button>
        </header>

        {/* Contenedor dividido: Lista lateral de 20 documentos + Visor principal */}
        <div className="grid min-h-[460px] flex-1 grid-cols-1 overflow-hidden md:grid-cols-12">
          {/* Columna izquierda: Catálogo de los 20 documentos por categoría */}
          <aside className="max-h-[38vh] overflow-y-auto border-b border-gray-200 bg-brand-beige/25 p-4 md:col-span-4 md:max-h-[72vh] md:border-b-0 md:border-r">
            {CATEGORIAS_ORDEN.map((categoria) => {
              const docsCategoria = CATALOGO_DOCUMENTOS_EXPEDIENTE.filter(
                (d) => d.categoria === categoria
              );
              return (
                <div key={categoria} className="mb-4 last:mb-0">
                  <h4 className="mb-2 border-l-2 border-brand-gold pl-2 text-[8px] font-extrabold uppercase tracking-wider text-gray-700">
                    {categoria}
                  </h4>
                  <div className="flex flex-col gap-1.5">
                    {docsCategoria.map(({ tipo, etiqueta }) => {
                      const tieneUrl = Boolean(mapaDocumentos[tipo]);
                      const activo = tipoActivo === tipo;

                      return (
                        <button
                          key={tipo}
                          type="button"
                          onClick={() => setTipoActivo(tipo)}
                          className={`flex w-full items-center justify-between gap-2 rounded-sm border px-3 py-2 text-left text-[10px] font-bold transition-colors ${
                            activo
                              ? "border-brand-dark bg-brand-dark text-brand-gold"
                              : "border-gray-200 bg-brand-surface text-gray-800 hover:border-brand-dark/40"
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <FileTextIcon className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{etiqueta}</span>
                          </span>
                          <span
                            className={`shrink-0 rounded-sm px-1.5 py-0.5 text-[7px] font-extrabold uppercase tracking-wider ${
                              tieneUrl
                                ? activo
                                  ? "bg-brand-gold/20 text-brand-gold"
                                  : "bg-status-success/15 text-status-success-dark"
                                : "bg-gray-200/80 text-gray-500"
                            }`}
                          >
                            {tieneUrl ? "ADJUNTO" : "VACÍO"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </aside>

          {/* Columna derecha: Barra de acciones del documento activo + Visor / Empty State */}
          <div className="flex flex-col overflow-hidden md:col-span-8">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-brand-surface px-5 py-3">
              <div>
                <span className="text-[8px] font-bold uppercase tracking-widest text-gray-500">
                  DOCUMENTO SELECCIONADO
                </span>
                <p className="text-xs font-bold text-gray-900">
                  {etiquetaActiva}
                </p>
              </div>

              {!mostrarEmptyState && urlActiva && (
                <a
                  href={urlActiva}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-sm border border-brand-dark bg-brand-surface px-3.5 py-1.5 text-[9px] font-bold uppercase tracking-widest text-brand-dark transition-colors hover:bg-brand-dark hover:text-brand-gold"
                >
                  ABRIR EN PESTAÑA NUEVA ↗
                </a>
              )}
            </div>

            <div className="flex min-h-[360px] flex-1 flex-col items-center justify-center overflow-auto bg-neutral-100 p-5">
              {cargandoCatalogo || verificandoArchivo ? (
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="h-7 w-7 animate-spin rounded-full border-2 border-gray-300 border-t-brand-dark" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                    Consultando documento en el bucket &ldquo;expedientes&rdquo;...
                  </p>
                </div>
              ) : mostrarEmptyState ? (
                <div
                  role="status"
                  className="flex max-w-md flex-col items-center justify-center rounded-sm border border-dashed border-gray-300 bg-brand-surface px-8 py-12 text-center shadow-sm"
                >
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-beige text-gray-500">
                    <FileTextIcon className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-bold text-gray-900">
                    No hay ningún documento adjunto en el expediente
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-gray-500">
                    Este colaborador aún no cuenta con un archivo cargado para{" "}
                    <span className="font-semibold text-gray-700">
                      {etiquetaActiva}
                    </span>{" "}
                    en el bucket de almacenamiento.
                  </p>
                </div>
              ) : esArchivoImagen(urlActiva!) ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={urlActiva!}
                  alt={`${etiquetaActiva} de ${nombreColaborador}`}
                  onError={() => setArchivoInexistente(true)}
                  className="max-h-[62vh] max-w-full rounded-sm object-contain shadow-md"
                />
              ) : (
                <iframe
                  src={urlActiva!}
                  title={`${etiquetaActiva} de ${nombreColaborador}`}
                  onError={() => setArchivoInexistente(true)}
                  className="h-[62vh] w-full rounded-sm border border-gray-200 bg-white shadow-sm"
                />
              )}
            </div>
          </div>
        </div>

        {/* Pie del modal */}
        <footer className="flex items-center justify-end border-t border-gray-100 bg-brand-surface px-6 py-3">
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-sm bg-brand-dark px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-brand-gold transition-colors hover:bg-brand-dark/90"
          >
            CERRAR VISOR
          </button>
        </footer>
      </div>
    </div>
  );
}
