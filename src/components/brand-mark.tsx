import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/format";

type BrandMarkProps = {
  /** `mark` = compact header owl; `hero` = large landing owl; `wordmark` = typeset SAGE. */
  variant?: "mark" | "hero" | "wordmark";
  href?: string | null;
  className?: string;
  priority?: boolean;
};

const OWL = {
  width: 1634,
  height: 2308,
  src: "/brand/sage-owl.png",
} as const;

export function BrandMark({
  variant = "mark",
  href = "/",
  className,
  priority,
}: BrandMarkProps) {
  const inner =
    variant === "wordmark" ? (
      <span className={cn("font-wordmark text-xl text-[var(--gold)]", className)}>
        SAGE
      </span>
    ) : (
      <Image
        src={OWL.src}
        alt="SAGE"
        width={OWL.width}
        height={OWL.height}
        priority={priority}
        className={cn(
          "object-contain",
          variant === "mark" && "h-10 w-auto",
          variant === "hero" && "h-auto w-full max-w-[240px]",
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
