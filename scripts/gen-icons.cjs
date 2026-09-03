const sharp = require("sharp");
const fs = require("fs");

const src = "public/logo/cant logo.png";
const sizes = [
  { out: "public/icon-192.png", size: 192 },
  { out: "public/icon-512.png", size: 512 },
];

async function makeSquareIcon(srcPath, outPath, target) {
  const meta = await sharp(srcPath).metadata();
  const w = meta.width;
  const h = meta.height;

  // Transparent square canvas with the logo centered, padded to ~82% so it
  // sits inside the maskable safe zone (mind the 80% safe circle).
  const pad = 0.82;
  const logoW = Math.round(target * pad);
  const logoH = Math.round((logoW * h) / w);

  const canvas = sharp({
    create: {
      width: target,
      height: target,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });

  const logo = await sharp(srcPath)
    .resize(logoW, logoH, { fit: "inside" })
    .toBuffer();

  await canvas
    .composite([
      {
        input: logo,
        gravity: "center",
      },
    ])
    .png()
    .toFile(outPath);
  console.log("wrote", outPath, target);
}

(async () => {
  for (const s of sizes) await makeSquareIcon(src, s.out, s.size);

  // Next.js app icon + apple icon from the 512 version (opaque navy bg for iOS)
  const apple = await sharp("public/icon-512.png")
    .flatten({ background: "#1e3a5f" })
    .resize(180, 180)
    .png()
    .toBuffer();
  fs.writeFileSync("src/app/apple-icon.png", apple);
  fs.writeFileSync("src/app/icon.png", await sharp("public/icon-512.png").resize(512, 512).png().toBuffer());
  console.log("wrote src/app/icon.png + apple-icon.png");
})();
