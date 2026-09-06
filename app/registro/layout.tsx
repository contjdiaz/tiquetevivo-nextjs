import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Registro de Negocio"
};

export default function RegistroLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}