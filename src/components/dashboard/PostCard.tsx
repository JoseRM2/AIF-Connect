import Link from "next/link";
import { ChevronRightIcon } from "@/components/ui/icons";

export interface Post {
  id: string;
  date: string;
  title: string;
  excerpt: string;
  author: string;
  alcance?: string;
  requiereAcuse?: boolean;
  esProgramado?: boolean;
}

export default function PostCard({
  date,
  title,
  excerpt,
  author,
  alcance = "General",
  requiereAcuse = false,
  esProgramado = false,
}: Post) {
  return (
    <article className="flex h-full flex-col rounded-md border border-gray-100 bg-brand-surface p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex-1">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
            {date}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-sm border border-brand-gold/40 bg-brand-beige/60 px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-brand-dark">
              {alcance}
            </span>
            {esProgramado && (
              <span className="rounded-sm border border-brand-gold bg-brand-dark px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-brand-gold">
                ● PROGRAMADO
              </span>
            )}
            {requiereAcuse && (
              <span className="rounded-sm border border-status-warning/40 bg-status-warning/15 px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-status-warning">
                ● REQUIERE ACUSE
              </span>
            )}
          </div>
        </div>

        <h3 className="mb-2 font-serif text-base font-bold leading-tight text-gray-900">
          {title}
        </h3>

        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-brand-gold">
          POR: {author}
        </p>

        <p className="text-xs leading-relaxed text-gray-500">{excerpt}</p>
      </div>

      <footer className="mt-auto flex items-center justify-between border-t border-gray-100 pt-4">
        <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">
          COMUNICADO OFICIAL
        </span>

        <Link
          href="/dashboard/muro"
          className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-brand-dark transition-colors hover:text-brand-gold"
        >
          VER EN EL MURO
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </Link>
      </footer>
    </article>
  );
}
