"use client";

import { useEffect, useMemo, useState } from "react";
import { FileTextIcon } from "@/components/ui/icons";
import {
  obtenerUrlPublicaExpediente,
  type TipoDocumentoExpediente,
} from "@/lib/storage/expedientes";
import { createClient } from "@/lib/supabase/client";

export interface VisorDocumentoExpedienteModalProps {
  nombreColaborador: string;
  comprobanteEstudiosUrl?: string | null;
  cartaRecomendacionUrl?: string | null;
  documentoInicial?: TipoDocumentoExpediente;
  onCerrar: () => void;
}

const CATALOGO_DOCUMENTOS: Array<{
  tipo: TipoDocumentoExpediente;
  etiqueta: string;
}> = [
  {
    tipo: "comprobante_estudios",
    etiqueta: "Comprobante de Estudios",
  },
  {
    tipo: "carta_recomendacion",
    etiqueta: "Carta de Recomendación",
  },
];

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
  nombreColaborador,
  comprobanteEstudiosUrl,
  cartaRecomendacionUrl,
  documentoInicial,
  onCerrar,
}: VisorDocumentoExpedienteModalProps) {
  const supabase = useMemo(() => createClient(), []);

  // Resolver URLs públicas desde el bucket `expedientes` usando supabase.storage.from('expedientes').getPublicUrl(...)
  const urlPublicaComprobante = useMemo(
    () => obtenerUrlPublicaExpediente(supabase, comprobanteEstudiosUrl),
    [supabase, comprobanteEstudiosUrl]
  );

  const urlPublicaCarta = useMemo(
    () => obtenerUrlPublicaExpediente(supabase, cartaRecomendacionUrl),
    [supabase, cartaRecomendacionUrl]
  );

  const [tipoActivo, setTipoActivo] = useState<TipoDocumentoExpediente>(() => {
    if (documentoInicial) return documentoInicial;
    if (urlPublicaComprobante) return "comprobante_estudios";
    if (urlPublicaCarta) return "carta_recomendacion";
    return "comprobante_estudios";
  });

  const [verificandoArchivo, setVerificandoArchivo] = useState<boolean>(false);
  const [archivoInexistente, setArchivoInexistente] = useState<boolean>(false);

  const urlActiva =
    tipoActivo === "comprobante_estudios"
      ? urlPublicaComprobante
      : urlPublicaCarta;

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
        // Si falla la petición de red o el objeto no existe en el bucket
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
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-sm bg-brand-surface shadow-2xl"
      >
        {/* Encabezado */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 bg-brand-dark px-6 py-4 text-white">
          <div>
            <span className="text-[9px] font-bold uppercase tracking-widest text-brand-gold">
              VISOR DE EXPEDIENTE DIGITAL · STORAGE BUCKET &ldquo;EXPEDIENTES&rdquo;
            </span>
            <h3
              id="visor-expediente-titulo"
              className="mt-0.5 font-serif text-base font-bold text-white"
            >
              Documentos de {nombreColaborador}
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

        {/* Selector de documentos del expediente */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-brand-beige/30 px-6 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {CATALOGO_DOCUMENTOS.map(({ tipo, etiqueta }) => {
              const tieneUrl =
                tipo === "comprobante_estudios"
                  ? Boolean(urlPublicaComprobante)
                  : Boolean(urlPublicaCarta);
              const activo = tipoActivo === tipo;

              return (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => setTipoActivo(tipo)}
                  className={`inline-flex items-center gap-2 rounded-sm border px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors ${
                    activo
                      ? "border-brand-dark bg-brand-dark text-brand-gold"
                      : "border-gray-200 bg-brand-surface text-gray-600 hover:border-brand-dark/40 hover:text-gray-900"
                  }`}
                >
                  <FileTextIcon className="h-3.5 w-3.5" />
                  <span>{etiqueta}</span>
                  <span
                    className={`rounded-sm px-1.5 py-0.5 text-[8px] ${
                      tieneUrl
                        ? activo
                          ? "bg-brand-gold/20 text-brand-gold"
                          : "bg-status-success/15 text-status-success-dark"
                        : "bg-gray-200/80 text-gray-500"
                    }`}
                  >
                    {tieneUrl ? "ADJUNTO" : "SIN ARCHIVO"}
                  </span>
                </button>
              );
            })}
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

        {/* Cuerpo del visor / Empty State */}
        <div className="flex min-h-[380px] flex-1 flex-col items-center justify-center overflow-auto bg-neutral-100 p-6">
          {verificandoArchivo ? (
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
                  {tipoActivo === "comprobante_estudios"
                    ? "Comprobante de Estudios"
                    : "Carta de Recomendación"}
                </span>{" "}
                en el bucket de almacenamiento.
              </p>
            </div>
          ) : esArchivoImagen(urlActiva!) ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={urlActiva!}
              alt={`Documento de ${nombreColaborador}`}
              onError={() => setArchivoInexistente(true)}
              className="max-h-[65vh] max-w-full rounded-sm object-contain shadow-md"
            />
          ) : (
            <iframe
              src={urlActiva!}
              title={`Documento de expediente de ${nombreColaborador}`}
              onError={() => setArchivoInexistente(true)}
              className="h-[65vh] w-full rounded-sm border border-gray-200 bg-white shadow-sm"
            />
          )}
        </div>

        {/* Pie del modal */}
        <footer className="flex items-center justify-end border-t border-gray-100 bg-brand-surface px-6 py-3.5">
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
