import sharp from "sharp";
import pngToIco from "png-to-ico";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, "..", "src-tauri", "icons");

// Play triangle SVG with the brand gradient (#00e5ff → #0066ff)
// Centered in a square canvas with slight padding
function makeSvg(size) {
  // Padding: 12.5% each side → triangle occupies 75% of canvas
  const pad = size * 0.125;
  const w = size - pad * 2;
  const h = size - pad * 2;
  // Play triangle vertices (shifted right slightly for optical centering)
  const shiftX = size * 0.04;
  const x1 = pad + shiftX;
  const y1 = pad;
  const x2 = pad + w + shiftX;
  const y2 = pad + h / 2;
  const x3 = pad + shiftX;
  const y3 = pad + h;

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="${size}" y2="${size}" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#00e5ff"/>
      <stop offset="100%" stop-color="#0066ff"/>
    </linearGradient>
  </defs>
  <polygon points="${x1},${y1} ${x2},${y2} ${x3},${y3}" fill="url(#g)"/>
</svg>`;
}

const sizes = [32, 64, 128, 256, 512];

async function main() {
  mkdirSync(iconsDir, { recursive: true });

  // Generate PNGs at each size
  const pngBuffers = {};
  for (const size of sizes) {
    const svg = makeSvg(size);
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
    pngBuffers[size] = buf;
  }

  // Write named PNGs
  writeFileSync(join(iconsDir, "32x32.png"), pngBuffers[32]);
  writeFileSync(join(iconsDir, "64x64.png"), pngBuffers[64]);
  writeFileSync(join(iconsDir, "128x128.png"), pngBuffers[128]);
  writeFileSync(join(iconsDir, "128x128@2x.png"), pngBuffers[256]);
  writeFileSync(join(iconsDir, "icon.png"), pngBuffers[512]);

  // Windows Store logos
  const storeSizes = [
    ["Square30x30Logo.png", 30],
    ["Square44x44Logo.png", 44],
    ["Square71x71Logo.png", 71],
    ["Square89x89Logo.png", 89],
    ["Square107x107Logo.png", 107],
    ["Square142x142Logo.png", 142],
    ["Square150x150Logo.png", 150],
    ["Square284x284Logo.png", 284],
    ["Square310x310Logo.png", 310],
    ["StoreLogo.png", 50],
  ];
  for (const [name, s] of storeSizes) {
    const svg = makeSvg(s);
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
    writeFileSync(join(iconsDir, name), buf);
  }

  // Generate ICO (multi-size: 16, 24, 32, 48, 64, 256)
  const icoSizes = [16, 24, 32, 48, 64, 256];
  const icoBuffers = [];
  for (const s of icoSizes) {
    const svg = makeSvg(s);
    icoBuffers.push(await sharp(Buffer.from(svg)).png().toBuffer());
  }
  const ico = await pngToIco(icoBuffers);
  writeFileSync(join(iconsDir, "icon.ico"), ico);

  console.log("Icons generated successfully!");
}

main().catch(console.error);
