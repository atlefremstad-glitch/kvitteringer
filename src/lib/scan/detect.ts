/**
 * Finner kvitteringens fire hjørner i et bilde (ren JS, ingen biblioteker).
 *
 * Bildet skaleres ned til ~500 px før det sendes hit. Vi prøver to metoder og
 * velger den som ser mest ut som et papirark:
 *  A) Lyse piksler (Otsu-terskel): hvitt papir på mørkere bord.
 *  B) Kanter (Sobel): papir på lyst bord, der kanten likevel synes. Vi fyller
 *     bakgrunnen fra bildekanten og stopper ved kantlinjer; resten er papiret.
 * Fra området som vinner, tar vi den konvekse innhyllingen og den firkanten
 * med størst areal innenfor den.
 */

export type Point = { x: number; y: number };
/** Rekkefølge: øverst venstre, øverst høyre, nederst høyre, nederst venstre. */
export type Quad = [Point, Point, Point, Point];

export function toGray(data: Uint8ClampedArray, w: number, h: number): Float32Array {
  const g = new Float32Array(w * h);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) {
    g[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  return g;
}

function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const xx = x + k;
        if (xx >= 0 && xx < w) {
          s += src[y * w + xx];
          n++;
        }
      }
      tmp[y * w + x] = s / n;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const yy = y + k;
        if (yy >= 0 && yy < h) {
          s += tmp[yy * w + x];
          n++;
        }
      }
      out[y * w + x] = s / n;
    }
  }
  return out;
}

function otsu(g: Float32Array): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < g.length; i++) hist[Math.min(255, Math.max(0, Math.round(g[i])))]++;
  const total = g.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

type Component = { pixels: number; boundary: Point[]; touchesBorder: number };

/** Største sammenhengende område der mask[i] === 1 (4-naboskap). */
function components(mask: Uint8Array, w: number, h: number, skipBorderTouching: boolean): Component | null {
  const label = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  let best: Component | null = null;
  let next = 1;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || label[start]) continue;
    const id = next++;
    let sp = 0;
    stack[sp++] = start;
    label[start] = id;
    let pixels = 0;
    let touches = 0;
    const boundary: Point[] = [];
    while (sp > 0) {
      const i = stack[--sp];
      pixels++;
      const x = i % w;
      const y = (i - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touches++;
      let edge = false;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const j of nb) {
        if (j < 0 || !mask[j]) {
          edge = true;
          continue;
        }
        if (!label[j]) {
          label[j] = id;
          stack[sp++] = j;
        }
      }
      if (edge) boundary.push({ x: x + 0.5, y: y + 0.5 });
    }
    // Et område som dekker mye av bildekanten, er bakgrunnen, ikke papiret.
    if (skipBorderTouching && touches > 2 * (w + h) * 0.3) continue;
    if (!best || pixels > best.pixels) best = { pixels, boundary, touchesBorder: touches };
  }
  return best;
}

