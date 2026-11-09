import { redirect } from "next/navigation";
import { obtenerDatosCalendarioAction } from "@/app/actions/calendario";
import CalendarioWorkspace from "@/components/calendario/CalendarioWorkspace";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CalendarioPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const datosIniciales = await obtenerDatosCalendarioAction();

  return (
    <CalendarioWorkspace datosIniciales={datosIniciales} userId={user.id} />
  );
}
