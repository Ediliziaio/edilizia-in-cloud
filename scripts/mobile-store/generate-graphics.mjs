#!/usr/bin/env node
/**
 * generate-graphics.mjs — Genera asset grafici store + adaptive icon Android.
 *
 * Output:
 *   docs/mobile-store-assets/feature-graphic-1024x500.png   (Google Play)
 *   docs/mobile-store-assets/ios/icon-1024.png              (Apple — copia)
 *   docs/mobile-store-assets/android/adaptive-foreground-432.png
 *   docs/mobile-store-assets/android/adaptive-background-432.png
 *   docs/mobile-store-assets/android/play-icon-512.png      (Play Console)
 *
 * Uso:
 *   node scripts/mobile-store/generate-graphics.mjs
 */

import sharp from "sharp";
import { mkdir, copyFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const SRC_ICON = resolve("public/icons/icon-512.png");
const OUTPUT_DIR = resolve("docs/mobile-store-assets");

// Brand colors (allineati a capacitor.config.ts + tailwind)
const BG_COLOR = "#0a0a0f"; // navy quasi-nero del brand
const ACCENT_ORANGE = "#f97316"; // tailwind orange-500 (casco edile)
const TEXT_COLOR = "#ffffff";

// ─── 1) Apple App Store icon 1024x1024 (no alpha, no rounded corners) ─────
async function appleIcon() {
  const out = join(OUTPUT_DIR, "ios", "icon-1024.png");
  await mkdir(join(OUTPUT_DIR, "ios"), { recursive: true });
  // Apple richiede 1024x1024, no alpha. Flatten su sfondo brand.
  await sharp(SRC_ICON)
    .resize(1024, 1024, { fit: "contain", background: BG_COLOR })
    .flatten({ background: BG_COLOR })
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(`✓ ${out}`);
}

// ─── 2) Google Play store icon 512x512 (32-bit con alpha permesso) ────────
async function playIcon() {
  const out = join(OUTPUT_DIR, "android", "play-icon-512.png");
  await mkdir(join(OUTPUT_DIR, "android"), { recursive: true });
  await sharp(SRC_ICON)
    .resize(512, 512, { fit: "contain" })
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(`✓ ${out}`);
}

// ─── 3) Android Adaptive Icon — Foreground 432x432 ────────────────────────
// L'adaptive icon ha foreground + background. La safe zone è il cerchio
// inscritto nel centro (66dp di 108dp, ~264px su 432). Quindi ridimensioniamo
// l'icona al 60% del lato totale per stare comodi nella safe zone qualunque
// shape il launcher Android applichi (cerchio, squircle, square).
async function adaptiveForeground() {
  const out = join(OUTPUT_DIR, "android", "adaptive-foreground-432.png");
  const SAFE_PX = 264; // 60% di 432
  const icon = await sharp(SRC_ICON).resize(SAFE_PX, SAFE_PX, { fit: "contain" }).toBuffer();

  await sharp({
    create: {
      width: 432,
      height: 432,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }, // trasparente
    },
  })
    .composite([
      {
        input: icon,
        top: Math.round((432 - SAFE_PX) / 2),
        left: Math.round((432 - SAFE_PX) / 2),
      },
    ])
    .png()
    .toFile(out);
  console.log(`✓ ${out}`);
}

// ─── 4) Android Adaptive Icon — Background 432x432 (color solido) ─────────
async function adaptiveBackground() {
  const out = join(OUTPUT_DIR, "android", "adaptive-background-432.png");
  await sharp({
    create: {
      width: 432,
      height: 432,
      channels: 3,
      background: BG_COLOR,
    },
  })
    .png()
    .toFile(out);
  console.log(`✓ ${out}`);
}

