import type { Metadata } from "next";
import localFont from "next/font/local";
import { Playfair_Display, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Sans-serif geométrica: cuerpo, tablas, formularios, botones y navegación
const fontSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

// Serif editorial: logotipo, títulos, KPIs y titulares
const fontSerif = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

// Monoespaciada: coordenadas y códigos de ticket
const fontMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "AIF Connect",
  description: "Plataforma de Colaboradores - Asesoría e Inteligencia Fiscal",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${fontSans.variable} ${fontSerif.variable} ${fontMono.variable} bg-brand-beige font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
