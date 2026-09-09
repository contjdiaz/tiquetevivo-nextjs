import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
  secondary: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
  ghost: "text-brand-700 hover:bg-brand-50",
  danger: "bg-error-600 text-white hover:bg-error-700 shadow-sm"
};

export default function Button({
  variant = "primary",
  rounded = "lg",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; rounded?: "lg" | "xl" | "full" }) {
  const radius = rounded === "full" ? "rounded-full" : rounded === "xl" ? "rounded-xl" : "rounded-lg";
  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap px-3 py-2 text-sm font-extrabold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${radius} ${variants[variant]} ${className}`}
      {...props}
    />
  );
}