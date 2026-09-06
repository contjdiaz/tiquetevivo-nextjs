import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Aprobación"
};

export default function AprobarLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}