import fs from "fs";
import path from "path";
import Image from "next/image";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

export const metadata = {
  title: "SAGE · Brand gallery",
  description: "Preview SAGE brand marks",
};

type Asset = {
  file: string;
  src: string;
  width: number;
  height: number;
  bytes: number;
};

function listPngs(): Asset[] {
  const brandDir = path.join(process.cwd(), "public", "brand");
  if (!fs.existsSync(brandDir)) return [];

  return fs
    .readdirSync(brandDir)
    .filter((f) => f.endsWith(".png") && !f.startsWith("."))
    .sort()
    .map((file) => {
      const full = path.join(brandDir, file);
      const buf = fs.readFileSync(full);
      return {
        file,
        src: `/brand/${file}`,
        width: buf.readUInt32BE(16),
        height: buf.readUInt32BE(20),
        bytes: fs.statSync(full).size,
      };
    });
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function BrandGalleryPage() {
  const assets = listPngs();

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-4">
            <BrandMark variant="mark" href="/" />
            <div>
              <p className="font-wordmark text-xs text-[var(--gold)]">Brand</p>
              <h1 className="font-display text-xl font-medium tracking-tight">
                Asset gallery
              </h1>
            </div>
          </div>
          <Link
            href="/"
            className="text-sm text-[var(--muted)] transition hover:text-[var(--fg)]"
          >
            ← Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-14 px-6 py-10">
        <section>
          <h2 className="font-display text-2xl font-medium tracking-tight">
            In use
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Single mark for now — the main owl logo.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {(
              [
                { variant: "mark" as const, label: "Header mark", className: "h-14 w-auto" },
                { variant: "hero" as const, label: "Hero", className: "max-w-[160px]" },
                { variant: "wordmark" as const, label: "Typeset wordmark", className: "text-3xl" },
              ] as const
            ).map((item) => (
              <figure
                key={item.variant}
                className="flex flex-col items-center justify-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8"
              >
                <div className="flex h-44 w-full items-center justify-center">
                  <BrandMark
                    variant={item.variant}
                    href={null}
                    className={item.className}
                  />
                </div>
                <figcaption className="text-center text-sm text-[var(--muted)]">
                  {item.label}
                  <span className="mt-0.5 block font-mono text-xs text-[var(--olive)]">
                    variant=&quot;{item.variant}&quot;
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-display text-2xl font-medium tracking-tight">
            Files in /public/brand
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Click any tile to open the full image.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {assets.map((asset) => (
              <a
                key={asset.src}
                href={asset.src}
                target="_blank"
                rel="noreferrer"
                className="group overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] transition hover:border-[var(--gold)]"
              >
                <div
                  className="relative flex h-56 items-center justify-center p-6"
                  style={{
                    backgroundImage:
                      "linear-gradient(45deg, color-mix(in srgb, var(--hunter) 35%, var(--bg)) 25%, transparent 25%), linear-gradient(-45deg, color-mix(in srgb, var(--hunter) 35%, var(--bg)) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, color-mix(in srgb, var(--hunter) 35%, var(--bg)) 75%), linear-gradient(-45deg, transparent 75%, color-mix(in srgb, var(--hunter) 35%, var(--bg)) 75%)",
                    backgroundSize: "16px 16px",
                    backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
                    backgroundColor: "var(--bg)",
                  }}
                >
                  <Image
                    src={asset.src}
                    alt={asset.file}
                    width={asset.width}
                    height={asset.height}
                    className="max-h-full w-auto max-w-full object-contain"
                    unoptimized
                  />
                </div>
                <div className="border-t border-[var(--border)] px-4 py-3">
                  <p className="truncate font-mono text-sm group-hover:text-[var(--gold)]">
                    {asset.file}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {asset.width}×{asset.height} · {formatBytes(asset.bytes)}
                  </p>
                </div>
              </a>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
