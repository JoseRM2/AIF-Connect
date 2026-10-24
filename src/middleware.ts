import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Database } from "@/types/supabase";

const PROTECTED_PREFIXES = ["/dashboard", "/rh", "/zonas"];
const RH_ONLY_PREFIXES = ["/dashboard/rh", "/dashboard/zonas", "/rh", "/zonas"];

export async function middleware(request: NextRequest) {
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

  // Regla 3 (RBAC): Módulos exclusivos de Recursos Humanos (/dashboard/rh, /dashboard/zonas)
  const isRhOnlyRoute = RH_ONLY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (user && isRhOnlyRoute) {
    const { data: colaborador } = await supabase
      .from("colaboradores")
      .select("rol_sistema")
      .eq("id", user.id)
      .maybeSingle();

    const rolSistema = (colaborador?.rol_sistema ?? "").trim();

    if (rolSistema !== "Recursos Humanos") {
      const homeUrl = request.nextUrl.clone();
      homeUrl.pathname = "/dashboard";
      return NextResponse.redirect(homeUrl);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
