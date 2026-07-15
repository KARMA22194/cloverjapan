/**
 * Verkleinert ein Bild client-seitig zu einer JPEG-Data-URL.
 * - `max`: längste Kante in px.
 * - `square`: mittig auf ein max×max-Quadrat beschneiden (z. B. Avatar).
 */
export function resizeImage(
  file: File,
  { max, quality = 0.8, square = false }: { max: number; quality?: number; square?: boolean },
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
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
