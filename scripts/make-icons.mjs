// Lager app-ikonene fra ReceiptMe-logoen. Kjør: node scripts/make-icons.mjs
// brand/symbol.png er symbolet (mappe + kvittering + skjold) klippet ut av brand/receiptme-logo.jpg
// med gjennomsiktig bakgrunn. Bakgrunnen tegnes på nytt her, så ikonene blir skarpe i alle størrelser.
import sharp from "sharp";

const FROM = "#056b5a"; // mørk grønn, øverst til venstre i logoen
const TO = "#96d563"; // lys grønn, nederst til høyre

const background = (size, radius = 0) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${FROM}"/><stop offset="0.55" stop-color="#2f9565"/><stop offset="1" stop-color="${TO}"/>
  </linearGradient></defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#g)"/>
</svg>`);

/** size: ikonets størrelse. scale: hvor stor del av bredden symbolet tar. radius: avrundede hjørner (0 = firkantet). */
async function icon(file, size, scale, radius = 0) {
  const w = Math.round(size * scale);
  const symbol = await sharp("brand/symbol.png").resize({ width: w, height: w, fit: "inside" }).toBuffer();
  const meta = await sharp(symbol).metadata();
  // Symbolet har skjoldet nede til høyre, så det flyttes litt opp og til venstre for å se sentrert ut
  const left = Math.round((size - meta.width) / 2 - size * 0.01);
  const top = Math.round((size - meta.height) / 2 - size * 0.015);
  await sharp(background(size, radius)).composite([{ input: symbol, left, top }]).png().toFile(file);
  console.log("laget", file);
}

// Hjemskjerm: telefonen runder hjørnene selv, så disse er firkantede
await icon("public/icons/icon-512.png", 512, 0.64);
await icon("public/icons/icon-192.png", 192, 0.64);
await icon("public/icons/apple-touch-icon.png", 180, 0.64);
// Maskable: Android kan klippe ikonet som en sirkel, så symbolet må være mindre
await icon("public/icons/icon-maskable-512.png", 512, 0.5);
// Fane-ikon og logo inne i appen: avrundede hjørner
// (src/app/icon.png er fjernet: favicon.ico og layout.tsx styrer fane-ikonet)
await icon("public/brand/logo-mark.png", 256, 0.66, 58);

// favicon.ico (16, 32 og 48 px) for Safari og nettlesere som ser etter /favicon.ico.
// ICO-filen pakker inn PNG-bilder, som alle moderne nettlesere støtter.
{
  const sizes = [16, 32, 48];
  const pngs = [];
  for (const s of sizes) {
    const w = Math.round(s * 0.78);
    const symbol = await sharp("brand/symbol.png").resize({ width: w, height: w, fit: "inside" }).toBuffer();
    const meta = await sharp(symbol).metadata();
    pngs.push(
      await sharp(background(s, Math.round(s * 0.22)))
        .composite([{ input: symbol, left: Math.round((s - meta.width) / 2), top: Math.round((s - meta.height) / 2) }])
        .png()
        .toBuffer(),
    );
  }
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = 6 + 16 * sizes.length;
  const entries = sizes.map((s, i) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(s, 0);
    e.writeUInt8(s, 1);
    e.writeUInt16LE(1, 4); // fargeplan
    e.writeUInt16LE(32, 6); // bit per piksel
    e.writeUInt32LE(pngs[i].length, 8);
    e.writeUInt32LE(offset, 12);
    offset += pngs[i].length;
    return e;
  });
  const { writeFile } = await import("node:fs/promises");
  await writeFile("public/favicon.ico", Buffer.concat([header, ...entries, ...pngs]));
  console.log("laget public/favicon.ico");
}

// iPhone ser også etter /apple-touch-icon.png direkte
await icon("public/apple-touch-icon.png", 180, 0.64);
