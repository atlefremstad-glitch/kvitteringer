// Lager app-ikonene i public/icons. Kjør: node scripts/make-icons.mjs
import sharp from "sharp";

const svg = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0f766e"/>
  <g transform="translate(${pad} ${pad}) scale(${(512 - 2 * pad) / 512})">
    <path d="M136 72h240v368l-40-28-40 28-40-28-40 28-40-28-40 28z" fill="#ffffff"/>
    <rect x="176" y="148" width="160" height="22" rx="11" fill="#0f766e"/>
    <rect x="176" y="204" width="160" height="22" rx="11" fill="#0f766e"/>
    <rect x="176" y="260" width="100" height="22" rx="11" fill="#0f766e"/>
    <rect x="176" y="328" width="160" height="30" rx="8" fill="#14b8a6"/>
  </g>
</svg>`;

const out = [
  ["icon-192.png", 192, 40],
  ["icon-512.png", 512, 40],
  ["icon-maskable-512.png", 512, 100],
  ["apple-touch-icon.png", 180, 50],
];
for (const [name, size, pad] of out) {
  await sharp(Buffer.from(svg(pad))).resize(size, size).png().toFile(`public/icons/${name}`);
  console.log("laget", name);
}
await sharp(Buffer.from(svg(40))).resize(32, 32).png().toFile("src/app/icon.png");
