import { cn } from "@/lib/utils";

type PhotoLogoProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
};

const sizeClasses = {
  sm: "text-[22px] tracking-[0.01em] translate-y-px",
  md: "text-[28px] tracking-[0.01em]",
  lg: "text-[36px] tracking-[0.015em]",
} as const;

export function PhotoLogo({ className, size = "md" }: PhotoLogoProps) {
  return (
    <span
      className={cn(
        "inline-block select-none font-logo font-bold leading-[0.9] text-foreground [-webkit-text-stroke:0.35px_currentColor] [paint-order:stroke_fill]",
        sizeClasses[size],
        className,
      )}
      aria-label="Photo"
    >
      Photo
    </span>
  );
}
