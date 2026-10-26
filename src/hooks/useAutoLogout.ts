"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** 8 horas en milisegundos (8 * 60 * 60 * 1000 = 28,800,000 ms) */
const INACTIVITY_TIMEOUT_MS = 8 * 60 * 60 * 1000;

/** Intervalo mínimo para refrescar el temporizador ante eventos continuos (mousemove/scroll) */
const ACTIVITY_THROTTLE_MS = 1_000;

const STORAGE_KEY_LAST_ACTIVITY = "aif_connect_last_activity_ts";

const ACTIVITY_EVENTS: ReadonlyArray<keyof WindowEventMap> = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "click",
];

/**
 * Hook que rastrea la inactividad del usuario (mouse, teclado, scroll, touch).
 * Si transcurren más de 8 horas sin interacción, cierra la sesión en Supabase
 * (`supabase.auth.signOut()`) y redirige automáticamente a `/login`.
 */
export function useAutoLogout(timeoutMs: number = INACTIVITY_TIMEOUT_MS): void {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastResetRef = useRef<number>(Date.now());
  const isSigningOutRef = useRef<boolean>(false);

  const cerrarSesionPorInactividad = useCallback(async () => {
    if (isSigningOutRef.current) return;
    isSigningOutRef.current = true;

    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(STORAGE_KEY_LAST_ACTIVITY);
      }
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // Continuar con la redirección aunque falle la llamada de red
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }, [router]);

  const reiniciarTemporizador = useCallback(
    (forzar = false) => {
      if (isSigningOutRef.current) return;

      const ahora = Date.now();
      if (!forzar && ahora - lastResetRef.current < ACTIVITY_THROTTLE_MS) {
        return;
      }

      lastResetRef.current = ahora;

      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(
            STORAGE_KEY_LAST_ACTIVITY,
            String(ahora)
          );
        } catch {
          // Ignorar errores de almacenamiento en modo privado
        }
      }

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        void cerrarSesionPorInactividad();
      }, timeoutMs);
    },
    [cerrarSesionPorInactividad, timeoutMs]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Verificar si al montar o reactivar la pestaña ya transcurrieron las 8 horas
    const verificarInactividadAcumulada = () => {
      try {
        const guardado = window.localStorage.getItem(STORAGE_KEY_LAST_ACTIVITY);
        if (guardado) {
          const ultimaActividad = Number(guardado);
          if (
            Number.isFinite(ultimaActividad) &&
            Date.now() - ultimaActividad >= timeoutMs
          ) {
            void cerrarSesionPorInactividad();
            return true;
          }
        }
      } catch {
        // Ignorar errores de acceso a localStorage
      }
      return false;
    };

    if (verificarInactividadAcumulada()) {
      return;
    }

    reiniciarTemporizador(true);

    const handleUserActivity = () => {
      reiniciarTemporizador(false);
    };

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        if (!verificarInactividadAcumulada()) {
          reiniciarTemporizador(true);
        }
      }
    };

    const listenerOptions: AddEventListenerOptions = {
      passive: true,
      capture: true,
    };

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, handleUserActivity, listenerOptions);
    }
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);
    window.addEventListener("focus", handleVisibilityOrFocus);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(
          eventName,
          handleUserActivity,
          listenerOptions
        );
      }
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
      window.removeEventListener("focus", handleVisibilityOrFocus);
    };
  }, [cerrarSesionPorInactividad, reiniciarTemporizador, timeoutMs]);
}

export default useAutoLogout;
