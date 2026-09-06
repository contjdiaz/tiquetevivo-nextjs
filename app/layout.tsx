import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import RegisterSw from "@/components/ui/RegisterSw";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://tiquete.netlify.app"),
  title: {
    default: "TiqueteVivo — Fideliza y recupera clientes",
    template: "%s · TiqueteVivo"
  },
  description:
    "Plataforma de tiquetes digitales con QR para lavanderías y negocios de servicio. Fidelización, recordatorios por WhatsApp y recuperación de clientes.",
  applicationName: "TiqueteVivo",
  manifest: "/manifest.json",
  keywords: ["tiquete digital", "fidelización", "lavandería", "QR", "whatsapp", "recordatorios"],
  icons: {
    icon: "/favicon.svg",
    apple: "/icon-192.svg"
  },
  openGraph: {
    type: "website",
    title: "TiqueteVivo — Fideliza y recupera clientes",
    description:
      "Tiquetes digitales con QR, fidelización y reactivación de clientes para lavanderías y negocios de servicio.",
    images: ["/og-tiquete.svg"],
    locale: "es_CO"
  }
};

export const viewport: Viewport = {
  themeColor: "#0B6E4F",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body>
        <RegisterSw />
        {children}
      </body>
    </html>
  );
}