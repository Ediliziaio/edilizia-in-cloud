import sharp from "sharp";
// Campiona vari pixel del logo
const pts = [[100, 200], [200, 100], [250, 250], [350, 100]];
for (const [x, y] of pts) {
  const { data } = await sharp("src/assets/edilizia-in-cloud-logo.png")
    .extract({ left: x, top: y, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const [r, g, b] = data;
  console.log(`(${x},${y}): rgb(${r},${g},${b}) = #${[r,g,b].map(v=>v.toString(16).padStart(2,"0")).join("")}`);
}
