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

        // Estados semánticos (valores de la paleta por defecto de Tailwind)
        "status-success": { DEFAULT: colors.emerald[500], dark: colors.emerald[700] }, // En zona, a tiempo, resuelto
        "status-danger": { DEFAULT: colors.rose[500], dark: colors.rose[700] }, // Fuera de rango, faltas, eliminar
        "status-warning": { DEFAULT: colors.amber[500], dark: colors.amber[800] }, // Retardo, pendiente de revisión
        "status-info": { DEFAULT: colors.blue[600], dark: colors.blue[800] }, // Home Office
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
