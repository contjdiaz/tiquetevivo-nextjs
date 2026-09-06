import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pagar Saldo"
};

export default function PagarLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}