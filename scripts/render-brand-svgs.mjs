/**
 * High-fidelity SAGE brand marks as SVG → crisp transparent PNGs via sharp.
 * Colors from brand kit: gold #D4A857, hunter #2C5F2B, olive #5C6B46.
 */
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../public/brand");
const appDir = path.join(__dirname, "../src/app");

const GOLD = "#D4A857";
const GOLD_HI = "#E8C87A";
const GOLD_LO = "#B8913E";
const GREEN_L = "#6B8F5A";
const GREEN_M = "#4A6B3C";
const GREEN_D = "#2C5F2B";
const GREEN_OL = "#5C6B46";
const STROKE = "#1a2a18";

const goldGrad = (id) => `
  <linearGradient id="${id}" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="${GOLD_HI}"/>
    <stop offset="45%" stop-color="${GOLD}"/>
    <stop offset="100%" stop-color="${GOLD_LO}"/>
  </linearGradient>`;

/** Circular seal: owl head line art (matches brand kit monoline seal). */
function sealSvg(size = 1024) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 200 200" fill="none">
  <defs>${goldGrad("g")}</defs>
  <circle cx="100" cy="100" r="78" stroke="url(#g)" stroke-width="3"/>
  <!-- continuous face + ear-tuft silhouette -->
  <path d="M64 92
           C64 70 78 52 92 44
           L100 56
           L108 44
           C122 52 136 70 136 92
           C138 112 124 134 100 154
           C76 134 62 112 64 92Z"
        stroke="url(#g)" stroke-width="3" stroke-linejoin="round"/>
  <!-- brow V -->
  <path d="M78 86 C86 74 94 70 100 78 C106 70 114 74 122 86"
        stroke="url(#g)" stroke-width="3" stroke-linecap="round" fill="none"/>
  <!-- eyes -->
  <circle cx="86" cy="100" r="5" fill="url(#g)"/>
  <circle cx="114" cy="100" r="5" fill="url(#g)"/>
  <!-- beak -->
  <path d="M100 106 L105 116 L100 122 L95 116 Z" fill="url(#g)"/>
</svg>`;
}

/** Horizontal lockup */
function lockupSvg(w = 1600, h = 520) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 800 260" fill="none">
  <defs>${goldGrad("g")}</defs>
  <!-- seal icon, left -->
  <g transform="translate(20,30) scale(1)">
    <circle cx="100" cy="100" r="78" stroke="url(#g)" stroke-width="3.2"/>
    <path d="M100 48 C118 48 138 58 142 78 C146 98 132 128 100 158 C68 128 54 98 58 78 C62 58 82 48 100 48Z"
          stroke="url(#g)" stroke-width="3.2" stroke-linejoin="round"/>
    <path d="M58 86 C62 62 78 52 100 68 C122 52 138 62 142 86"
          stroke="url(#g)" stroke-width="3.2" stroke-linecap="round" fill="none"/>
    <path d="M100 68 L100 86" stroke="url(#g)" stroke-width="3.2" stroke-linecap="round"/>
    <circle cx="82" cy="98" r="5.5" fill="url(#g)"/>
    <circle cx="118" cy="98" r="5.5" fill="url(#g)"/>
    <path d="M100 104 L106 116 L100 122 L94 116 Z" fill="url(#g)"/>
  </g>
  <!-- wordmark -->
  <text x="250" y="168" fill="url(#g)"
        font-family="Outfit, Montserrat, Avenir Next, Helvetica Neue, Arial, sans-serif"
        font-size="118" font-weight="600" letter-spacing="0.18em">SAGE</text>
</svg>`;
}

