import Link from "next/link";
import { redirect } from "next/navigation";
import DateTimeDisplay from "@/components/dashboard/DateTimeDisplay";
import UltimasPublicaciones from "@/components/dashboard/UltimasPublicaciones";
import {
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
} from "@/components/ui/icons";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: colaborador } = await supabase
    .from("colaboradores")
    .select("nombre_completo, saldo_vacaciones, rol_sistema")
    .eq("id", user.id)
    .maybeSingle();

  const { data: ultimoComunicado } = await supabase
    .from("muro_publicaciones")
    .select("id, titulo, contenido")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nombreCompleto = colaborador?.nombre_completo?.trim() || "";
  const primerNombre = nombreCompleto
    ? nombreCompleto.split(" ")[0]
    : user.email?.split("@")[0] || "Colaborador";

  const iniciales = nombreCompleto
    ? nombreCompleto
        .split(/\s+/)
        .slice(0, 2)
        .map((palabra) => palabra[0]?.toUpperCase() ?? "")
        .join("")
    : "JR";

  const saldoVacaciones = colaborador?.saldo_vacaciones ?? 0;

  const extractoDestacado = ultimoComunicado?.contenido
    ? ultimoComunicado.contenido.length > 120
      ? `${ultimoComunicado.contenido.substring(0, 120).trimEnd()}...`
      : ultimoComunicado.contenido
    : "Consulta los avisos y boletines oficiales publicados recientemente por Recursos Humanos.";

  return (
    <div className="flex min-h-full flex-col px-12 py-8">
      {/* Top bar */}
      <div className="mb-10 flex items-center justify-end gap-4">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-600">
          ESPACIO DE TRABAJO SEGURO
        </span>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-dark text-xs font-semibold text-white">
          {iniciales}
        </div>
      </div>

      {/* Saludo y reloj */}
      <header className="mb-8 flex items-end justify-between border-b border-gray-300 pb-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-dark text-lg font-bold text-white">
            {iniciales}
          </div>
          <div className="flex flex-col">
            <h1 className="font-serif text-3xl font-bold text-gray-900">
              {`Hola, ${primerNombre}.`}
            </h1>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
              RESUMEN DE TU JORNADA.
            </p>
          </div>
        </div>
        <DateTimeDisplay />
      </header>

      {/* Grid superior */}
      <section className="mb-12 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Asistencia */}
        <div className="flex flex-col justify-between rounded-md bg-brand-surface p-6 shadow-sm">
          <div>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-dark text-brand-gold">
              <ClockIcon className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Asistencia</h2>
            <p className="mt-1 text-sm text-gray-500">
              Registra tu entrada y salida con validación geográfica.
            </p>
          </div>
          <Link
            href="/dashboard/asistencia"
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-brand-dark py-3 text-xs font-semibold text-brand-gold transition-colors hover:bg-brand-dark/90"
          >
            MARCAR ASISTENCIA
            <ChevronRightIcon className="h-4 w-4" />
          </Link>
        </div>

        {/* Saldo y alertas */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-1 flex-col items-center justify-center rounded-md bg-brand-surface p-6 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
              SALDO DE VACACIONES
            </span>
            <span className="my-2 font-serif text-6xl font-bold text-gray-900">
              {saldoVacaciones}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-brand-gold">
              PERIODOS ACTIVOS
            </span>
          </div>
          <div className="flex items-start gap-3 rounded-md border-l-4 border-status-success bg-brand-surface p-4 shadow-sm">
            <CheckCircleIcon className="mt-0.5 h-5 w-5 text-status-success" />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                ALERTA DE SOLICITUD
              </span>
              <span className="mt-1 text-xs font-medium text-gray-800">
                Consulta el estatus de tus solicitudes en tiempo real.
              </span>
            </div>
          </div>
        </div>

        {/* Comunicado oficial destacado */}
        <div className="flex flex-col justify-between rounded-md bg-brand-dark p-6 shadow-sm">
          <div>
            <span className="mb-3 block text-[10px] font-bold uppercase tracking-widest text-brand-gold">
              COMUNICADO OFICIAL
            </span>
            <h2 className="mb-3 line-clamp-2 font-serif text-lg font-bold leading-tight text-white">
              {ultimoComunicado?.titulo || "Muro Corporativo AIF"}
            </h2>
            <p className="line-clamp-3 text-xs leading-relaxed text-gray-300">
              {extractoDestacado}
            </p>
          </div>
          <Link
            href="/dashboard/muro"
            className="mt-6 block w-full rounded-md bg-white/10 py-3 text-center text-xs font-semibold text-white transition-colors hover:bg-white/20"
          >
            VER EN EL MURO
          </Link>
        </div>
      </section>

      {/* ACCIÓN 1: Últimas publicaciones con flex-1 flex flex-col para llenar la altura disponible */}
      <section className="flex flex-1 flex-col">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-serif text-xl font-bold text-gray-900">
            Últimas Publicaciones
          </h2>
          <Link
            href="/dashboard/muro"
            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-brand-dark transition-colors hover:text-brand-gold"
          >
            VER TODO EL MURO
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </Link>
        </div>

        <UltimasPublicaciones />
      </section>
    </div>
  );
}
