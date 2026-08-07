/**
 * Verkleinert ein Bild client-seitig zu einer Data-URL.
 * - `max`: längste Kante in px.
 * - `square`: mittig auf ein max×max-Quadrat beschneiden (z. B. Avatar).
 * - `type`: Ziel-Format. Default JPEG (klein). **`image/png` für freigestellte
 *   Bilder** — JPEG kennt keinen Alphakanal, transparente Flächen würden beim
 *   Export schwarz. Genau das brauchen die eigenen Bereichs-Symbole.
 */
export function resizeImage(
  file: File,
  {
    max,
    quality = 0.8,
    square = false,
    type = "image/jpeg",
  }: { max: number; quality?: number; square?: boolean; type?: "image/jpeg" | "image/png" },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const img = document.createElement("img");
      img.onerror = () => reject(new Error("img"));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("ctx"));
        if (square) {
          canvas.width = max;
          canvas.height = max;
          const scale = Math.max(max / img.width, max / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          ctx.drawImage(img, (max - w) / 2, (max - h) / 2, w, h);
        } else {
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }
        resolve(canvas.toDataURL(type, quality));

      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/* ------------------------------------------------------------------ *
 *  Bereichs-Symbole
 * ------------------------------------------------------------------ */

/** Grenze der Arbeitsfläche beim Analysieren — schützt vor 8000-px-Uploads. */
const WORK_MAX = 512;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Bounding-Box des sichtbaren Motivs.
 *
 * Zwei Fälle, weil beide vorkommen:
 *  - **freigestelltes PNG** → alles mit `alpha > 16` zählt als Motiv,
 *  - **JPEG/PNG mit Vollton-Rand** (typisch weiß) → die Ecken liefern die
 *    Hintergrundfarbe, alles hinreichend Abweichende zählt als Motiv.
 */
function contentBox(data: Uint8ClampedArray, w: number, h: number): Box {
  const at = (x: number, y: number) => (y * w + x) * 4;

  // Hat das Bild überhaupt Transparenz?
  let transparent = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) {
      transparent = true;
      break;
    }
  }

  // Hintergrundfarbe aus den vier Ecken (Median-artig: der häufigste Eckwert).
  const corners = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)];
  const bg = { r: 0, g: 0, b: 0 };
  for (const c of corners) {
    bg.r += data[c] / 4;
    bg.g += data[c + 1] / 4;
    bg.b += data[c + 2] / 4;
  }
  // Weichen die Ecken stark voneinander ab, gibt es keinen einheitlichen Rand —
  // dann lieber gar nicht nach Farbe beschneiden (sonst frisst es das Motiv an).
  const cornersAgree = corners.every(
    (c) =>
      Math.abs(data[c] - bg.r) < 12 &&
      Math.abs(data[c + 1] - bg.g) < 12 &&
      Math.abs(data[c + 2] - bg.b) < 12,
  );

  const isContent = (i: number) => {
    if (transparent) return data[i + 3] > 16;
    if (!cornersAgree) return true;
    return (
      Math.abs(data[i] - bg.r) + Math.abs(data[i + 1] - bg.g) + Math.abs(data[i + 2] - bg.b) > 36
    );
  };

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isContent(at(x, y))) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  // Nichts gefunden (leeres Bild) → alles nehmen, statt eine 0×0-Fläche zu liefern.
  if (maxX < 0) return { x: 0, y: 0, w, h };
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Bereitet ein Bild als **Bereichs-Symbol** auf.
 *
 * Warum eigens und nicht `resizeImage`: ein bloßes Verkleinern nimmt den leeren
 * Rand mit. Gemessen an einem 512×512-PNG mit 64×64-Motiv blieb das Motiv nach
 * der Verkleinerung **8×8 px** groß — auf einer 22-px-Kachel also unter 3 px.
 * Genau deshalb war „das Bild ist zu klein, man erkennt nichts".
 *
 * Deshalb hier: **freistellen** (Rand wegschneiden), dann so skalieren, dass die
 * längere Kante die volle Zielgröße einnimmt. Das Seitenverhältnis bleibt — ein
 * breites Logo bleibt breit und wird nicht beschnitten; die Anzeige darf dafür
 * breiter als hoch werden (siehe `SectionIcon`).
 *
 * Format: **PNG** wenn das Bild Transparenz hat (freigestelltes Motiv soll sie
 * behalten), sonst **JPEG** — das ist bei Fotos um ein Vielfaches kleiner und
 * hält die Data-URL unter dem Größenlimit.
 */
export function prepareSectionIcon(file: File, max: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const img = document.createElement("img");
      img.onerror = () => reject(new Error("img"));
      img.onload = () => {
        const scale = Math.min(1, WORK_MAX / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));

        const work = document.createElement("canvas");
        work.width = w;
        work.height = h;
        const wctx = work.getContext("2d", { willReadFrequently: true });
        if (!wctx) return reject(new Error("ctx"));
        wctx.drawImage(img, 0, 0, w, h);

        const box = contentBox(wctx.getImageData(0, 0, w, h).data, w, h);
        // Winziger Rand, damit das Motiv die Kante nicht berührt.
        const pad = Math.round(Math.max(box.w, box.h) * 0.03);
        const x = Math.max(0, box.x - pad);
        const y = Math.max(0, box.y - pad);
        const bw = Math.min(w - x, box.w + 2 * pad);
        const bh = Math.min(h - y, box.h + 2 * pad);

        // Längere Kante auf `max` — nie hochskalieren, das brächte keine Information.
        const f = Math.min(1, max / Math.max(bw, bh));
        const out = document.createElement("canvas");
        out.width = Math.max(1, Math.round(bw * f));
        out.height = Math.max(1, Math.round(bh * f));
        const octx = out.getContext("2d");
        if (!octx) return reject(new Error("ctx"));
        octx.imageSmoothingEnabled = true;
        octx.imageSmoothingQuality = "high";
        octx.drawImage(work, x, y, bw, bh, 0, 0, out.width, out.height);

        // Transparenz im Ergebnis? Dann PNG, sonst das deutlich kleinere JPEG.
        const px = octx.getImageData(0, 0, out.width, out.height).data;
        let hasAlpha = false;
        for (let i = 3; i < px.length; i += 4) {
          if (px[i] < 250) {
            hasAlpha = true;
            break;
          }
        }
        resolve(out.toDataURL(hasAlpha ? "image/png" : "image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
