"use client";

import type { ComponentType, SVGProps } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthRole } from "@/components/auth/AuthRoleContext";
import {
  FileTextIcon,
  HomeIcon,
  ClockIcon,
  LogOutIcon,
  MapPinIcon,
  NewspaperIcon,
  SettingsIcon,
} from "@/components/ui/icons";
import type { RolSistema } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/client";

interface NavItem {
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const NAV_ITEMS_GENERAL: NavItem[] = [
  { label: "Inicio", href: "/dashboard", icon: HomeIcon },
  { label: "Mi Asistencia", href: "/dashboard/asistencia", icon: ClockIcon },
  {
    label: "Mis Solicitudes",
    href: "/dashboard/solicitudes",
    icon: FileTextIcon,
  },
  { label: "Muro Corporativo", href: "/dashboard/muro", icon: NewspaperIcon },
];

const NAV_ITEMS_JEFATURA: NavItem[] = [
  {
    label: "Gestión de Solicitudes",
    href: "/dashboard/jefatura",
    icon: FileTextIcon,
  },
];

const NAV_ITEMS_RH: NavItem[] = [
  { label: "Zonas Autorizadas", href: "/dashboard/zonas", icon: MapPinIcon },
  { label: "Panel RH", href: "/dashboard/rh", icon: SettingsIcon },
];

export default function Sidebar({
  rolSistema,
  esJefatura: esJefaturaProp,
}: {
  rolSistema?: RolSistema;
  esJefatura?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { rolSistema: rolContexto, esJefatura: esJefaturaContexto } =
    useAuthRole();

  const rolActual: RolSistema = rolSistema ?? rolContexto;
  const tienePersonalACargo =
    rolActual === "Jefatura" || Boolean(esJefaturaProp ?? esJefaturaContexto);
  const esRecursosHumanos = rolActual === "Recursos Humanos";

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col justify-between bg-brand-dark text-gray-300">
      <div>
        {/* Logo */}
        <div className="px-6 pb-10 pt-8">
          <div className="flex items-center gap-2">
            <span className="font-serif text-3xl font-black leading-none tracking-tight text-white">
              AIF
            </span>
            <span className="text-[9px] font-medium leading-tight tracking-wide text-brand-gold">
              ASESORÍA E INTELIGENCIA
              <br />
              FISCAL
            </span>
          </div>
        </div>

        {/* Menú */}
        <nav
          aria-label="Navegación principal"
          className="flex flex-col space-y-1"
        >
          {NAV_ITEMS_GENERAL.map(({ label, href, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`mx-3 flex items-center gap-3 rounded-md px-4 py-3 text-sm transition-colors ${
                  active
                    ? "bg-white/10 font-medium text-brand-gold"
                    : "text-gray-400 hover:bg-white/10 hover:text-brand-gold"
                }`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            );
          })}

          {tienePersonalACargo && (
            <>
              <div className="mx-6 my-2 border-t border-white/10 pt-2">
                <span className="text-[9px] font-bold uppercase tracking-widest text-brand-gold/80">
                  SUPERVISIÓN JEFATURA
                </span>
              </div>
              {NAV_ITEMS_JEFATURA.map(({ label, href, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`mx-3 flex items-center gap-3 rounded-md px-4 py-3 text-sm transition-colors ${
                      active
                        ? "bg-white/10 font-medium text-brand-gold"
                        : "text-gray-400 hover:bg-white/10 hover:text-brand-gold"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    {label}
                  </Link>
                );
              })}
            </>
          )}

          {esRecursosHumanos && (
            <>
              <div className="mx-6 my-2 border-t border-white/10 pt-2">
                <span className="text-[9px] font-bold uppercase tracking-widest text-brand-gold/80">
                  ADMINISTRACIÓN RH
                </span>
              </div>
              {NAV_ITEMS_RH.map(({ label, href, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`mx-3 flex items-center gap-3 rounded-md px-4 py-3 text-sm transition-colors ${
                      active
                        ? "bg-white/10 font-medium text-brand-gold"
                        : "text-gray-400 hover:bg-white/10 hover:text-brand-gold"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    {label}
                  </Link>
                );
              })}
            </>
          )}
        </nav>
      </div>

      {/* Cerrar sesión */}
      <button
        type="button"
        onClick={handleLogout}
        className="flex w-full cursor-pointer items-center gap-3 border-t border-white/10 px-6 py-6 text-left text-sm text-gray-400 transition-colors hover:text-brand-gold"
      >
        <LogOutIcon className="h-5 w-5" />
        Cerrar Sesión
      </button>
    </aside>
  );
}
