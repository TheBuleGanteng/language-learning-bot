// One-off script to generate placeholder PWA icons. Run with:
//   pnpm tsx scripts/gen-icons.ts
// Replace public/icon-192.png and public/icon-512.png with branded artwork
// before launching for real users.

import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('public');
mkdirSync(outDir, { recursive: true });

const BG = '#0ea5e9'; // theme color from manifest

async function makeIcon(size: number, outPath: string) {
  const fontSize = Math.round(size * 0.6);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="100%" height="100%" fill="${BG}"/>
    <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="${fontSize}"
      font-weight="700" fill="white" text-anchor="middle" dominant-baseline="central">L</text>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(outPath);
  console.log(`wrote ${outPath}`);
}

async function main() {
  await makeIcon(192, path.join(outDir, 'icon-192.png'));
  await makeIcon(512, path.join(outDir, 'icon-512.png'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
