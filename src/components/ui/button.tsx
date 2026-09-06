import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md";

const variantClass: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-60",
  secondary:
    "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-60",
  danger:
    "border border-red-300 bg-white text-red-800 hover:bg-red-50 disabled:opacity-60",
  ghost: "text-slate-700 hover:bg-slate-100 disabled:opacity-60",
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
};

export function buttonClassName({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors",
    variantClass[variant],
    sizeClass[size],
    className,
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
};

export function Button({
  variant = "primary",
  size = "md",
  icon: Icon,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClassName({ variant, size, className })}
      {...props}
    >
      {Icon ? <Icon className="size-4 shrink-0" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

type ButtonLinkProps = Omit<React.ComponentProps<typeof Link>, "className"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  className?: string;
};

export function ButtonLink({
  variant = "primary",
  size = "md",
  icon: Icon,
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link className={buttonClassName({ variant, size, className })} {...props}>
      {Icon ? <Icon className="size-4 shrink-0" aria-hidden="true" /> : null}
      {children}
    </Link>
  );
}
