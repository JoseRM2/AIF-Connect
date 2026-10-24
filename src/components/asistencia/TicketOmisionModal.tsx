"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { TicketIcon } from "@/components/ui/icons";
import { createClient } from "@/lib/supabase/client";

interface TicketOmisionModalProps {
  userId: string;
  nombreColaborador: string;
  empresaColaborador?: string;
  fechaHoy: string;
}

const MOTIVOS_TICKET = [
  "Omisión Total de Marcado (Entrada / Salida)",
  "Omisión de Entrada",
  "Omisión de Salida",
  "Justificación de Retardo / Ubicación",
] as const;

const LABEL =
  "mb-1.5 block text-[9px] font-bold uppercase tracking-widest text-gray-400";
const FIELD =
  "w-full rounded-sm border border-gray-200 bg-brand-surface px-3 text-xs text-gray-800 focus:border-brand-dark focus:outline-none";

export default function TicketOmisionModal({
  userId,
  nombreColaborador,
  empresaColaborador = "AIF",
  fechaHoy,
}: TicketOmisionModalProps) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivoTipo, setMotivoTipo] = useState<string>(MOTIVOS_TICKET[0]);
  const [fechaAfectada, setFechaAfectada] = useState<string>(fechaHoy);
  const [horaEntrada, setHoraEntrada] = useState<string>("09:00");
  const [horaSalida, setHoraSalida] = useState<string>("18:00");
  const [explicacion, setExplicacion] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [exitoMsg, setExitoMsg] = useState<string | null>(null);

  const handleAbrir = () => {
    setErrorMsg(null);
    setExitoMsg(null);
    setAbierto(true);
  };

  const handleCerrar = () => {
    if (isSubmitting) return;
    setAbierto(false);
    setErrorMsg(null);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMsg(null);

    if (!fechaAfectada) {
      setErrorMsg("Selecciona la fecha afectada por la omisión.");
      return;
    }

    if (!explicacion.trim()) {
      setErrorMsg(
        "Describe la justificación detallada para que RH pueda validar tu ticket."
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = createClient();

      const motivoCompuesto = `[${motivoTipo} | Entrada: ${
        horaEntrada || "09:00"
      } - Salida: ${horaSalida || "18:00"}] ${explicacion.trim()}`;

      const { error } = await supabase.from("tickets_asistencia").insert({
        colaborador_id: userId,
        fecha_incidencia: fechaAfectada,
        motivo_omision: motivoCompuesto,
        estatus: "Abierto",
      });

      if (error) {
        setErrorMsg(`No se pudo enviar el ticket a RH: ${error.message}`);
        return;
      }

      setExplicacion("");
      setMotivoTipo(MOTIVOS_TICKET[0]);
      setFechaAfectada(fechaHoy);
      setHoraEntrada("09:00");
      setHoraSalida("18:00");
      setAbierto(false);
      setExitoMsg("Ticket de omisión enviado correctamente a Recursos Humanos.");
      router.refresh();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Ocurrió un error al registrar el ticket de omisión."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleAbrir}
        className="flex items-center gap-2 rounded-md border border-gray-300 bg-brand-surface px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-gray-800 shadow-sm transition-colors hover:bg-gray-50"
      >
        <TicketIcon className="h-4 w-4" />
        TICKET POR OMISIÓN A RH
      </button>

      {exitoMsg && (
        <p
          role="status"
          className="rounded-sm border border-status-success/30 bg-status-success/10 px-3 py-1.5 text-[11px] font-semibold text-status-success-dark"
        >
          {exitoMsg}
        </p>
      )}

      {abierto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-modal-ticket-omision"
          className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden overscroll-contain bg-black/60 p-4"
        >
          <div className="w-full max-w-lg overscroll-contain rounded-sm bg-brand-surface p-7 shadow-xl">
            {/* Encabezado del Modal */}
            <header className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-brand-gold">
                  SOLICITUD A RECURSOS HUMANOS
                </p>
                <h2
                  id="titulo-modal-ticket-omision"
                  className="mt-1 text-lg font-black leading-snug text-gray-900"
                >
                  Ticket de Omisión / Corrección de Asistencia
                </h2>
              </div>

              <button
                type="button"
                onClick={handleCerrar}
                aria-label="Cerrar modal"
                className="rounded-sm p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </header>

            {/* Banner informativo del colaborador */}
            <div className="mb-5 rounded-sm border border-gray-200/70 bg-brand-beige/35 px-4 py-3">
              <p className="text-[11px] font-bold text-gray-800">
                Colaborador: {nombreColaborador} ({empresaColaborador})
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-gray-600">
                Las solicitudes de omisión de marcaje o justificación geográfica
                serán revisadas y validadas por RH.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label htmlFor="ticket-motivo-tipo" className={LABEL}>
                  MOTIVO DEL TICKET
                </label>
                <select
                  id="ticket-motivo-tipo"
                  value={motivoTipo}
                  onChange={(e) => setMotivoTipo(e.target.value)}
                  className={`${FIELD} h-10 font-medium`}
                >
                  {MOTIVOS_TICKET.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="ticket-fecha-afectada" className={LABEL}>
                  FECHA AFECTADA
                </label>
                <input
                  id="ticket-fecha-afectada"
                  type="date"
                  value={fechaAfectada}
                  max={fechaHoy}
                  onChange={(e) => setFechaAfectada(e.target.value)}
                  required
                  className={`${FIELD} h-10 font-mono`}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="ticket-hora-entrada" className={LABEL}>
                    HORARIO ENTRADA REAL
                  </label>
                  <input
                    id="ticket-hora-entrada"
                    type="time"
                    value={horaEntrada}
                    onChange={(e) => setHoraEntrada(e.target.value)}
                    required
                    className={`${FIELD} h-10 font-mono`}
                  />
                </div>

                <div>
                  <label htmlFor="ticket-hora-salida" className={LABEL}>
                    HORARIO SALIDA REAL
                  </label>
                  <input
                    id="ticket-hora-salida"
                    type="time"
                    value={horaSalida}
                    onChange={(e) => setHoraSalida(e.target.value)}
                    required
                    className={`${FIELD} h-10 font-mono`}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="ticket-explicacion" className={LABEL}>
                  EXPLICACIÓN / JUSTIFICACIÓN DETALLADA
                </label>
                <textarea
                  id="ticket-explicacion"
                  value={explicacion}
                  onChange={(e) => setExplicacion(e.target.value)}
                  required
                  placeholder="Describe la causa (ej. falla de conexión a internet, comisión externa, olvido justificado)..."
                  className={`${FIELD} h-24 resize-y py-2.5 placeholder-gray-400`}
                />
              </div>

              {errorMsg && (
                <p
                  role="alert"
                  className="rounded-sm border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-xs font-semibold text-status-danger-dark"
                >
                  {errorMsg}
                </p>
              )}

              <div className="mt-2 flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
                <button
                  type="button"
                  onClick={handleCerrar}
                  disabled={isSubmitting}
                  className="h-10 rounded-sm border border-gray-300 bg-brand-surface px-5 text-[10px] font-bold uppercase tracking-widest text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-50"
                >
                  CANCELAR
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex h-10 items-center gap-2 rounded-sm bg-brand-dark px-5 text-[10px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-brand-dark/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <svg
                    className="h-3.5 w-3.5 text-brand-gold"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                  {isSubmitting ? "ENVIANDO..." : "ENVIAR A RH"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