// ─── 5) Feature Graphic Google Play 1024x500 ──────────────────────────────
// Gradient orizzontale brand → arancione + icona a sinistra + tagline a destra.
// Senza testo legale (vietato da Google).
async function featureGraphic() {
  const out = join(OUTPUT_DIR, "feature-graphic-1024x500.png");

  // SVG per gradient + testo. Sharp può comporre SVG su raster.
  const svg = `
    <svg width="1024" height="500" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${BG_COLOR}" />
          <stop offset="100%" stop-color="#1a1f2e" />
        </linearGradient>
        <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="${ACCENT_ORANGE}" stop-opacity="0.0" />
          <stop offset="60%" stop-color="${ACCENT_ORANGE}" stop-opacity="0.15" />
          <stop offset="100%" stop-color="${ACCENT_ORANGE}" stop-opacity="0.0" />
        </linearGradient>
      </defs>

      <!-- Background -->
      <rect width="1024" height="500" fill="url(#bg)" />
      <rect width="1024" height="500" fill="url(#accent)" />

      <!-- Pattern griglia sottile (cantiere) -->
      <g stroke="${TEXT_COLOR}" stroke-width="0.5" opacity="0.05">
        <path d="M0 100 L1024 100 M0 200 L1024 200 M0 300 L1024 300 M0 400 L1024 400" />
        <path d="M100 0 L100 500 M200 0 L200 500 M300 0 L300 500 M400 0 L400 500" />
      </g>

      <!-- Testo principale -->
      <text x="380" y="220"
            font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
            font-size="68"
            font-weight="800"
            fill="${TEXT_COLOR}">
        Edilizia in Cloud
      </text>

      <text x="380" y="280"
            font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
            font-size="32"
            font-weight="500"
            fill="${ACCENT_ORANGE}">
        Il gestionale per chi sta in cantiere
      </text>

      <text x="380" y="340"
            font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
            font-size="22"
            font-weight="400"
            fill="${TEXT_COLOR}"
            opacity="0.7">
        Cantieri · Preventivi · Fatture · AI · Marginalità
      </text>

      <!-- Badge "Made in Italy" -->
      <g transform="translate(380, 380)">
        <rect width="200" height="40" rx="20" ry="20"
              fill="none" stroke="${ACCENT_ORANGE}" stroke-width="2" />
        <text x="100" y="27"
              font-family="-apple-system, BlinkMacSystemFont, sans-serif"
              font-size="16"
              font-weight="600"
              fill="${ACCENT_ORANGE}"
              text-anchor="middle">
          MADE IN ITALY 🇮🇹
        </text>
      </g>
    </svg>
  `;

  // Icona a sinistra (~290px), centrata verticalmente
  const iconSize = 290;
  const iconBuf = await sharp(SRC_ICON).resize(iconSize, iconSize, { fit: "contain" }).toBuffer();

  await sharp(Buffer.from(svg))
    .composite([
      {
        input: iconBuf,
        top: Math.round((500 - iconSize) / 2),
        left: 50,
      },
    ])
    .png({ compressionLevel: 9 })
    .toFile(out);

  console.log(`✓ ${out}`);
}

