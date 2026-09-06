import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Entrega"
};

export default function EntregaLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}