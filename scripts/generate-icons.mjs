// Generates the app icons (favicon, iOS home-screen icon, Android/PWA icons)
// from one SVG: the white bed glyph on brand blue, as in the header logo
// (lucide "bed-double", brand-600). Re-run after changing the logo:
//
//   node scripts/generate-icons.mjs
//
// Outputs (committed):
//   src/app/icon.svg              browser-tab favicon (Next adds the <link>)
//   src/app/apple-icon.png        180×180, iOS "Add to Home Screen"
//   public/icons/icon-192.png     Android / PWA manifest
//   public/icons/icon-512.png     Android / PWA manifest, install splash
//   public/icons/maskable-512.png Android adaptive icon (full-bleed, safe-zone glyph)
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const BRAND = "#1d40f5";
const BED_PATHS = [
  "M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8",
  "M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4",
  "M12 4v6",
  "M2 18h20",
];

// 24×24 lucide glyph scaled into a 512 canvas. `glyph` = glyph width as a
// fraction of the canvas; `radius` = corner radius of the background.
function svg({ glyph, radius }) {
  const size = 512;
  const scale = (size * glyph) / 24;
  const offset = (size - 24 * scale) / 2;
  const paths = BED_PATHS.map((d) => `<path d="${d}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${BRAND}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</g>
</svg>
`;
}

// Favicon: rounded tile like the header logo. Home-screen icons: square — the
// OS applies its own rounding/mask. Maskable: glyph kept inside the 80% safe zone.
const favicon = svg({ glyph: 0.62, radius: 112 });
const square = svg({ glyph: 0.6, radius: 0 });
const maskable = svg({ glyph: 0.48, radius: 0 });

const png = (source, size, file) =>
  sharp(Buffer.from(source)).resize(size, size).png({ compressionLevel: 9 }).toFile(file);

mkdirSync("public/icons", { recursive: true });
writeFileSync("src/app/icon.svg", favicon);
await png(square, 180, "src/app/apple-icon.png");
await png(square, 192, "public/icons/icon-192.png");
await png(square, 512, "public/icons/icon-512.png");
await png(maskable, 512, "public/icons/maskable-512.png");
console.log("Icons written.");