function cross(o: Point, a: Point, b: Point) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function convexHull(points: Point[]): Point[] {
  if (points.length < 3) return points.slice();
  const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function triArea(a: Point, b: Point, c: Point) {
  return Math.abs(cross(a, b, c)) / 2;
}

export function quadArea(q: Point[]) {
  let s = 0;
  for (let i = 0; i < q.length; i++) {
    const a = q[i];
    const b = q[(i + 1) % q.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Firkanten med størst areal med hjørner på innhyllingen. */
function largestQuad(hull: Point[]): Point[] | null {
  let pts = hull;
  if (pts.length < 4) return null;
  if (pts.length > 120) {
    const step = pts.length / 120;
    pts = Array.from({ length: 120 }, (_, k) => hull[Math.floor(k * step)]);
  }
  const n = pts.length;
  let best = -1;
  let bestQ: Point[] | null = null;
  for (let i = 0; i < n; i++) {
    for (let k = i + 2; k < n; k++) {
      let a1 = -1;
      let j1 = -1;
      for (let j = i + 1; j < k; j++) {
        const a = triArea(pts[i], pts[j], pts[k]);
        if (a > a1) {
          a1 = a;
          j1 = j;
        }
      }
      let a2 = -1;
      let l2 = -1;
      for (let l = k + 1; l < n + i; l++) {
        const p = pts[l % n];
        const a = triArea(pts[k], p, pts[i]);
        if (a > a2) {
          a2 = a;
          l2 = l % n;
        }
      }
      if (j1 < 0 || l2 < 0) continue;
      if (a1 + a2 > best) {
        best = a1 + a2;
        bestQ = [pts[i], pts[j1], pts[k], pts[l2]];
      }
    }
  }
  return bestQ;
}

/** Sorterer fire punkter som øverst venstre, øverst høyre, nederst høyre, nederst venstre. */
export function orderQuad(pts: Point[]): Quad {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const sorted = pts.slice().sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  // Etter vinkelsortering går punktene med klokka (y peker ned). Start i øverst venstre.
  let start = 0;
  for (let i = 1; i < 4; i++) {
    if (sorted[i].x + sorted[i].y < sorted[start].x + sorted[start].y) start = i;
  }
  return [0, 1, 2, 3].map((k) => sorted[(start + k) % 4]) as Quad;
}

export function fullQuad(w: number, h: number, inset = 0): Quad {
  const dx = w * inset;
  const dy = h * inset;
  return [
    { x: dx, y: dy },
    { x: w - dx, y: dy },
    { x: w - dx, y: h - dy },
    { x: dx, y: h - dy },
  ];
}

function candidate(comp: Component | null, w: number, h: number) {
  if (!comp || comp.boundary.length < 4) return null;
  const quad = largestQuad(convexHull(comp.boundary));
  if (!quad) return null;
  const area = quadArea(quad);
  const frac = area / (w * h);
  if (frac < 0.08 || frac > 0.985) return null;
  // Hvor godt fyller området firkanten? Papir ≈ 1, rot < 0,6.
  const fill = Math.min(1, comp.pixels / area);
  if (fill < 0.55) return null;
  return { quad, score: frac * fill * fill };
}

/**
 * Finner kvitteringen. Returnerer null hvis ingen troverdig firkant ble funnet.
 * `rgba` er bildedata fra et lite canvas (ca. 500 px på lengste side).
 */
export function detectQuad(rgba: Uint8ClampedArray, w: number, h: number): Quad | null {
  const gray = boxBlur(toGray(rgba, w, h), w, h, 2);

  // A) Lyst papir.
  const t = otsu(gray);
  const bright = new Uint8Array(w * h);
  for (let i = 0; i < gray.length; i++) bright[i] = gray[i] > t ? 1 : 0;
  const a = candidate(components(bright, w, h, true), w, h);

  // B) Kanter. Området innenfor papirkanten er en «øy» uten kanter.
  const mag = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1] - gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1];
      const gy =
        gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1] - gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1];
      mag[i] = Math.hypot(gx, gy);
    }
  }
  const sortedMag = Array.from(mag).sort((x, y) => x - y);
  const edgeT = Math.max(15, sortedMag[Math.floor(sortedMag.length * 0.85)]);
  const open = new Uint8Array(w * h); // 1 = ikke kant (etter utvidelse av kantene)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let e = 0;
      for (let dy = -1; dy <= 1 && !e; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h && mag[yy * w + xx] > edgeT) {
            e = 1;
            break;
          }
        }
      }
      open[y * w + x] = e ? 0 : 1;
    }
  }
  // Fyll bakgrunnen fra bildekanten; det som ikke nås (innenfor papirkanten) er papiret.
  const bg = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let sp = 0;
  const seed = (i: number) => {
    if (open[i] && !bg[i]) {
      bg[i] = 1;
      stack[sp++] = i;
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (sp > 0) {
    const i = stack[--sp];
    const x = i % w;
    if (x > 0) seed(i - 1);
    if (x < w - 1) seed(i + 1);
    if (i >= w) seed(i - w);
    if (i < w * (h - 1)) seed(i + w);
  }
  const fg = new Uint8Array(w * h);
  for (let i = 0; i < fg.length; i++) fg[i] = bg[i] ? 0 : 1;
  const b = candidate(components(fg, w, h, true), w, h);
  // Utvidede kanter gjør B-firkanten et par piksler for stor: trekk hjørnene litt inn.
  if (b) {
    const cx = b.quad.reduce((s, p) => s + p.x, 0) / 4;
    const cy = b.quad.reduce((s, p) => s + p.y, 0) / 4;
    b.quad = b.quad.map((p) => {
      const d = Math.hypot(p.x - cx, p.y - cy) || 1;
      return { x: p.x - ((p.x - cx) / d) * 2, y: p.y - ((p.y - cy) / d) * 2 };
    });
  }

  // Er begge enige, er A (lyse piksler) mest nøyaktig langs papirkanten.
  if (a && b) {
    const qa = orderQuad(a.quad);
    const qb = orderQuad(b.quad);
    const tol = Math.hypot(w, h) * 0.04;
    if (qa.every((p, i) => Math.hypot(p.x - qb[i].x, p.y - qb[i].y) < tol)) return qa;
  }
  const best = [a, b].filter((c): c is NonNullable<typeof c> => !!c).sort((p, q) => q.score - p.score)[0];
  return best ? orderQuad(best.quad) : null;
}
