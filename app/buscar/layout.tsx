import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Buscar Pedido"
};

export default function BuscarLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}