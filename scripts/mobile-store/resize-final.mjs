import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";

const SRC = "docs/mobile-store-assets/screenshots/ios-final";
const W = 1284, H = 2778;

const files = (await fs.readdir(SRC)).filter(f => f.endsWith(".png"));
for (const f of files) {
  const p = path.join(SRC, f);
  const buf = await fs.readFile(p);
  const meta = await sharp(buf).metadata();
  if (meta.width === W && meta.height === H) {
    console.log(`= ${f} già ${W}x${H}`);
    continue;
  }
  await sharp(buf).resize(W, H, { fit: "cover", position: "center" }).png({ compressionLevel: 9 }).toFile(p);
  console.log(`✓ ${f} ${meta.width}x${meta.height} → ${W}x${H}`);
}
