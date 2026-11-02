import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";
import defaultTheme from "tailwindcss/defaultTheme";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Identidad institucional
        "brand-dark": "#1A181C", // Carbón: sidebar, botones primarios, avatars
        "brand-gold": "#B19B77", // Oro champagne: acentos, navegación activa
        "brand-beige": "#E4DED5", // Beige cálido de la captura: canvas general, navbar, fondos secundarios
        "brand-surface": "#FFFFFF", // Tarjetas, paneles, tablas, modales

        // Estados semánticos con contraste reforzado (>= 4.5:1 sobre fondos claros)
        "status-success": {
          DEFAULT: colors.emerald[700],
          dark: colors.emerald[800],
        }, // En zona, a tiempo, resuelto
        "status-danger": {
          DEFAULT: colors.rose[700],
          dark: colors.rose[800],
        }, // Fuera de rango, faltas, eliminar
        "status-warning": {
          DEFAULT: colors.amber[700],
          dark: colors.amber[900],
        }, // Retardo, pendiente de revisión
        "status-info": {
          DEFAULT: colors.blue[700],
          dark: colors.blue[900],
        }, // Home Office
      },
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1.4" }], // 12px (+1px)
        sm: ["0.875rem", { lineHeight: "1.45" }], // 14px (+1px)
        base: ["0.9375rem", { lineHeight: "1.5" }], // 15px (+1px)
      },
      fontFamily: {
        sans: ["var(--font-sans)", ...defaultTheme.fontFamily.sans],
        serif: ["var(--font-serif)", ...defaultTheme.fontFamily.serif],
        mono: ["var(--font-mono)", ...defaultTheme.fontFamily.mono],
      },
    },
  },
  plugins: [],
};

export default config;
