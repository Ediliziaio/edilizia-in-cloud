import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";

const SRC_DIR = "docs/mobile-store-assets/screenshots/ios-final";
const DST_DIR = "docs/mobile-store-assets/screenshots/ipad-13";
const W = 2064, H = 2752;
const BG = "#1E3A5F";
const PADDING = 200;

await fs.mkdir(DST_DIR, { recursive: true });
const files = (await fs.readdir(SRC_DIR)).filter(f => f.endsWith(".png"));

for (const f of files) {
  const src = path.join(SRC_DIR, f);
  const innerH = H - PADDING * 2;
  const innerW = Math.round(innerH * (1284 / 2778));
  const phoneBuf = await sharp(src).resize(innerW, innerH, { fit: "contain" }).png().toBuffer();
  await sharp({ create: { width: W, height: H, channels: 3, background: BG } })
    .composite([{ input: phoneBuf, top: PADDING, left: Math.round((W - innerW) / 2) }])
    .flatten({ background: BG })
    .png({ compressionLevel: 9 })
    .toFile(path.join(DST_DIR, f));
  console.log(`✓ ${f}`);
}
console.log(`\n✅ ${files.length} screenshot iPad pronti`);