/** Leaf-S monogram */
function leafSvg(size = 1024) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 200 200" fill="none">
  <defs>
    ${goldGrad("g")}
    <linearGradient id="leafG" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${GREEN_OL}"/>
      <stop offset="100%" stop-color="${GREEN_D}"/>
    </linearGradient>
  </defs>
  <!-- upper gold stroke of S -->
  <path d="M118 28
           C86 22 48 42 52 78
           C56 108 92 118 118 108
           C132 102 140 92 138 82"
        stroke="url(#g)" stroke-width="18" stroke-linecap="round" fill="none"/>
  <!-- upper tip leaf flare -->
  <path d="M138 82 C148 70 162 58 172 52 C158 58 142 70 132 84 Z" fill="url(#g)"/>
  <!-- lower gold stroke of S -->
  <path d="M82 172
           C114 178 152 158 148 122
           C144 92 108 82 82 92
           C68 98 60 108 62 118"
        stroke="url(#g)" stroke-width="18" stroke-linecap="round" fill="none"/>
  <!-- lower tip leaf flare -->
  <path d="M62 118 C52 130 38 142 28 148 C42 142 58 130 68 116 Z" fill="url(#g)"/>
  <!-- green leaf fills -->
  <path d="M78 58 C70 72 74 92 96 98 C108 88 108 68 96 54 C90 52 82 52 78 58Z" fill="url(#leafG)"/>
  <path d="M122 142 C130 128 126 108 104 102 C92 112 92 132 104 146 C110 148 118 148 122 142Z" fill="url(#leafG)"/>
  <!-- accent dot -->
  <circle cx="148" cy="96" r="8" fill="url(#g)"/>
</svg>`;
}

/** Full geometric owl + wordmark (primary mark) */
function owlSvg(w = 1024, h = 1400) {
  // Leaf panel helper: vertical almond
  const leaf = (cx, cy, rx, ry, rot, fill) =>
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${STROKE}" stroke-width="1.4" transform="rotate(${rot} ${cx} ${cy})"/>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 320 440" fill="none">
  <defs>
    ${goldGrad("g")}
    <linearGradient id="L" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${GREEN_L}"/>
      <stop offset="100%" stop-color="${GREEN_M}"/>
    </linearGradient>
    <linearGradient id="R" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${GREEN_M}"/>
      <stop offset="100%" stop-color="${GREEN_D}"/>
    </linearGradient>
    <linearGradient id="C" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${GREEN_OL}"/>
      <stop offset="100%" stop-color="${GREEN_D}"/>
    </linearGradient>
  </defs>

  <!-- head (split) -->
  <path d="M160 46
           C190 46 214 62 220 92
           C224 114 214 132 160 132
           C106 132 96 114 100 92
           C106 62 130 46 160 46Z" fill="url(#L)" stroke="${STROKE}" stroke-width="1.4"/>
  <path d="M160 46
           C190 46 214 62 220 92
           C224 114 214 132 160 132
           Z" fill="url(#R)" stroke="${STROKE}" stroke-width="1.4"/>
  <!-- ear tufts -->
  <path d="M108 78 L96 42 L128 62 Z" fill="url(#L)" stroke="${STROKE}" stroke-width="1.2"/>
  <path d="M212 78 L224 42 L192 62 Z" fill="url(#R)" stroke="${STROKE}" stroke-width="1.2"/>

  <!-- eyes + beak -->
  <circle cx="138" cy="92" r="9" fill="url(#g)"/>
  <circle cx="182" cy="92" r="9" fill="url(#g)"/>
  <path d="M160 98 L168 112 L160 118 L152 112 Z" fill="url(#g)"/>

  <!-- upper chest / wings -->
  ${leaf(118, 168, 28, 52, -18, GREEN_L)}
  ${leaf(202, 168, 28, 52, 18, GREEN_D)}
  ${leaf(140, 178, 22, 48, -6, GREEN_M)}
  ${leaf(180, 178, 22, 48, 6, GREEN_OL)}
  ${leaf(160, 188, 20, 50, 0, GREEN_D)}

  <!-- mid body -->
  ${leaf(124, 236, 24, 44, -12, GREEN_L)}
  ${leaf(196, 236, 24, 44, 12, GREEN_D)}
  ${leaf(148, 246, 18, 42, -4, GREEN_M)}
  ${leaf(172, 246, 18, 42, 4, GREEN_OL)}
  ${leaf(160, 252, 16, 40, 0, GREEN_D)}

  <!-- branch -->
  <path d="M48 292 C110 286 210 286 252 292 C268 294 278 288 286 278"
        stroke="url(#g)" stroke-width="3.2" stroke-linecap="round" fill="none"/>
  <!-- berries -->
  <circle cx="262" cy="276" r="4.2" fill="url(#g)"/>
  <circle cx="274" cy="268" r="5" fill="url(#g)"/>
  <circle cx="286" cy="262" r="3.6" fill="url(#g)"/>
  <circle cx="292" cy="274" r="3.2" fill="url(#g)"/>
  <circle cx="278" cy="282" r="3" fill="url(#g)"/>
  <path d="M252 292 L262 276 M252 292 L274 268 M252 292 L286 262 M252 292 L292 274 M252 292 L278 282"
        stroke="url(#g)" stroke-width="1.6" stroke-linecap="round"/>

  <!-- talons -->
  <rect x="138" y="282" width="5" height="14" rx="2" fill="url(#g)"/>
  <rect x="148" y="282" width="5" height="14" rx="2" fill="url(#g)"/>
  <rect x="167" y="282" width="5" height="14" rx="2" fill="url(#g)"/>
  <rect x="177" y="282" width="5" height="14" rx="2" fill="url(#g)"/>

  <!-- tail feathers -->
  ${leaf(140, 330, 16, 36, -16, GREEN_L)}
  ${leaf(160, 336, 16, 38, 0, GREEN_M)}
  ${leaf(180, 330, 16, 36, 16, GREEN_D)}

  <!-- wordmark -->
  <text x="160" y="402" text-anchor="middle" fill="url(#g)"
        font-family="Outfit, Montserrat, Avenir Next, Helvetica Neue, Arial, sans-serif"
        font-size="42" font-weight="500" letter-spacing="0.28em">SAGE</text>
</svg>`;
}

