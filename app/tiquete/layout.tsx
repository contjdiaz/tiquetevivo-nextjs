import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tiquete"
};

export default function TiqueteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}