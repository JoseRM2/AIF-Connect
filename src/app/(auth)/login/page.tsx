"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        setIsLoading(false);
        return;
      }

      // Mantenemos isLoading = true mientras Next.js completa la transición a /dashboard
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Ocurrió un error al iniciar sesión. Intenta nuevamente.");
      setIsLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen w-full items-center justify-center bg-brand-beige">
      <LoadingOverlay isLoading={isLoading} message="Iniciando sesión..." />
      <div className="mx-4 flex w-full max-w-md flex-col rounded-2xl bg-brand-surface p-10 shadow-2xl">
        {/* Logotipo */}
        <div className="mb-4 flex w-full justify-center">
          <div className="flex h-12 items-center gap-2 text-brand-dark">
            <span className="font-serif text-4xl font-black leading-none tracking-tight">
              AIF
            </span>
            <span className="text-[9px] font-medium leading-tight tracking-wide">
              ASESORÍA E INTELIGENCIA
              <br />
              FISCAL
            </span>
          </div>
        </div>

        <h1 className="mb-8 text-center font-serif text-xl font-semibold text-gray-800">
          Plataforma de Colaboradores
        </h1>

        <form onSubmit={handleLogin} className="flex flex-col space-y-6">
          {/* Correo */}
          <div className="flex flex-col space-y-2">
            <label
              htmlFor="email"
              className="text-[10px] font-bold uppercase tracking-widest text-gray-600"
            >
              CORREO ELECTRÓNICO
            </label>
            <div className="relative flex h-12 w-full items-center rounded-md border border-brand-beige bg-brand-surface px-4 focus-within:border-brand-gold">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="mr-3 h-5 w-5 text-gray-400"
              >
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@aif.com"
                autoComplete="email"
                className="w-full bg-transparent text-sm text-gray-800 outline-none placeholder-gray-400"
              />
            </div>
          </div>

          {/* Contraseña */}
          <div className="flex flex-col space-y-2">
            <label
              htmlFor="password"
              className="text-[10px] font-bold uppercase tracking-widest text-gray-600"
            >
              CONTRASEÑA
            </label>
            <div className="relative flex h-12 w-full items-center rounded-md border border-brand-beige bg-brand-surface px-4 focus-within:border-brand-gold">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="mr-3 h-5 w-5 text-gray-400"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full bg-transparent text-sm text-gray-800 outline-none placeholder-gray-400"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="flex h-12 w-full items-center justify-center rounded-md bg-brand-dark text-sm font-semibold tracking-wide text-white transition-colors hover:bg-brand-dark/90 disabled:opacity-60"
          >
            {isLoading ? "INICIANDO SESIÓN..." : "INICIAR SESIÓN"}
          </button>

          {error && (
            <p
              role="alert"
              className="text-center text-xs font-medium text-status-danger"
            >
              {error}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
