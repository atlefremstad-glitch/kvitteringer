import type { Quad } from "./detect";

export type Pixels = { data: Uint8ClampedArray; width: number; height: number };

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Størrelsen på det rettede bildet, med lengste side maks `maxSide`. */
export function outputSize(q: Quad, maxSide: number) {
  const w = Math.max(dist(q[0], q[1]), dist(q[3], q[2]));
  const h = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
  const s = Math.min(1, maxSide / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) };
}

/**
 * Perspektivretting: strekker firkanten `q` i kildebildet ut til et rektangel.
 * Avbildning fra enhetskvadrat til firkant (Heckbert), bilineær sampling.
 */
export function warpQuad(src: Pixels, q: Quad, width: number, height: number): Pixels {
  const [p0, p1, p2, p3] = q;
  const sx = p0.x - p1.x + p2.x - p3.x;
  const sy = p0.y - p1.y + p2.y - p3.y;
  let a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number;
  if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) {
    a = p1.x - p0.x;
    b = p2.x - p1.x;
    c = p0.x;
    d = p1.y - p0.y;
    e = p2.y - p1.y;
    f = p0.y;
    g = 0;
    h = 0;
  } else {
    const dx1 = p1.x - p2.x;
    const dx2 = p3.x - p2.x;
    const dy1 = p1.y - p2.y;
    const dy2 = p3.y - p2.y;
    const den = dx1 * dy2 - dx2 * dy1;
    g = (sx * dy2 - dx2 * sy) / den;
    h = (dx1 * sy - sx * dy1) / den;
    a = p1.x - p0.x + g * p1.x;
    b = p3.x - p0.x + h * p3.x;
    c = p0.x;
    d = p1.y - p0.y + g * p1.y;
    e = p3.y - p0.y + h * p3.y;
    f = p0.y;
  }

  const out = new Uint8ClampedArray(width * height * 4);
  const sw = src.width;
  const sh = src.height;
  const sd = src.data;
  for (let y = 0; y < height; y++) {
    const v = (y + 0.5) / height;
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      const den = g * u + h * v + 1;
      let fx = (a * u + b * v + c) / den - 0.5;
      let fy = (d * u + e * v + f) / den - 0.5;
      if (fx < 0) fx = 0;
      if (fy < 0) fy = 0;
      if (fx > sw - 1) fx = sw - 1;
      if (fy > sh - 1) fy = sh - 1;
      const x0 = fx | 0;
      const y0 = fy | 0;
      const x1 = x0 < sw - 1 ? x0 + 1 : x0;
      const y1 = y0 < sh - 1 ? y0 + 1 : y0;
      const ax = fx - x0;
      const ay = fy - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      const o = (y * width + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const top = sd[i00 + ch] + (sd[i10 + ch] - sd[i00 + ch]) * ax;
        const bot = sd[i01 + ch] + (sd[i11 + ch] - sd[i01 + ch]) * ax;
        out[o + ch] = top + (bot - top) * ay;
      }
      out[o + 3] = 255;
    }
  }
  return { data: out, width, height };
}

/**
 * «Dokument»-filter som i skanner-apper: gjør papiret hvitt og teksten skarp.
 * Deler hver piksel på et estimat av lokal papirfarge (fjerner skygger og
 * ujevnt lys), og øker kontrasten.
 */
export function enhanceDocument(img: Pixels): Pixels {
  const { width: w, height: h, data } = img;
  const L = new Float32Array(w * h);
  for (let i = 0, p = 0; i < L.length; i++, p += 4) {
    L[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }

  // Bakgrunn: lyseste verdi i hver blokk, så glattet.
  const B = Math.max(8, Math.round(Math.max(w, h) / 50));
  const gw = Math.ceil(w / B);
  const gh = Math.ceil(h / B);
  let grid = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      // 90-persentil i stedet for maks, så støy og blank refleks ikke slår ut.
      const vals: number[] = [];
      for (let y = gy * B; y < Math.min(h, (gy + 1) * B); y += 2) {
        for (let x = gx * B; x < Math.min(w, (gx + 1) * B); x += 2) vals.push(L[y * w + x]);
      }
      vals.sort((m, n) => m - n);
      grid[gy * gw + gx] = vals[Math.floor(vals.length * 0.9)] ?? 255;
    }
  }
  // Blokker som er helt dekket av tekst/logo er mørke: ta maks av naboene, så glatt.
  for (let pass = 0; pass < 2; pass++) {
    const next = new Float32Array(gw * gh);
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        let m = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = gx + dx;
            const yy = gy + dy;
            if (xx >= 0 && yy >= 0 && xx < gw && yy < gh) m = Math.max(m, grid[yy * gw + xx]);
          }
        }
        next[gy * gw + gx] = m;
      }
    }
    grid = next;
  }
  for (let pass = 0; pass < 2; pass++) {
    const next = new Float32Array(gw * gh);
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        let s = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = gx + dx;
            const yy = gy + dy;
            if (xx >= 0 && yy >= 0 && xx < gw && yy < gh) {
              s += grid[yy * gw + xx];
              n++;
            }
          }
        }
        next[gy * gw + gx] = s / n;
      }
    }
    grid = next;
  }

  const out = new Uint8ClampedArray(w * h * 4);
  const lo = 0.35; // alt mørkere enn dette (relativt til papiret) blir svart
  const hi = 0.85; // alt lysere blir hvitt
  for (let y = 0; y < h; y++) {
    let gyf = (y + 0.5) / B - 0.5;
    if (gyf < 0) gyf = 0;
    if (gyf > gh - 1) gyf = gh - 1;
    const gy0 = gyf | 0;
    const gy1 = Math.min(gh - 1, gy0 + 1);
    const ty = gyf - gy0;
    for (let x = 0; x < w; x++) {
      let gxf = (x + 0.5) / B - 0.5;
      if (gxf < 0) gxf = 0;
      if (gxf > gw - 1) gxf = gw - 1;
      const gx0 = gxf | 0;
      const gx1 = Math.min(gw - 1, gx0 + 1);
      const tx = gxf - gx0;
      const top = grid[gy0 * gw + gx0] * (1 - tx) + grid[gy0 * gw + gx1] * tx;
      const bot = grid[gy1 * gw + gx0] * (1 - tx) + grid[gy1 * gw + gx1] * tx;
      const bg = Math.max(30, top * (1 - ty) + bot * ty);
      const r = L[y * w + x] / bg;
      let t = (r - lo) / (hi - lo);
      if (t < 0) t = 0;
      if (t > 1) t = 1;
      const v = 255 * t * t * (3 - 2 * t); // myk S-kurve
      const o = (y * w + x) * 4;
      out[o] = v;
      out[o + 1] = v;
      out[o + 2] = v;
      out[o + 3] = 255;
    }
  }
  return { data: out, width: w, height: h };
}
