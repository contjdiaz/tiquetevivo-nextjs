import type { ReactNode } from "react";
import VerticalActionCard from "@/components/vertical/ActionCard";

interface FruverActionCardProps {
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
  primary?: boolean;
  external?: boolean;
}

/**
 * Fruver CTA card — thin wrapper over the generic `VerticalActionCard` kept for
 * import compatibility with the existing fruver storybook.
 */
export default function FruverActionCard(props: FruverActionCardProps) {
  return <VerticalActionCard {...props} />;
}