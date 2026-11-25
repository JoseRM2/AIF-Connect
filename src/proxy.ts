import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  esCuentaColaboradorActiva,
  esUsuarioAdminSistema,
  normalizarRolSistema,
} from "@/lib/auth/session";
import type { Database } from "@/types/supabase";

const PROTECTED_PREFIXES = ["/dashboard", "/rh", "/zonas", "/muro"];
const RH_ONLY_PREFIXES = ["/dashboard/rh", "/dashboard/zonas", "/rh", "/zonas"];
const ADMIN_ONLY_PREFIXES = ["/dashboard/admin"];

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresca la sesión activa del usuario si existe
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const isProtectedRoute = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  // Regla 1: Usuario no autenticado intentando acceder a rutas protegidas -> /login
  if (!user && isProtectedRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  // Regla 2: Usuario autenticado entrando a /login -> /dashboard
  if (user && (pathname === "/login" || pathname.startsWith("/login/"))) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    return NextResponse.redirect(dashboardUrl);
  }

  // Regla 3 (Seguridad de Bajas + RBAC): Verificar estatus activo en rutas protegidas y rol RH en rutas administrativas
  const isRhOnlyRoute = RH_ONLY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  const isAdminOnlyRoute = ADMIN_ONLY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (user && (isProtectedRoute || isRhOnlyRoute || isAdminOnlyRoute)) {
    let { data: colaborador } = await supabase
      .from("colaboradores")
      .select("rol_sistema, estatus, correo_corporativo")
      .eq("id", user.id)
      .maybeSingle();

    if (!colaborador && user.email) {
      const { data: colabPorCorreo } = await supabase
        .from("colaboradores")
        .select("rol_sistema, estatus, correo_corporativo")
        .ilike("correo_corporativo", user.email.trim())
        .maybeSingle();
      colaborador = colabPorCorreo ?? null;
    }

    // Si el colaborador fue dado de baja ('Inactivo' o 'Baja'), revocar sesión de inmediato
    if (colaborador && !esCuentaColaboradorActiva(colaborador.estatus)) {
      await supabase.auth.signOut();
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      return NextResponse.redirect(loginUrl);
    }

    if (isAdminOnlyRoute) {
      const esAdmin = esUsuarioAdminSistema(
        user.email,
        colaborador?.correo_corporativo
      );
      if (!esAdmin) {
        const homeUrl = request.nextUrl.clone();
        homeUrl.pathname = "/dashboard";
        return NextResponse.redirect(homeUrl);
      }
    }

    if (isRhOnlyRoute) {
      const rolSistema = normalizarRolSistema(colaborador?.rol_sistema);

      if (rolSistema !== "Recursos Humanos") {
        const homeUrl = request.nextUrl.clone();
        homeUrl.pathname = "/dashboard";
        return NextResponse.redirect(homeUrl);
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
