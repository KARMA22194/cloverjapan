// Logo = Kleeblatt-Silhouette. Als CSS-Maske umgesetzt, damit die (weiße) Form
// themenabhängig eingefärbt werden kann: dunkel auf hellem, weiß auf dunklem Grund.
const RATIO = 401 / 390; // Maße von public/brand/clover.png

export function Logo({
  height = 32,
  className = "",
}: {
  height?: number;
  priority?: boolean; // beibehalten für bestehende Aufrufer; hier ohne Wirkung
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label="Logo"
      className={`inline-block bg-slate-900 dark:bg-white ${className}`}
      style={{
        width: Math.round(height * RATIO),
        height,
        WebkitMaskImage: "url(/brand/clover.png)",
        maskImage: "url(/brand/clover.png)",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}