// ─── 6) Android: genera anche le mipmap density (xxxhdpi/xxhdpi/xhdpi/hdpi/mdpi) ─
// Capacitor le wantsa già pronte in android/app/src/main/res/mipmap-*/
// Le mettiamo nella docs cartella per ora; lo script "apply-icons.sh" le copia
// (è una decisione manuale post-validazione visiva del foreground).
async function androidMipmaps() {
  const baseDir = join(OUTPUT_DIR, "android", "mipmap-preview");
  await mkdir(baseDir, { recursive: true });

  // ic_launcher (rounded) e ic_launcher_foreground sono i nomi standard Android
  const densities = [
    { name: "mdpi", size: 48 },
    { name: "hdpi", size: 72 },
    { name: "xhdpi", size: 96 },
    { name: "xxhdpi", size: 144 },
    { name: "xxxhdpi", size: 192 },
  ];

  for (const d of densities) {
    // ic_launcher (icona quadrata classica con background)
    await sharp(SRC_ICON)
      .resize(d.size, d.size, { fit: "contain", background: BG_COLOR })
      .flatten({ background: BG_COLOR })
      .png()
      .toFile(join(baseDir, `mipmap-${d.name}_ic_launcher.png`));

    // ic_launcher_round (rounded — Android applica la mask, ma forniamo lo stesso file)
    await sharp(SRC_ICON)
      .resize(d.size, d.size, { fit: "contain", background: BG_COLOR })
      .flatten({ background: BG_COLOR })
      .png()
      .toFile(join(baseDir, `mipmap-${d.name}_ic_launcher_round.png`));

    // ic_launcher_foreground (per adaptive icon, layer foreground)
    // Foreground SENZA bg, dimensione 108x108dp → size dp * density factor
    // mdpi=1x, hdpi=1.5x, xhdpi=2x, xxhdpi=3x, xxxhdpi=4x
    const factor = d.size / 48; // mdpi base
    const fgPx = Math.round(108 * factor);
    const safeFgPx = Math.round(fgPx * 0.6); // safe zone 60%
    const fgIcon = await sharp(SRC_ICON).resize(safeFgPx, safeFgPx, { fit: "contain" }).toBuffer();
    await sharp({
      create: {
        width: fgPx,
        height: fgPx,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        {
          input: fgIcon,
          top: Math.round((fgPx - safeFgPx) / 2),
          left: Math.round((fgPx - safeFgPx) / 2),
        },
      ])
      .png()
      .toFile(join(baseDir, `mipmap-${d.name}_ic_launcher_foreground.png`));
  }
  console.log(`✓ Android mipmaps (5 densità × 3 file) → ${baseDir}`);
}

// ─── 7) iPhone screenshots placeholder reminder ───────────────────────────
async function reminderFile() {
  const reminderPath = join(OUTPUT_DIR, "README.md");
  const content = `# Mobile Store Assets

Generato da \`scripts/mobile-store/generate-graphics.mjs\`.

## File generati

### Apple App Store
- \`ios/icon-1024.png\` — store icon (NO alpha, NO corner radius — Apple ce le applica)
- Screenshot iPhone 6.9": generare con \`scripts/mobile-store/capture-screenshots.mjs --platform=ios\`

### Google Play
- \`android/play-icon-512.png\` — store icon principale Play Console
- \`android/adaptive-foreground-432.png\` — adaptive icon layer "foreground"
- \`android/adaptive-background-432.png\` — adaptive icon layer "background" (solid color)
- \`android/mipmap-preview/\` — preview mipmaps (mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi) × 3 file each
- \`feature-graphic-1024x500.png\` — feature graphic (mostrata in cima alla scheda Play)
- Screenshot Android: generare con \`scripts/mobile-store/capture-screenshots.mjs --platform=android\`

## Come applicare le mipmap Android al progetto (post-validazione visiva)

Le mipmap sono solo in preview qui. Per applicarle al progetto Android:

\`\`\`bash
# Verifica visiva PRIMA di copiare!
open docs/mobile-store-assets/android/mipmap-preview/

# Se ok, copia in res/mipmap-*/ del progetto Android
for d in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
  for f in ic_launcher ic_launcher_round ic_launcher_foreground; do
    cp docs/mobile-store-assets/android/mipmap-preview/mipmap-\${d}_\${f}.png \\
       android/app/src/main/res/mipmap-\${d}/\${f}.png
  done
done

# Rebuilda
cd android && ./gradlew clean :app:assembleDebug
\`\`\`

## Adaptive icon XML (già configurato?)

Verifica che esista \`android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml\`:

\`\`\`xml
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
\`\`\`

Se manca, lo aggiungiamo nello step successivo.

## Schermate da catturare

Le 6 pagine selezionate in \`capture-screenshots.mjs\`:
1. Dashboard cantieri (\`/azienda\`)
2. Lista cantieri (\`/azienda/cantieri\`)
3. Commesse e marginalità (\`/azienda/ordini\`)
4. Silvio AI (\`/azienda/chat\`)
5. Personale e timbrature (\`/azienda/personale\`)
6. Fatturato (\`/azienda/fatturato\`)
`;
  await sharp({ create: { width: 1, height: 1, channels: 3, background: "#fff" } })
    .png()
    .toFile(join(OUTPUT_DIR, ".gitkeep.png"))
    .catch(() => {});
  // Scriviamo README via fs perché sharp non scrive testo
  const fs = await import("node:fs/promises");
  await fs.writeFile(reminderPath, content, "utf-8");
  console.log(`✓ ${reminderPath}`);
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log("🎨 Generating mobile store graphics...\n");
  await mkdir(OUTPUT_DIR, { recursive: true });

  await appleIcon();
  await playIcon();
  await adaptiveForeground();
  await adaptiveBackground();
  await featureGraphic();
  await androidMipmaps();
  await reminderFile();

  console.log("\n✅ Tutto pronto in docs/mobile-store-assets/");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
