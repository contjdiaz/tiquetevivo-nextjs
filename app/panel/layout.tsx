import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Panel de Negocio"
};

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}