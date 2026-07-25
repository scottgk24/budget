import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/format";

type BrandMarkProps = {
  variant?: "lockup" | "owl" | "leaf" | "wordmark";
  href?: string | null;
  className?: string;
  priority?: boolean;
};

/** Intrinsic pixel sizes of files in /public/brand (keep in sync when re-exporting). */
const SIZES = {
  lockup: { width: 319, height: 176, src: "/brand/sage-lockup-v3.png" },
  owl: { width: 428, height: 544, src: "/brand/sage-owl-v3.png" },
  leaf: { width: 269, height: 269, src: "/brand/sage-leaf-s-v3.png" },
} as const;

export function BrandMark({
  variant = "lockup",
  href = "/",
  className,
  priority,
}: BrandMarkProps) {
  const inner =
    variant === "wordmark" ? (
      <span
        className={cn(
          "font-wordmark text-xl text-[var(--gold)]",
          className,
        )}
      >
        SAGE
      </span>
    ) : (
      <Image
        src={SIZES[variant].src}
        alt="SAGE"
        width={SIZES[variant].width}
        height={SIZES[variant].height}
        priority={priority}
        className={cn(
          "object-contain",
          variant === "lockup" && "h-10 w-auto",
          variant === "leaf" && "h-10 w-10",
          variant === "owl" && "h-auto w-full max-w-[240px]",
          className,
        )}
      />
    );

  if (href === null) return inner;

  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center overflow-visible"
      aria-label="SAGE home"
    >
      {inner}
    </Link>
  );
}
