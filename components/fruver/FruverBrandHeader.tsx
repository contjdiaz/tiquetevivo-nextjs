import VerticalBrandHeader from "@/components/vertical/BrandHeader";
import { DEFAULT_BRAND_COLOR } from "@/lib/fruver/brand";

interface FruverBrandHeaderProps {
  name: string;
  logoUrl?: string | null;
  color?: string | null;
  eyebrow?: string;
  compact?: boolean;
}

/**
 * Fruver brand header — thin wrapper over the generic `VerticalBrandHeader`
 * with the fruver story (cart emoji fallback, delivery eyebrow, green default).
 */
export default function FruverBrandHeader({ name, logoUrl, color, eyebrow = "Centro de pedidos y entregas", compact = false }: FruverBrandHeaderProps) {
  return (
    <VerticalBrandHeader
      name={name}
      logoUrl={logoUrl}
      color={color}
      defaultColor={DEFAULT_BRAND_COLOR}
      eyebrow={eyebrow}
      fallbackEmoji="🛒"
      compact={compact}
    />
  );
}