/** Line-art full owl */
function owlLineSvg(size = 1024) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 200 260" fill="none">
  <defs>${goldGrad("g")}</defs>
  <!-- outer body -->
  <path d="M100 28
           C132 28 158 52 158 92
           C158 148 142 188 100 220
           C58 188 42 148 42 92
           C42 52 68 28 100 28Z"
        stroke="url(#g)" stroke-width="3" fill="none"/>
  <!-- ear tufts / brow -->
  <path d="M52 78 C58 48 78 36 100 52 C122 36 142 48 148 78"
        stroke="url(#g)" stroke-width="3" stroke-linecap="round" fill="none"/>
  <path d="M100 52 L100 72" stroke="url(#g)" stroke-width="3" stroke-linecap="round"/>
  <!-- face disc -->
  <path d="M68 88 C72 72 86 66 100 74 C114 66 128 72 132 88 C134 104 120 122 100 132 C80 122 66 104 68 88Z"
        stroke="url(#g)" stroke-width="2.6" fill="none"/>
  <circle cx="86" cy="96" r="4.5" fill="url(#g)"/>
  <circle cx="114" cy="96" r="4.5" fill="url(#g)"/>
  <path d="M100 102 L105 112 L100 118 L95 112 Z" fill="url(#g)"/>
  <!-- wing curves -->
  <path d="M58 120 C70 140 78 170 72 200" stroke="url(#g)" stroke-width="2.6" fill="none" stroke-linecap="round"/>
  <path d="M142 120 C130 140 122 170 128 200" stroke="url(#g)" stroke-width="2.6" fill="none" stroke-linecap="round"/>
  <!-- perch + feet -->
  <line x1="78" y1="228" x2="122" y2="228" stroke="url(#g)" stroke-width="3" stroke-linecap="round"/>
  <rect x="84" y="220" width="8" height="12" rx="2" fill="url(#g)"/>
  <rect x="108" y="220" width="8" height="12" rx="2" fill="url(#g)"/>
</svg>`;
}

async function render(svg, dest, { width, height } = {}) {
  let pipeline = sharp(Buffer.from(svg));
  if (width || height) {
    pipeline = pipeline.resize({
      width,
      height,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  }
  // Ensure transparent PNG; trim empty margins with a little padding via extend after trim
  const buf = await pipeline.png({ compressionLevel: 9 }).toBuffer();
  const trimmed = await sharp(buf)
    .trim({ threshold: 8 })
    .extend({ top: 24, bottom: 24, left: 24, right: 24, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(dest);
  console.log("wrote", path.basename(dest), trimmed.width + "x" + trimmed.height);
  return trimmed;
}

async function squareIcon(src, size, dest) {
  const meta = await sharp(src).metadata();
  const pad = Math.round(size * 0.12);
  const inner = size - pad * 2;
  await sharp(src)
    .resize({
      width: inner,
      height: inner,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .extend({
      top: pad,
      bottom: pad,
      left: pad,
      right: pad,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .resize(size, size)
    .png()
    .toFile(dest);
  console.log("icon", path.basename(dest), size);
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  // Render at high internal resolution then trim
  await render(sealSvg(2048), path.join(outDir, "sage-seal-v5.png"), { width: 2048, height: 2048 });
  await render(leafSvg(2048), path.join(outDir, "sage-leaf-s-v5.png"), { width: 2048, height: 2048 });
  await render(owlLineSvg(2048), path.join(outDir, "sage-owl-line-v5.png"), { width: 2048, height: 2048 });
  await render(owlSvg(1600, 2200), path.join(outDir, "sage-owl-v5.png"), { width: 1600, height: 2200 });
  await render(lockupSvg(2400, 780), path.join(outDir, "sage-lockup-v5.png"), { width: 2400, height: 780 });

  // Promote v5 → canonical names used by BrandMark
  const map = [
    ["sage-owl-v5.png", "sage-owl.png"],
    ["sage-owl-v5.png", "sage-owl-v3.png"],
    ["sage-leaf-s-v5.png", "sage-leaf-s.png"],
    ["sage-leaf-s-v5.png", "sage-leaf-s-v3.png"],
    ["sage-lockup-v5.png", "sage-lockup.png"],
    ["sage-lockup-v5.png", "sage-lockup-v3.png"],
    ["sage-seal-v5.png", "sage-seal.png"],
    ["sage-owl-line-v5.png", "sage-owl-line.png"],
  ];
  for (const [a, b] of map) {
    fs.copyFileSync(path.join(outDir, a), path.join(outDir, b));
  }

  await squareIcon(path.join(outDir, "sage-leaf-s-v5.png"), 32, path.join(outDir, "favicon-32.png"));
  await squareIcon(path.join(outDir, "sage-leaf-s-v5.png"), 180, path.join(outDir, "apple-touch-icon.png"));
  await squareIcon(path.join(outDir, "sage-leaf-s-v5.png"), 512, path.join(outDir, "icon-512.png"));
  fs.copyFileSync(path.join(outDir, "icon-512.png"), path.join(appDir, "icon.png"));
  fs.copyFileSync(path.join(outDir, "apple-touch-icon.png"), path.join(appDir, "apple-icon.png"));

  // Also keep SVG sources
  const svgDir = path.join(outDir, "svg");
  fs.mkdirSync(svgDir, { recursive: true });
  fs.writeFileSync(path.join(svgDir, "sage-seal.svg"), sealSvg(200));
  fs.writeFileSync(path.join(svgDir, "sage-leaf-s.svg"), leafSvg(200));
  fs.writeFileSync(path.join(svgDir, "sage-owl-line.svg"), owlLineSvg(200));
  fs.writeFileSync(path.join(svgDir, "sage-owl.svg"), owlSvg(320, 440));
  fs.writeFileSync(path.join(svgDir, "sage-lockup.svg"), lockupSvg(800, 260));
  console.log("SVG sources in public/brand/svg/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
